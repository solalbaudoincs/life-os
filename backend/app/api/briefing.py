from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.engine.proactive import run_proactive_scan
from app.models.note import Note
from app.models.suggestion import Suggestion

router = APIRouter(prefix="/api/briefing", tags=["briefing"])


@router.get("")
async def get_briefing(db: AsyncSession = Depends(get_db)):
    # Run proactive scan first
    new_suggestions = await run_proactive_scan(db)

    # Gather stats
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    # Pending suggestions by type
    pending_stmt = select(Suggestion).where(Suggestion.status == "pending")
    pending = (await db.execute(pending_stmt)).scalars().all()

    alerts = [s for s in pending if s.type == "alert"]
    followups = [s for s in pending if s.type == "follow_up"]
    opportunities = [s for s in pending if s.type == "new_opportunity"]
    enrichments = [s for s in pending if s.type == "enrichment"]
    connections = [s for s in pending if s.type == "connection"]
    insights = [s for s in pending if s.type == "insight"]

    # Recent activity
    recent_notes = (
        await db.execute(
            select(func.count())
            .select_from(Note)
            .where(Note.updated_at > week_ago, Note.archived == False)  # noqa: E712
        )
    ).scalar() or 0

    new_notes = (
        await db.execute(
            select(func.count())
            .select_from(Note)
            .where(Note.created_at > week_ago, Note.archived == False)  # noqa: E712
        )
    ).scalar() or 0

    # Build sections
    sections = []

    def _item(s: Suggestion) -> dict:
        d: dict = {"title": s.title, "summary": s.summary, "id": str(s.id)}
        if s.module_id:
            d["module_id"] = str(s.module_id)
        if s.related_note_id:
            d["related_note_id"] = str(s.related_note_id)
        return d

    if alerts:
        sections.append({"name": "Urgent", "color": "red", "items": [_item(a) for a in alerts]})

    if followups:
        sections.append({"name": "Follow-ups", "color": "green", "items": [_item(f) for f in followups]})

    if opportunities:
        sections.append({"name": "Opportunities", "color": "blue", "items": [_item(o) for o in opportunities]})

    if enrichments:
        sections.append({"name": "Enrichments", "color": "blue", "items": [_item(e) for e in enrichments]})

    if connections:
        sections.append({"name": "Connections", "color": "purple", "items": [_item(c) for c in connections]})

    if insights:
        sections.append({"name": "Insights", "color": "purple", "items": [_item(i) for i in insights]})

    sections.append({
        "name": "Activity",
        "color": "accent",
        "items": [{
            "title": f"This week: {new_notes} new, {recent_notes} updated",
            "summary": "",
        }],
    })

    if new_suggestions:
        sections.append({
            "name": "New suggestions",
            "color": "blue",
            "items": [{"title": s["title"], "summary": s.get("note", "")} for s in new_suggestions],
        })

    return {
        "sections": sections,
        "generated_at": now.isoformat(),
    }
