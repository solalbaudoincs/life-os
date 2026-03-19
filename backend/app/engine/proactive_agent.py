"""LLM-driven proactive agent for web scouting, enrichment, and cross-module analysis."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid as uuid_mod

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.engine.proactive_executor import execute_proactive_tool
from app.engine.proactive_tools import generate_proactive_tools
from app.models.module import Module
from app.models.user_profile import UserProfile
from app.schemas.module_schema import FieldDefinition
from app.services.mistral_client import chat_with_tools

logger = logging.getLogger(__name__)

# Retry config
_MAX_RETRIES = 5
_BASE_DELAY = 2.0  # seconds
_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def _is_retryable(exc: Exception) -> bool:
    """Check if an exception is a retryable API error (429, 5xx)."""
    msg = str(exc)
    # Look for HTTP status codes in the error message
    match = re.search(r"Status (\d{3})", msg)
    if match:
        return int(match.group(1)) in _RETRYABLE_STATUS_CODES
    # Also check for common retryable error patterns
    lower = msg.lower()
    return "rate limit" in lower or "too many requests" in lower or "service unavailable" in lower


def _get_retry_after(exc: Exception) -> float | None:
    """Try to extract a Retry-After hint from the error."""
    msg = str(exc)
    match = re.search(r"[Rr]etry.?[Aa]fter[\":\s]+(\d+\.?\d*)", msg)
    if match:
        return float(match.group(1))
    return None

PROACTIVE_SYSTEM_PROMPT = """You are a proactive agent for Life OS, a personal life management system.
Your job is to execute a specific action on behalf of the user — searching the web, analyzing notes, or finding connections.

**User profile:**
{user_profile}

**Target module:** {module_name} ({module_display_name})
- Description: {module_description}
- Fields: {module_fields}
- Status lifecycle: {module_lifecycle}

**All modules in the system:** {all_modules_summary}

**Your mission:** {mission}

**Rules:**
1. ALWAYS call the `think` tool first to plan your approach, and between steps to log your reasoning and analysis. This helps the user understand your decision-making process.
2. NEVER create notes directly. Always use `create_suggestion` so the user can review.
3. Use `search_notes` to check for duplicates before creating suggestions.
4. Only create suggestions with confidence > 0.7.
5. Be aggressive about filtering — quality over quantity.
6. Keep summaries concise (1-2 sentences).
7. `proposed_payload` must be COMPLETE — include title, content_md, and all metadata fields.
8. When creating proposed_payload for create_note, structure it as: {{"title": "...", "content_md": "...", "metadata": {{...field values...}}}}
9. Use the module's field definitions to populate metadata correctly (use valid enum values, proper date formats, etc.).
10. Use `get_note` to read a note's full content when you need details for enrichment or analysis.
11. Use `list_{{module_name}}` (e.g. `list_jobs`) to enumerate notes in any module.
"""


def _build_mission(action_type: str, action_config: dict) -> str:
    """Build the mission description from action config."""
    name = action_config.get("name", action_type)
    desc = action_config.get("description", "")
    config = action_config.get("config", {})

    if action_type == "web_search":
        queries = config.get("queries", [])
        query_hint = f" Suggested queries: {', '.join(queries)}" if queries else ""
        return (
            f"Execute the '{name}' action: {desc}.{query_hint} "
            f"Search the web for relevant results, evaluate each against the user's profile, "
            f"and create suggestions for promising finds. Check existing notes to avoid duplicates."
        )
    elif action_type == "enrichment":
        return (
            f"Execute the '{name}' action: {desc}. "
            f"Search for additional information about existing notes in this module. "
            f"Look for updates, new details, or supplementary data. "
            f"Create update suggestions for notes that could benefit from enrichment."
        )
    elif action_type == "internal_scan":
        return (
            f"Execute the '{name}' action: {desc}. "
            f"Analyze notes across all modules to find connections, patterns, or insights. "
            f"Use search_notes to explore different modules and identify relationships."
        )
    return f"Execute the '{name}' action: {desc}"


async def run_proactive_action(
    module: Module,
    action: dict,
    user_profile: dict,
    all_modules: list[Module],
    db: AsyncSession,
) -> list[str]:
    """Run a proactive action using the LLM agent loop. Returns suggestion IDs created."""
    from app.engine import activity_tracker as tracker

    action_type = action.get("type", "web_search")
    action_id = action.get("id", "unknown")
    action_name = action.get("name", action_id)
    run_id = str(uuid_mod.uuid4())
    max_rounds = settings.PROACTIVE_MAX_ROUNDS

    # Build tool list: base proactive tools + per-module list tools + action-scoped MCP tools
    modules_for_tools = [
        {"name": m.name, "display_name": m.display_name, "status_lifecycle": m.status_lifecycle or []}
        for m in all_modules
    ]
    tools = generate_proactive_tools(modules_for_tools)
    mcp_server_names = action.get("mcp_servers", [])
    if mcp_server_names:
        from app.engine.mcp_manager import mcp_manager
        tools = tools + mcp_manager.get_tools_for_servers(mcp_server_names)

    # Track: start
    try:
        await tracker.start_run(
            run_id=run_id,
            module_name=module.name,
            module_display_name=module.display_name,
            action_id=action_id,
            action_name=action_name,
            action_type=action_type,
            max_rounds=max_rounds,
            module_id=str(module.id),
        )
    except Exception:
        logger.debug("Activity tracker start_run failed", exc_info=True)

    # Build module info
    fields = [FieldDefinition.model_validate(f) for f in module.fields_schema]
    field_desc = ", ".join(f"{f.name} ({f.type.value})" + (f" [{', '.join(f.values)}]" if f.values else "") for f in fields)
    lifecycle = " → ".join(module.status_lifecycle) if module.status_lifecycle else "none"

    # Build all-modules summary
    mod_lines = []
    for m in all_modules:
        fnames = ", ".join(f.get("name", "") for f in m.fields_schema)
        mod_lines.append(f"- {m.display_name} ({m.name}): fields=[{fnames}]")
    all_mods = "\n".join(mod_lines) if mod_lines else "No other modules."

    mission = _build_mission(action_type, action)

    # Append MCP tool info if any servers are granted
    if mcp_server_names:
        from app.engine.mcp_manager import mcp_manager
        mcp_tools = mcp_manager.get_tools_for_servers(mcp_server_names)
        mcp_tool_names = [t["function"]["name"] for t in mcp_tools]
        if mcp_tool_names:
            mission += f"\n\nYou also have access to these external MCP tools: {', '.join(mcp_tool_names)}. Use them when relevant to your mission."

    system_prompt = PROACTIVE_SYSTEM_PROMPT.format(
        user_profile=json.dumps(user_profile, indent=2) if user_profile else "No profile set.",
        module_name=module.name,
        module_display_name=module.display_name,
        module_description=module.description,
        module_fields=field_desc,
        module_lifecycle=lifecycle,
        all_modules_summary=all_mods,
        mission=mission,
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Execute the '{action_name}' action now."},
    ]

    suggestion_ids: list[str] = []

    for round_num in range(max_rounds):
        # Track: round
        try:
            await tracker.update_round(run_id, round_num + 1)
        except Exception:
            pass

        resp = None
        for attempt in range(_MAX_RETRIES):
            try:
                resp = await chat_with_tools(
                    messages, tools, model=settings.PROACTIVE_MODEL
                )
                break  # success
            except Exception as e:
                if attempt < _MAX_RETRIES - 1 and _is_retryable(e):
                    retry_after = _get_retry_after(e)
                    delay = retry_after if retry_after else _BASE_DELAY * (2 ** attempt)
                    logger.warning(
                        "Proactive agent LLM call failed (round %d, attempt %d/%d), retrying in %.1fs: %s",
                        round_num + 1, attempt + 1, _MAX_RETRIES, delay, e,
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error("Proactive agent LLM call failed (round %d): %s", round_num + 1, e)
                    try:
                        await tracker.finish_run(run_id, len(suggestion_ids), error=str(e))
                    except Exception:
                        pass
                    resp = None
                    break

        if resp is None:
            break

        choice = resp.choices[0]
        msg = choice.message

        if msg.tool_calls:
            messages.append(msg.model_dump())

            # Extract reasoning: from msg.content (if model sends it) or from think tool calls
            reasoning_text = (msg.content or "").strip() or None
            if not reasoning_text:
                for tc in msg.tool_calls:
                    if tc.function.name == "think":
                        try:
                            think_args = json.loads(tc.function.arguments)
                            reasoning_text = think_args.get("thought", "")
                        except json.JSONDecodeError:
                            pass
                        break

            for tc_i, tc in enumerate(msg.tool_calls):
                fn_name = tc.function.name
                try:
                    fn_args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    fn_args = {}

                # Inject the action_id for tracking
                if fn_name == "create_suggestion":
                    fn_args["_action_id"] = action_id

                # Track: tool call start
                # Attach reasoning to the think tool call itself, or first non-think call
                is_think = fn_name == "think"
                tc_idx = -1
                try:
                    tc_idx = await tracker.log_tool_call_start(
                        run_id, fn_name, fn_args, round_num + 1,
                        reasoning=reasoning_text if is_think else None,
                    )
                except Exception:
                    pass

                logger.info("Proactive tool call: %s(%s)", fn_name, json.dumps(fn_args)[:200])
                result = await execute_proactive_tool(fn_name, fn_args, module, db)

                # Track: tool call end
                try:
                    await tracker.log_tool_call_end(run_id, tc_idx, result)
                except Exception:
                    pass

                # Track created suggestions
                try:
                    result_data = json.loads(result)
                    if result_data.get("status") == "created" and "suggestion_id" in result_data:
                        suggestion_ids.append(result_data["suggestion_id"])
                except (json.JSONDecodeError, AttributeError):
                    pass

                messages.append({
                    "role": "tool",
                    "name": fn_name,
                    "content": result,
                    "tool_call_id": tc.id,
                })

            continue

        # LLM responded with text — done
        logger.info(
            "Proactive agent finished for %s/%s: %d suggestions created. Final message: %s",
            module.name, action_id, len(suggestion_ids), (msg.content or "")[:200],
        )
        break

    # Track: finish
    try:
        await tracker.finish_run(run_id, len(suggestion_ids))
    except Exception:
        pass

    await db.commit()
    return suggestion_ids
