"""The core agent loop: system prompt, tool calling, multi-turn execution."""

from __future__ import annotations

import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.confirmation import is_dangerous, get_confirmation_info
from app.engine.tool_executor import execute_tool_call
from app.engine.tool_generator import generate_all_tools
from app.models.module import Module
from app.models.note import Note
from app.schemas.module_schema import FieldDefinition
from app.services.mistral_client import chat_with_tools, stream_with_tools

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 8

SYSTEM_PROMPT = """You are the AI agent for Life OS, a personal life management system.

You help the user manage their notes, projects, candidatures, ideas, and more.

Active modules:
{modules_summary}

Connected MCP integrations:
{mcp_tools_summary}

## Your capabilities

You have direct access to these tools — use them immediately when relevant:

**Notes:** create_{{module}}, update_{{module}}, list_{{module}}, get_note, delete_note, search_notes
**Modules:** list_modules, create_module, update_module, delete_module (requires user confirmation)
**Web:** web_search (search the internet), fetch_page (read a URL)
**Suggestions:** list_suggestions, accept_suggestion, reject_suggestion, snooze_suggestion
**Profile:** get_profile, update_profile
**Proactive:** trigger_scan (run a proactive scan now)
**MCP:** Any tool prefixed with mcp__ from connected integrations

## Rules

1. When the user asks you to create or update something, use the appropriate tool.
2. When listing or searching, use the tools and summarize the results naturally.
3. Be concise. After performing actions, briefly confirm what you did.
4. If the user's intent is ambiguous, ask for clarification.
5. You can chain multiple tool calls in one turn if needed.
6. **When the user asks you to search the web, look something up, or find information online — call the `web_search` tool directly.** You can also use `fetch_page` to read a specific URL. Do NOT suggest creating modules or MCP servers for one-time web lookups.
7. When the user wants to create a new module:
   - Gather what they want to track (fields, lifecycle, proactive actions, alerts).
   - Then call `preview_module` to show them a visual preview of the proposed module.
   - Ask for their approval or adjustments.
   - Only call `create_module` after they confirm the preview.
   - After creating, let the user know it's ready in the sidebar.
8. delete_module permanently removes a module and ALL its notes. Only use when explicitly requested.
9. Use update_module to change a module's configuration (fields, lifecycle, alerts, actions, display name, icon).
10. Use get_profile / update_profile to remember things about the user.
"""


async def _load_modules(db: AsyncSession) -> list[dict]:
    """Load all modules and return them as dicts for tool generation."""
    rows = (await db.execute(select(Module).order_by(Module.sort_order))).scalars().all()
    modules = []
    for m in rows:
        modules.append({
            "id": str(m.id),
            "name": m.name,
            "display_name": m.display_name,
            "description": m.description,
            "fields": [FieldDefinition.model_validate(f) for f in m.fields_schema],
            "status_lifecycle": m.status_lifecycle or [],
        })
    return modules


def _build_modules_summary(modules: list[dict]) -> str:
    lines = []
    for m in modules:
        field_names = ", ".join(f.name for f in m["fields"])
        lifecycle = " → ".join(m["status_lifecycle"]) if m["status_lifecycle"] else "none"
        lines.append(f"- {m['display_name']} ({m['name']}): fields=[{field_names}], lifecycle=[{lifecycle}]")
    return "\n".join(lines) if lines else "No modules yet."


def _build_mcp_summary() -> str:
    from app.engine.mcp_manager import mcp_manager
    server_info = mcp_manager.get_server_info()
    if not server_info:
        return "None configured."
    lines = []
    for s in server_info:
        tool_names = ", ".join(s["tools"]) if s["tools"] else "no tools loaded"
        lines.append(f"- {s['display_name']} ({s['name']}): {tool_names}")
    return "\n".join(lines)


async def _build_confirmation_details(
    tool_name: str, arguments: dict, db: AsyncSession
) -> dict:
    """Build human-readable details for the confirmation dialog."""
    if tool_name == "delete_module":
        from sqlalchemy import func, select
        module_name = arguments.get("module_name", "")
        mod = await _get_module_by_name(module_name, db)
        if mod:
            count_result = await db.execute(
                select(func.count()).where(Note.module_id == mod.id)
            )
            note_count = count_result.scalar() or 0
            return {
                "Module": mod.display_name,
                "Module name": mod.name,
                "Notes that will be deleted": note_count,
            }
        return {"Module": module_name}
    return arguments


async def _get_module_by_name(name: str, db: AsyncSession) -> Module | None:
    result = await db.execute(select(Module).where(Module.name == name))
    return result.scalar_one_or_none()


async def run_agent(
    user_message: str,
    chat_history: list[dict],
    db: AsyncSession,
    confirmed_tool: dict | None = None,
    resume_messages: list[dict] | None = None,
) -> dict:
    """Run the agent loop.

    Returns:
        - {"status": "complete", "response": str, "tool_calls": list} on normal completion
        - {"status": "pending_confirmation", "pending_tool": dict, "confirmation_info": dict,
           "tool_calls": list, "messages_snapshot": list} when a dangerous tool needs confirmation
    """

    modules = await _load_modules(db)
    tools = generate_all_tools(modules)

    # Merge MCP tools from all enabled servers
    from app.engine.mcp_manager import mcp_manager
    tools = tools + mcp_manager.get_all_tools()

    # If resuming after confirmation, restore messages; otherwise build fresh
    if resume_messages is not None:
        messages = resume_messages
    else:
        system_prompt = SYSTEM_PROMPT.format(
            modules_summary=_build_modules_summary(modules),
            mcp_tools_summary=_build_mcp_summary(),
        )
        messages = [
            {"role": "system", "content": system_prompt},
            *chat_history,
            {"role": "user", "content": user_message},
        ]

    tool_calls_made: list[dict] = []

    # If resuming after confirmation, execute the confirmed tool first
    if confirmed_tool and resume_messages is not None:
        fn_name = confirmed_tool["name"]
        fn_args = confirmed_tool["arguments"]
        tc_id = confirmed_tool.get("tool_call_id", "confirmed")

        logger.info(f"Confirmed tool call: {fn_name}({fn_args})")
        result = await execute_tool_call(fn_name, fn_args, db)

        tool_calls_made.append({
            "name": fn_name,
            "arguments": fn_args,
            "result": _safe_parse_result(result),
        })

        messages.append({
            "role": "tool",
            "name": fn_name,
            "content": result,
            "tool_call_id": tc_id,
        })
        confirmed_tool = None  # consumed

    for _ in range(MAX_TOOL_ROUNDS):
        resp = await chat_with_tools(messages, tools)
        choice = resp.choices[0]
        msg = choice.message

        # If the model wants to call tools
        if msg.tool_calls:
            # Add assistant message with tool calls
            messages.append(msg.model_dump())

            for tc in msg.tool_calls:
                fn_name = tc.function.name
                try:
                    fn_args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    fn_args = {}

                # Check if this is a dangerous tool that needs confirmation
                if is_dangerous(fn_name):
                    # If this is the confirmed tool from a resume, execute it
                    if (
                        confirmed_tool
                        and confirmed_tool.get("name") == fn_name
                        and confirmed_tool.get("arguments") == fn_args
                    ):
                        confirmed_tool = None  # consumed
                    else:
                        # Pause: return pending confirmation
                        conf_info = get_confirmation_info(fn_name)
                        details = await _build_confirmation_details(fn_name, fn_args, db)

                        # Build a serializable snapshot of messages for resume
                        messages_snapshot = _serialize_messages(messages)

                        return {
                            "status": "pending_confirmation",
                            "pending_tool": {
                                "name": fn_name,
                                "arguments": fn_args,
                                "tool_call_id": tc.id,
                            },
                            "confirmation_info": {
                                "tool_name": fn_name,
                                "arguments": fn_args,
                                "title": conf_info.get("title", fn_name),
                                "description": conf_info.get("description", ""),
                                "details": details,
                                "confirm_label": conf_info.get("confirm_label", "Confirm"),
                                "destructive": conf_info.get("destructive", False),
                            },
                            "tool_calls": tool_calls_made,
                            "messages_snapshot": messages_snapshot,
                        }

                logger.info(f"Tool call: {fn_name}({fn_args})")
                result = await execute_tool_call(fn_name, fn_args, db)

                tool_calls_made.append({
                    "name": fn_name,
                    "arguments": fn_args,
                    "result": _safe_parse_result(result),
                })

                messages.append({
                    "role": "tool",
                    "name": fn_name,
                    "content": result,
                    "tool_call_id": tc.id,
                })

            # Continue the loop to let the model process tool results
            continue

        # Model responded with text — we're done
        return {
            "status": "complete",
            "response": msg.content,
            "tool_calls": tool_calls_made,
        }

    # Safety: if we hit max rounds
    return {
        "status": "complete",
        "response": "I've completed several actions. Let me know if you need anything else.",
        "tool_calls": tool_calls_made,
    }


def _safe_parse_result(result: str | dict) -> dict | str:
    """Parse a tool result as JSON if possible, otherwise return as-is."""
    if not isinstance(result, str):
        return result
    try:
        return json.loads(result)
    except (json.JSONDecodeError, ValueError):
        return result


def _serialize_messages(messages: list) -> list[dict]:
    """Convert messages to a JSON-serializable list (handles Mistral model objects)."""
    serialized = []
    for m in messages:
        if isinstance(m, dict):
            serialized.append(m)
        elif hasattr(m, "model_dump"):
            serialized.append(m.model_dump())
        else:
            serialized.append({"role": "system", "content": str(m)})
    return serialized


# ---------------------------------------------------------------------------
# Streaming agent loop
# ---------------------------------------------------------------------------

from collections.abc import AsyncGenerator

from app.engine.json_text_extractor import JSONTextExtractor
from app.schemas.chat import AgentTextResponse


def _sse_event(event_type: str, data: dict) -> str:
    """Format a single SSE data line."""
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload)}\n\n"


async def run_agent_stream(
    user_message: str,
    chat_history: list[dict],
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    """Streaming version of run_agent. Yields SSE-formatted event strings.

    Does NOT support the confirm/cancel resume flow — those continue to use
    the non-streaming ``run_agent`` path.
    """

    modules = await _load_modules(db)
    tools = generate_all_tools(modules)

    from app.engine.mcp_manager import mcp_manager
    tools = tools + mcp_manager.get_all_tools()

    system_prompt = SYSTEM_PROMPT.format(
        modules_summary=_build_modules_summary(modules),
        mcp_tools_summary=_build_mcp_summary(),
    )
    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        *chat_history,
        {"role": "user", "content": user_message},
    ]

    tool_calls_made: list[dict] = []

    for _round in range(MAX_TOOL_ROUNDS):
        # Stream the LLM response for this round
        event_stream = await stream_with_tools(
            messages,
            tools,
            response_format_model=AgentTextResponse,
        )

        accumulated_content = ""
        accumulated_tool_calls: list[dict] = []  # index-based accumulation
        finish_reason = None
        extractor = JSONTextExtractor()

        async for event in event_stream:
            chunk = event.data
            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            delta = choice.delta

            # Text content
            if delta.content and isinstance(delta.content, str):
                accumulated_content += delta.content
                new_text = extractor.feed(delta.content)
                if new_text:
                    yield _sse_event("text_delta", {"delta": new_text})

            # Tool call deltas (accumulated by index)
            if delta.tool_calls:
                for tc_delta in delta.tool_calls:
                    idx = tc_delta.index if tc_delta.index is not None else 0
                    while len(accumulated_tool_calls) <= idx:
                        accumulated_tool_calls.append(
                            {"id": "", "function": {"name": "", "arguments": ""}}
                        )
                    entry = accumulated_tool_calls[idx]
                    if tc_delta.id:
                        entry["id"] = tc_delta.id
                    if tc_delta.function:
                        if tc_delta.function.name:
                            entry["function"]["name"] += tc_delta.function.name
                        if tc_delta.function.arguments:
                            entry["function"]["arguments"] += tc_delta.function.arguments

            if choice.finish_reason:
                finish_reason = choice.finish_reason

        # ---- Round finished: decide what to do ----

        if accumulated_tool_calls:
            # Build the assistant message for the conversation history
            assistant_msg: dict = {
                "role": "assistant",
                "content": accumulated_content or "",
                "tool_calls": [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": tc["function"],
                    }
                    for tc in accumulated_tool_calls
                ],
            }
            messages.append(assistant_msg)

            # Execute each tool
            for tc in accumulated_tool_calls:
                fn_name = tc["function"]["name"]
                try:
                    fn_args = json.loads(tc["function"]["arguments"])
                except json.JSONDecodeError:
                    fn_args = {}

                # Dangerous tool → pause with pending_confirmation
                if is_dangerous(fn_name):
                    conf_info = get_confirmation_info(fn_name)
                    details = await _build_confirmation_details(fn_name, fn_args, db)
                    messages_snapshot = _serialize_messages(messages)

                    yield _sse_event("pending_confirmation", {
                        "tool_calls": tool_calls_made,
                        "pending_confirmation": {
                            "tool_name": fn_name,
                            "arguments": fn_args,
                            "title": conf_info.get("title", fn_name),
                            "description": conf_info.get("description", ""),
                            "details": details,
                            "confirm_label": conf_info.get("confirm_label", "Confirm"),
                            "destructive": conf_info.get("destructive", False),
                        },
                        "pending_tool": {
                            "name": fn_name,
                            "arguments": fn_args,
                            "tool_call_id": tc["id"],
                        },
                        "messages_snapshot": messages_snapshot,
                    })
                    return

                yield _sse_event("tool_start", {"name": fn_name, "arguments": fn_args})

                logger.info(f"Tool call: {fn_name}({fn_args})")
                result = await execute_tool_call(fn_name, fn_args, db)

                parsed_result = _safe_parse_result(result)
                tool_calls_made.append({
                    "name": fn_name,
                    "arguments": fn_args,
                    "result": parsed_result,
                })

                yield _sse_event("tool_end", {
                    "name": fn_name,
                    "arguments": fn_args,
                    "result": parsed_result,
                })

                messages.append({
                    "role": "tool",
                    "name": fn_name,
                    "content": result if isinstance(result, str) else json.dumps(result),
                    "tool_call_id": tc["id"],
                })

            continue  # next round

        # Text response — done
        parsed = extractor.get_full_json()
        if parsed and "text" in parsed:
            final_text = parsed["text"]
            followups = parsed.get("suggested_followups", [])
        else:
            # Fallback: treat accumulated content as plain text
            final_text = accumulated_content
            followups = []

        yield _sse_event("complete", {
            "response": final_text,
            "tool_calls": tool_calls_made,
            "suggested_followups": followups,
        })
        return

    # Max rounds hit
    yield _sse_event("complete", {
        "response": "I've completed several actions. Let me know if you need anything else.",
        "tool_calls": tool_calls_made,
        "suggested_followups": [],
    })
