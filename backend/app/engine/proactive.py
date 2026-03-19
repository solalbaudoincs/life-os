"""Proactive engine: scans modules for alerts and actions, generates suggestions."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.module import Module
from app.models.note import Note
from app.models.suggestion import Suggestion
from app.models.user_profile import UserProfile

logger = logging.getLogger(__name__)


def _should_run(action: dict, module: Module) -> bool:
    """Check if an action is due to run based on its frequency and last_action_runs."""
    action_id = action.get("id", "")
    frequency = action.get("frequency")
    if not frequency:
        return True  # No frequency constraint = always run

    last_runs = module.last_action_runs or {}
    last_run_str = last_runs.get(action_id)
    if not last_run_str:
        return True  # Never run before

    try:
        last_run = datetime.fromisoformat(last_run_str)
    except (ValueError, TypeError):
        return True

    now = datetime.now(timezone.utc)
    freq_map = {
        "hourly": timedelta(hours=1),
        "daily": timedelta(days=1),
        "weekly": timedelta(weeks=1),
        "monthly": timedelta(days=30),
    }
    delta = freq_map.get(frequency, timedelta(days=1))
    return (now - last_run) >= delta


async def run_proactive_scan(db: AsyncSession, force: bool = False) -> list[dict]:
    """Scan all modules for alerts and actions, create suggestions. Returns created suggestions."""
    modules = (await db.execute(select(Module))).scalars().all()
    created = []

    for mod in modules:
        # 1. Existing alert checks (deadlines, stale, stuck)
        alerts_config = mod.alerts_config or []
        for alert in alerts_config:
            alert_type = alert.get("type")
            if alert_type == "deadline_approaching":
                created.extend(await _check_deadlines(mod, alert, db))
            elif alert_type == "stale":
                created.extend(await _check_stale(mod, alert, db))
            elif alert_type == "status_stuck":
                created.extend(await _check_status_stuck(mod, alert, db))

        # 2. NEW: Process actions_config (web_search, enrichment, internal_scan)
        actions_config = mod.actions_config or []
        for action in actions_config:
            if not force and not _should_run(action, mod):
                logger.debug("Skipping action %s/%s — not due", mod.name, action.get("id"))
                continue

            try:
                action_results = await _dispatch_action(mod, action, modules, db)
                for sid in action_results:
                    created.append({
                        "type": action.get("type", "web_search"),
                        "title": f"Action '{action.get('name', '')}' created suggestion",
                        "suggestion_id": sid,
                    })

                # Update last run timestamp
                runs = dict(mod.last_action_runs or {})
                runs[action.get("id", "")] = datetime.now(timezone.utc).isoformat()
                mod.last_action_runs = runs
                await db.commit()

            except Exception:
                logger.exception("Failed to run action %s/%s", mod.name, action.get("id"))

    return created


async def _dispatch_action(
    module: Module, action: dict, all_modules: list[Module], db: AsyncSession
) -> list[str]:
    """Dispatch a proactive action to the LLM agent."""
    from app.engine.proactive_agent import run_proactive_action

    # Get user profile
    result = await db.execute(select(UserProfile))
    profile = result.scalar_one_or_none()
    user_profile = profile.data if profile else {}

    return await run_proactive_action(module, action, user_profile, all_modules, db)


async def _check_deadlines(mod: Module, alert: dict, db: AsyncSession) -> list[dict]:
    """Find notes with deadlines approaching in N days."""
    field = alert.get("field", "deadline")
    days_before = alert.get("days_before", 3)
    now = datetime.now(timezone.utc).date()
    threshold = now + timedelta(days=days_before)

    stmt = (
        select(Note)
        .where(
            Note.module_id == mod.id,
            Note.archived == False,  # noqa: E712
            Note.metadata_[field].astext != "null",
        )
    )
    notes = (await db.execute(stmt)).scalars().all()
    created = []

    for note in notes:
        deadline_str = note.metadata_.get(field)
        if not deadline_str:
            continue
        try:
            deadline = datetime.fromisoformat(deadline_str).date()
        except (ValueError, TypeError):
            continue

        if now <= deadline <= threshold:
            # Check if we already have a pending suggestion for this
            existing = await db.execute(
                select(Suggestion).where(
                    Suggestion.related_note_id == note.id,
                    Suggestion.action_id == "deadline_approaching",
                    Suggestion.status == "pending",
                )
            )
            if existing.scalar_one_or_none():
                continue

            days_left = (deadline - now).days
            s = Suggestion(
                module_id=mod.id,
                action_id="deadline_approaching",
                related_note_id=note.id,
                type="alert",
                title=f"Deadline in {days_left} day{'s' if days_left != 1 else ''}",
                summary=f'"{note.title}" has a deadline on {deadline_str}.',
                data={"field": field, "deadline": deadline_str, "days_left": days_left},
                confidence=None,
                proposed_action="notify",
                proposed_payload={},
            )
            db.add(s)
            created.append({"type": "alert", "title": s.title, "note": note.title})

    await db.commit()
    return created


async def _check_stale(mod: Module, alert: dict, db: AsyncSession) -> list[dict]:
    """Find notes not updated in N days."""
    days_inactive = alert.get("days_inactive", 14)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days_inactive)

    stmt = (
        select(Note)
        .where(
            Note.module_id == mod.id,
            Note.archived == False,  # noqa: E712
            Note.updated_at < cutoff,
        )
    )
    notes = (await db.execute(stmt)).scalars().all()
    created = []

    for note in notes:
        existing = await db.execute(
            select(Suggestion).where(
                Suggestion.related_note_id == note.id,
                Suggestion.action_id == "stale_note",
                Suggestion.status == "pending",
            )
        )
        if existing.scalar_one_or_none():
            continue

        days_ago = (datetime.now(timezone.utc) - note.updated_at).days
        s = Suggestion(
            module_id=mod.id,
            action_id="stale_note",
            related_note_id=note.id,
            type="follow_up",
            title=f"No update in {days_ago} days",
            summary=f'"{note.title}" hasn\'t been updated since {note.updated_at.strftime("%b %d")}. Consider reviewing or archiving it.',
            data={"days_inactive": days_ago},
            confidence=None,
            proposed_action="notify",
            proposed_payload={},
        )
        db.add(s)
        created.append({"type": "follow_up", "title": s.title, "note": note.title})

    await db.commit()
    return created


async def _check_status_stuck(mod: Module, alert: dict, db: AsyncSession) -> list[dict]:
    """Find notes stuck in a status for too long."""
    days_inactive = alert.get("days_inactive", 7)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days_inactive)

    lifecycle = mod.status_lifecycle or []
    # Only check intermediate statuses (not first or last)
    check_statuses = lifecycle[1:-1] if len(lifecycle) > 2 else []
    if not check_statuses:
        return []

    stmt = (
        select(Note)
        .where(
            Note.module_id == mod.id,
            Note.archived == False,  # noqa: E712
            Note.updated_at < cutoff,
        )
    )
    notes = (await db.execute(stmt)).scalars().all()
    created = []

    for note in notes:
        status = note.metadata_.get("status")
        if status not in check_statuses:
            continue

        existing = await db.execute(
            select(Suggestion).where(
                Suggestion.related_note_id == note.id,
                Suggestion.action_id == "status_stuck",
                Suggestion.status == "pending",
            )
        )
        if existing.scalar_one_or_none():
            continue

        days_ago = (datetime.now(timezone.utc) - note.updated_at).days
        s = Suggestion(
            module_id=mod.id,
            action_id="status_stuck",
            related_note_id=note.id,
            type="follow_up",
            title=f"Stuck in '{status}' for {days_ago} days",
            summary=f'"{note.title}" has been in "{status}" since {note.updated_at.strftime("%b %d")}. Time to move it forward?',
            data={"status": status, "days_stuck": days_ago},
            confidence=None,
            proposed_action="notify",
            proposed_payload={},
        )
        db.add(s)
        created.append({"type": "follow_up", "title": s.title, "note": note.title})

    await db.commit()
    return created
