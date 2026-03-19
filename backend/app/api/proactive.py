"""API endpoints for manually triggering proactive scans."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import async_session, get_db
from app.engine.proactive import run_proactive_scan
from app.engine.proactive_agent import run_proactive_action
from app.models.agent_run import AgentRun, AgentToolCall
from app.models.module import Module
from app.models.user_profile import UserProfile
from app.schemas.agent_run import AgentRunDetail, AgentRunSummary, AgentRunsListResponse

router = APIRouter(prefix="/api/proactive", tags=["proactive"])


@router.get("/activity")
async def get_agent_activity():
    """Get current and recent agent activity (in-memory, fast)."""
    from app.engine.activity_tracker import get_activity
    runs = await get_activity()
    return {"runs": runs}


@router.get("/runs", response_model=AgentRunsListResponse)
async def list_agent_runs(
    status: Optional[str] = Query(None),
    module_id: Optional[uuid.UUID] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Paginated list of persisted agent runs (newest first)."""
    # Build query
    q = select(AgentRun)
    count_q = select(func.count(AgentRun.id))

    if status:
        q = q.where(AgentRun.status == status)
        count_q = count_q.where(AgentRun.status == status)
    if module_id:
        q = q.where(AgentRun.module_id == module_id)
        count_q = count_q.where(AgentRun.module_id == module_id)

    q = q.order_by(AgentRun.started_at.desc()).offset(offset).limit(limit)

    result = await db.execute(q)
    rows = result.scalars().all()

    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    # Get tool call counts per run
    run_ids = [r.id for r in rows]
    tc_counts: dict[uuid.UUID, int] = {}
    if run_ids:
        tc_q = (
            select(AgentToolCall.run_id, func.count(AgentToolCall.id))
            .where(AgentToolCall.run_id.in_(run_ids))
            .group_by(AgentToolCall.run_id)
        )
        tc_result = await db.execute(tc_q)
        for run_id_val, count in tc_result:
            tc_counts[run_id_val] = count

    summaries = []
    for r in rows:
        s = AgentRunSummary.model_validate(r)
        s.tool_call_count = tc_counts.get(r.id, 0)
        summaries.append(s)

    return AgentRunsListResponse(runs=summaries, total=total)


@router.get("/runs/{run_id}", response_model=AgentRunDetail)
async def get_agent_run_detail(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Single run with full tool calls list."""
    q = (
        select(AgentRun)
        .where(AgentRun.id == run_id)
        .options(selectinload(AgentRun.tool_calls))
    )
    result = await db.execute(q)
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "Agent run not found")
    return AgentRunDetail.model_validate(run)


async def _run_full_scan(force: bool = False) -> None:
    """Run a full proactive scan in the background."""
    async with async_session() as db:
        await run_proactive_scan(db, force=force)


async def _run_module_scan(module_id: uuid.UUID) -> None:
    """Run proactive scan for a specific module."""
    async with async_session() as db:
        module = await db.get(Module, module_id)
        if not module:
            return

        # Run alert checks for this module
        from app.engine.proactive import _check_deadlines, _check_stale, _check_status_stuck
        for alert in (module.alerts_config or []):
            alert_type = alert.get("type")
            if alert_type == "deadline_approaching":
                await _check_deadlines(module, alert, db)
            elif alert_type == "stale":
                await _check_stale(module, alert, db)
            elif alert_type == "status_stuck":
                await _check_status_stuck(module, alert, db)

        # Run actions for this module
        all_modules = (await db.execute(select(Module))).scalars().all()
        user_profile = await _get_user_profile(db)

        for action in (module.actions_config or []):
            await run_proactive_action(module, action, user_profile, all_modules, db)
            await _update_last_run(module, action.get("id", ""), db)


async def _run_single_action(module_id: uuid.UUID, action_id: str) -> None:
    """Run a specific proactive action."""
    async with async_session() as db:
        module = await db.get(Module, module_id)
        if not module:
            return

        action = None
        for a in (module.actions_config or []):
            if a.get("id") == action_id:
                action = a
                break
        if not action:
            return

        all_modules = (await db.execute(select(Module))).scalars().all()
        user_profile = await _get_user_profile(db)
        await run_proactive_action(module, action, user_profile, all_modules, db)
        await _update_last_run(module, action_id, db)


async def _get_user_profile(db: AsyncSession) -> dict:
    """Get user profile data."""
    result = await db.execute(select(UserProfile))
    profile = result.scalar_one_or_none()
    return profile.data if profile else {}


async def _update_last_run(module: Module, action_id: str, db: AsyncSession) -> None:
    """Update the last_action_runs timestamp for an action."""
    from datetime import datetime, timezone
    runs = dict(module.last_action_runs or {})
    runs[action_id] = datetime.now(timezone.utc).isoformat()
    module.last_action_runs = runs
    await db.commit()


@router.post("/scan")
async def trigger_full_scan(bg: BackgroundTasks, force: bool = Query(False)):
    """Trigger a full proactive scan across all modules."""
    bg.add_task(_run_full_scan, force)
    return {"status": "started", "scope": "all"}


@router.post("/scan/{module_id}")
async def trigger_module_scan(
    module_id: uuid.UUID,
    bg: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Trigger a proactive scan for a specific module."""
    module = await db.get(Module, module_id)
    if not module:
        raise HTTPException(404, "Module not found")
    bg.add_task(_run_module_scan, module_id)
    return {"status": "started", "scope": "module", "module": module.display_name}


@router.post("/action/{module_id}/{action_id}")
async def trigger_action(
    module_id: uuid.UUID,
    action_id: str,
    bg: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Trigger a specific proactive action."""
    module = await db.get(Module, module_id)
    if not module:
        raise HTTPException(404, "Module not found")

    action = None
    for a in (module.actions_config or []):
        if a.get("id") == action_id:
            action = a
            break
    if not action:
        raise HTTPException(404, f"Action '{action_id}' not found on module")

    bg.add_task(_run_single_action, module_id, action_id)
    return {"status": "started", "scope": "action", "module": module.display_name, "action": action_id}
