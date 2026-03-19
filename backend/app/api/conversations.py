from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.chat_history import ChatHistory
from app.models.conversation import Conversation
from app.schemas.chat import ConversationDetail, ConversationMessage, ConversationSummary, ConversationUpdate, ToolCallInfo

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationSummary])
async def list_conversations(db: AsyncSession = Depends(get_db)):
    """List all conversations, most recent first."""
    stmt = (
        select(
            Conversation,
            func.count(ChatHistory.id).label("message_count"),
        )
        .outerjoin(ChatHistory, ChatHistory.conversation_id == Conversation.id)
        .group_by(Conversation.id)
        .order_by(Conversation.updated_at.desc())
        .limit(50)
    )
    rows = (await db.execute(stmt)).all()
    return [
        ConversationSummary(
            id=conv.id,
            title=conv.title,
            summary=conv.summary,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            message_count=count,
        )
        for conv, count in rows
    ]


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: str, db: AsyncSession = Depends(get_db)):
    """Get a conversation with all its messages."""
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Conversation not found")

    stmt = (
        select(ChatHistory)
        .where(ChatHistory.conversation_id == conv.id)
        .order_by(ChatHistory.created_at)
    )
    rows = (await db.execute(stmt)).scalars().all()

    messages = []
    for m in rows:
        tool_calls = None
        if m.tool_calls:
            tool_calls = [ToolCallInfo(**tc) for tc in m.tool_calls]
        messages.append(ConversationMessage(
            role=m.role,
            content=m.content,
            tool_calls=tool_calls,
            created_at=m.created_at,
        ))

    return ConversationDetail(id=conv.id, title=conv.title, messages=messages)


@router.patch("/{conversation_id}", response_model=ConversationSummary)
async def update_conversation(
    conversation_id: str, body: ConversationUpdate, db: AsyncSession = Depends(get_db)
):
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv.title = body.title
    await db.commit()
    await db.refresh(conv)

    count = (await db.execute(
        select(func.count(ChatHistory.id)).where(ChatHistory.conversation_id == conv.id)
    )).scalar() or 0

    return ConversationSummary(
        id=conv.id, title=conv.title, summary=conv.summary,
        created_at=conv.created_at, updated_at=conv.updated_at,
        message_count=count,
    )


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str, db: AsyncSession = Depends(get_db)):
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.delete(conv)
    await db.commit()
    return {"success": True}
