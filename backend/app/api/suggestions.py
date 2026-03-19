import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.note import Note
from app.models.suggestion import Suggestion
from app.schemas.suggestion import SuggestionEdit, SuggestionResponse

router = APIRouter(prefix="/api/suggestions", tags=["suggestions"])


def _to_response(s: Suggestion) -> SuggestionResponse:
    return SuggestionResponse(
        id=s.id,
        module_id=s.module_id,
        action_id=s.action_id,
        related_note_id=s.related_note_id,
        type=s.type,
        title=s.title,
        summary=s.summary,
        data=s.data,
        confidence=s.confidence,
        proposed_action=s.proposed_action,
        proposed_payload=s.proposed_payload,
        status=s.status,
        snoozed_until=s.snoozed_until,
        resolved_at=s.resolved_at,
        created_at=s.created_at,
    )


@router.get("", response_model=list[SuggestionResponse])
async def list_suggestions(
    status: str = Query("pending"),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Suggestion)
        .where(Suggestion.status == status)
        .order_by(Suggestion.confidence.desc().nullslast(), Suggestion.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_response(s) for s in rows]


@router.post("/{suggestion_id}/accept", response_model=dict)
async def accept_suggestion(
    suggestion_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    s = await db.get(Suggestion, suggestion_id)
    if not s:
        raise HTTPException(404, "Suggestion not found")

    result = {"accepted": True, "suggestion_id": str(s.id)}

    # Execute the proposed action
    if s.proposed_action == "create_note":
        payload = s.proposed_payload
        note = Note(
            module_id=s.module_id,
            title=payload.get("title", s.title),
            content_md=payload.get("content_md", ""),
            metadata_=payload.get("metadata", {}),
        )
        db.add(note)
        await db.flush()
        result["note_id"] = str(note.id)
        result["note_title"] = note.title

    elif s.proposed_action == "update_note" and s.related_note_id:
        note = await db.get(Note, s.related_note_id)
        if note:
            payload = s.proposed_payload
            if "title" in payload:
                note.title = payload["title"]
            if "content_md" in payload:
                note.content_md = payload["content_md"]
            if "metadata" in payload:
                note.metadata_ = {**note.metadata_, **payload["metadata"]}

    s.status = "accepted"
    s.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    return result


@router.post("/{suggestion_id}/reject", status_code=204)
async def reject_suggestion(
    suggestion_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    s = await db.get(Suggestion, suggestion_id)
    if not s:
        raise HTTPException(404, "Suggestion not found")
    s.status = "rejected"
    s.resolved_at = datetime.now(timezone.utc)
    await db.commit()


@router.post("/{suggestion_id}/snooze", status_code=204)
async def snooze_suggestion(
    suggestion_id: uuid.UUID,
    hours: int = Query(24),
    db: AsyncSession = Depends(get_db),
):
    s = await db.get(Suggestion, suggestion_id)
    if not s:
        raise HTTPException(404, "Suggestion not found")
    s.status = "snoozed"
    s.snoozed_until = datetime.now(timezone.utc) + timedelta(hours=hours)
    await db.commit()


@router.put("/{suggestion_id}/edit", response_model=SuggestionResponse)
async def edit_suggestion(
    suggestion_id: uuid.UUID,
    body: SuggestionEdit,
    db: AsyncSession = Depends(get_db),
):
    s = await db.get(Suggestion, suggestion_id)
    if not s:
        raise HTTPException(404, "Suggestion not found")
    s.proposed_payload = body.proposed_payload
    await db.commit()
    await db.refresh(s)
    return _to_response(s)
