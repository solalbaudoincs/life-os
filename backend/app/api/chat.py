import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.database import get_db
from app.engine.agent import run_agent, run_agent_stream, _sse_event
from app.models.chat_history import ChatHistory
from app.models.conversation import Conversation
from app.schemas.chat import (
    CancelActionRequest,
    ChatRequest,
    ChatResponse,
    ConfirmActionRequest,
    PendingConfirmation,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(body: ChatRequest, db: AsyncSession = Depends(get_db)):
    # Resolve or create conversation
    conv: Conversation | None = None
    if body.conversation_id:
        conv = await db.get(Conversation, uuid.UUID(body.conversation_id))

    if not conv:
        conv = Conversation(title="New conversation")
        db.add(conv)
        await db.flush()

    # Persist user message
    user_row = ChatHistory(
        conversation_id=conv.id,
        role="user",
        content=body.message,
    )
    db.add(user_row)

    # Run agent
    try:
        result = await run_agent(
            user_message=body.message,
            chat_history=body.history,
            db=db,
        )
    except Exception as e:
        logger.exception("Agent error")
        error_msg = str(e)
        if "429" in error_msg or "rate limit" in error_msg.lower():
            raise HTTPException(429, f"Mistral API rate limited. Please wait and try again.")
        raise HTTPException(502, f"Agent error: {error_msg[:200]}")

    # Check if agent needs confirmation
    if result.get("status") == "pending_confirmation":
        # Auto-title
        if conv.title == "New conversation":
            conv.title = body.message[:100].strip() or "New conversation"
        await db.commit()

        conf = result["confirmation_info"]
        return ChatResponse(
            response="",
            tool_calls=result["tool_calls"],
            conversation_id=str(conv.id),
            pending_confirmation=PendingConfirmation(
                tool_name=conf["tool_name"],
                arguments=conf["arguments"],
                title=conf["title"],
                description=conf["description"],
                details=conf["details"],
                confirm_label=conf["confirm_label"],
                destructive=conf["destructive"],
            ),
            messages_snapshot=result["messages_snapshot"],
        )

    # Normal completion — persist assistant message
    assistant_row = ChatHistory(
        conversation_id=conv.id,
        role="assistant",
        content=result["response"],
        tool_calls=result["tool_calls"] if result["tool_calls"] else None,
    )
    db.add(assistant_row)

    # Auto-title: use first user message (truncated) as title
    if conv.title == "New conversation":
        conv.title = body.message[:100].strip() or "New conversation"

    await db.commit()

    return ChatResponse(
        response=result["response"],
        tool_calls=result["tool_calls"],
        conversation_id=str(conv.id),
    )


@router.post("/confirm", response_model=ChatResponse)
async def confirm_action(body: ConfirmActionRequest, db: AsyncSession = Depends(get_db)):
    """Resume the agent loop after user confirms a dangerous action."""
    conv = await db.get(Conversation, uuid.UUID(body.conversation_id))
    if not conv:
        return ChatResponse(response="Conversation not found.", conversation_id=body.conversation_id)

    # Extract tool_call_id from the last assistant message in the snapshot
    pending = dict(body.pending_tool)
    messages = body.messages_snapshot

    if "tool_call_id" not in pending:
        # Find the tool_call_id from the last assistant message's tool_calls
        for msg in reversed(messages):
            if msg.get("role") == "assistant" and msg.get("tool_calls"):
                for tc in msg["tool_calls"]:
                    fn = tc.get("function", {})
                    if fn.get("name") == pending.get("name"):
                        pending["tool_call_id"] = tc.get("id", "confirmed")
                        break
                break

    result = await run_agent(
        user_message="",  # not used when resuming
        chat_history=[],
        db=db,
        confirmed_tool=pending,
        resume_messages=messages,
    )

    # If we get another confirmation (unlikely but handle it)
    if result.get("status") == "pending_confirmation":
        conf = result["confirmation_info"]
        return ChatResponse(
            response="",
            tool_calls=result["tool_calls"],
            conversation_id=str(conv.id),
            pending_confirmation=PendingConfirmation(**conf),
            messages_snapshot=result["messages_snapshot"],
        )

    # Persist assistant message
    assistant_row = ChatHistory(
        conversation_id=conv.id,
        role="assistant",
        content=result["response"],
        tool_calls=result["tool_calls"] if result["tool_calls"] else None,
    )
    db.add(assistant_row)
    await db.commit()

    return ChatResponse(
        response=result["response"],
        tool_calls=result["tool_calls"],
        conversation_id=str(conv.id),
    )


@router.post("/cancel", response_model=ChatResponse)
async def cancel_action(body: CancelActionRequest, db: AsyncSession = Depends(get_db)):
    """Cancel a pending dangerous action and let the agent respond gracefully."""
    conv = await db.get(Conversation, uuid.UUID(body.conversation_id))
    if not conv:
        return ChatResponse(response="Conversation not found.", conversation_id=body.conversation_id)

    pending = dict(body.pending_tool)
    messages = body.messages_snapshot

    # Extract tool_call_id from the last assistant message
    tool_call_id = pending.get("tool_call_id", "declined")
    if tool_call_id == "declined":
        for msg in reversed(messages):
            if msg.get("role") == "assistant" and msg.get("tool_calls"):
                for tc in msg["tool_calls"]:
                    fn = tc.get("function", {})
                    if fn.get("name") == pending.get("name"):
                        tool_call_id = tc.get("id", "declined")
                        break
                break

    # Inject a "user declined" tool result so the LLM can respond gracefully
    messages.append({
        "role": "tool",
        "name": pending["name"],
        "content": json.dumps({"error": "User declined this action. Acknowledge and move on."}),
        "tool_call_id": tool_call_id,
    })

    result = await run_agent(
        user_message="",
        chat_history=[],
        db=db,
        resume_messages=messages,
    )

    # Persist assistant message
    assistant_row = ChatHistory(
        conversation_id=conv.id,
        role="assistant",
        content=result.get("response", "OK, I won't do that."),
        tool_calls=result.get("tool_calls") if result.get("tool_calls") else None,
    )
    db.add(assistant_row)
    await db.commit()

    return ChatResponse(
        response=result.get("response", "OK, I won't do that."),
        tool_calls=result.get("tool_calls", []),
        conversation_id=str(conv.id),
    )


@router.post("/stream")
async def chat_stream(body: ChatRequest, db: AsyncSession = Depends(get_db)):
    """SSE streaming chat endpoint. Streams tool execution and text tokens."""

    # Resolve or create conversation
    conv: Conversation | None = None
    if body.conversation_id:
        conv = await db.get(Conversation, uuid.UUID(body.conversation_id))

    if not conv:
        conv = Conversation(title="New conversation")
        db.add(conv)
        await db.flush()

    # Persist user message
    user_row = ChatHistory(
        conversation_id=conv.id,
        role="user",
        content=body.message,
    )
    db.add(user_row)

    # Auto-title
    if conv.title == "New conversation":
        conv.title = body.message[:100].strip() or "New conversation"

    await db.commit()

    conv_id = str(conv.id)

    async def event_generator():
        # Emit stream_start with conversation_id
        yield _sse_event("stream_start", {"conversation_id": conv_id})

        final_response = ""
        final_tool_calls: list = []

        try:
            async for event_str in run_agent_stream(
                user_message=body.message,
                chat_history=body.history,
                db=db,
            ):
                yield event_str

                # Capture final data for DB persistence
                try:
                    raw = event_str.removeprefix("data: ").strip()
                    event_data = json.loads(raw)
                    if event_data.get("type") == "complete":
                        final_response = event_data.get("response", "")
                        final_tool_calls = event_data.get("tool_calls", [])
                except (json.JSONDecodeError, ValueError):
                    pass

        except Exception as e:
            logger.exception("Streaming agent error")
            yield _sse_event("error", {"message": str(e)[:200]})
            return

        # Persist assistant message after streaming completes
        if final_response:
            assistant_row = ChatHistory(
                conversation_id=uuid.UUID(conv_id),
                role="assistant",
                content=final_response,
                tool_calls=final_tool_calls if final_tool_calls else None,
            )
            db.add(assistant_row)
            await db.commit()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
