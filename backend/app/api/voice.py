"""Voice inbox: upload audio, transcribe via Mistral, route through agent."""

import uuid

from fastapi import APIRouter, Depends, Form, UploadFile, File as FileParam
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.engine.agent import run_agent
from app.models.chat_history import ChatHistory
from app.models.conversation import Conversation
from app.services.mistral_client import transcribe

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.post("")
async def voice_inbox(
    audio: UploadFile = FileParam(...),
    conversation_id: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """Accept audio upload, transcribe, and route through agent."""
    audio_bytes = await audio.read()
    filename = audio.filename or "audio.webm"

    # Transcribe
    try:
        transcript = await transcribe(audio_bytes, filename)
    except Exception as e:
        err_msg = str(e)
        if "decoded" in err_msg or "invalid" in err_msg.lower():
            return {
                "transcript": "",
                "response": "Could not process the audio. Please try recording again.",
                "tool_calls": [],
                "conversation_id": conversation_id,
            }
        raise

    if not transcript.strip():
        return {
            "transcript": "",
            "response": "I couldn't hear anything. Please try again.",
            "tool_calls": [],
            "conversation_id": conversation_id,
        }

    # Resolve or create conversation
    conv: Conversation | None = None
    if conversation_id:
        conv = await db.get(Conversation, uuid.UUID(conversation_id))
    if not conv:
        conv = Conversation(title=f"Voice: {transcript[:80]}")
        db.add(conv)
        await db.flush()

    # Persist user message (transcribed)
    user_row = ChatHistory(
        conversation_id=conv.id,
        role="user",
        content=f"[Voice] {transcript}",
    )
    db.add(user_row)

    # Run agent with the transcribed text
    result = await run_agent(
        user_message=transcript,
        chat_history=[],
        db=db,
    )

    # Persist assistant response
    assistant_row = ChatHistory(
        conversation_id=conv.id,
        role="assistant",
        content=result["response"],
        tool_calls=result["tool_calls"] if result["tool_calls"] else None,
    )
    db.add(assistant_row)
    await db.commit()

    return {
        "transcript": transcript,
        "response": result["response"],
        "tool_calls": result["tool_calls"],
        "conversation_id": str(conv.id),
    }
