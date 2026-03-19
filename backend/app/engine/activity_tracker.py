"""In-memory activity tracker for proactive agent runs, with DB persistence."""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

_lock = asyncio.Lock()
_runs: dict[str, AgentRun] = {}

# Prune completed runs after this duration
_RETENTION = timedelta(minutes=30)


@dataclass
class ToolCallEntry:
    tool_name: str
    arguments_summary: str
    status: str = "running"  # running | completed | failed
    started_at: str = ""
    finished_at: str | None = None
    result_summary: str | None = None
    round_number: int = 0
    reasoning: str | None = None  # LLM's thinking text before this tool call
    db_id: str | None = None  # UUID of the persisted AgentToolCall row

    def to_dict(self) -> dict:
        return {
            "tool_name": self.tool_name,
            "arguments_summary": self.arguments_summary,
            "status": self.status,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "result_summary": self.result_summary,
            "round_number": self.round_number,
            "reasoning": self.reasoning,
        }


@dataclass
class AgentRun:
    run_id: str
    module_name: str
    module_display_name: str
    action_id: str
    action_name: str
    action_type: str
    status: str = "running"  # running | completed | failed
    started_at: str = ""
    finished_at: str | None = None
    current_round: int = 0
    max_rounds: int = 10
    tool_calls: list[ToolCallEntry] = field(default_factory=list)
    suggestions_created: int = 0
    error: str | None = None
    module_id: str | None = None  # UUID of the module (for DB persistence)

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "module_name": self.module_name,
            "module_display_name": self.module_display_name,
            "action_id": self.action_id,
            "action_name": self.action_name,
            "action_type": self.action_type,
            "status": self.status,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "current_round": self.current_round,
            "max_rounds": self.max_rounds,
            "tool_calls": [tc.to_dict() for tc in self.tool_calls],
            "suggestions_created": self.suggestions_created,
            "error": self.error,
        }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _persist_run_start(run: AgentRun) -> None:
    """Fire-and-forget: INSERT into agent_runs."""
    try:
        from app.database import async_session
        from app.models.agent_run import AgentRun as AgentRunModel

        async with async_session() as session:
            row = AgentRunModel(
                id=uuid.UUID(run.run_id),
                module_id=uuid.UUID(run.module_id) if run.module_id else None,
                action_id=run.action_id,
                action_name=run.action_name,
                action_type=run.action_type,
                status="running",
                current_round=0,
                max_rounds=run.max_rounds,
                started_at=datetime.fromisoformat(run.started_at),
            )
            session.add(row)
            await session.commit()
    except Exception:
        pass  # Keep tracker resilient — don't break agent flow


async def _persist_tool_call_start(run_id: str, entry: ToolCallEntry, arguments: dict) -> str | None:
    """Fire-and-forget: INSERT into agent_tool_calls. Returns the new row's UUID."""
    try:
        from app.database import async_session
        from app.models.agent_run import AgentToolCall

        tc_id = uuid.uuid4()
        async with async_session() as session:
            row = AgentToolCall(
                id=tc_id,
                run_id=uuid.UUID(run_id),
                tool_name=entry.tool_name,
                arguments_summary=entry.arguments_summary,
                arguments_full=arguments,
                reasoning=entry.reasoning,
                status="running",
                round_number=entry.round_number,
                started_at=datetime.fromisoformat(entry.started_at),
            )
            session.add(row)
            await session.commit()
        return str(tc_id)
    except Exception:
        return None


async def _persist_tool_call_end(db_id: str | None, status: str, finished_at: str, result_summary: str | None, result_full: dict | None = None) -> None:
    """Fire-and-forget: UPDATE the agent_tool_calls row."""
    if not db_id:
        return
    try:
        from app.database import async_session
        from app.models.agent_run import AgentToolCall
        from sqlalchemy import update

        values: dict = {
            "status": status,
            "finished_at": datetime.fromisoformat(finished_at),
            "result_summary": result_summary,
        }
        if result_full is not None:
            values["result_full"] = result_full

        async with async_session() as session:
            await session.execute(
                update(AgentToolCall)
                .where(AgentToolCall.id == uuid.UUID(db_id))
                .values(**values)
            )
            await session.commit()
    except Exception:
        pass


async def _persist_round_update(run_id: str, round_num: int) -> None:
    """Fire-and-forget: UPDATE current_round on agent_runs."""
    try:
        from app.database import async_session
        from app.models.agent_run import AgentRun as AgentRunModel
        from sqlalchemy import update

        async with async_session() as session:
            await session.execute(
                update(AgentRunModel)
                .where(AgentRunModel.id == uuid.UUID(run_id))
                .values(current_round=round_num)
            )
            await session.commit()
    except Exception:
        pass


async def _persist_run_finish(run_id: str, status: str, finished_at: str, suggestions_created: int, error: str | None) -> None:
    """Fire-and-forget: UPDATE agent_runs row on completion."""
    try:
        from app.database import async_session
        from app.models.agent_run import AgentRun as AgentRunModel
        from sqlalchemy import update

        async with async_session() as session:
            await session.execute(
                update(AgentRunModel)
                .where(AgentRunModel.id == uuid.UUID(run_id))
                .values(
                    status=status,
                    finished_at=datetime.fromisoformat(finished_at),
                    suggestions_created=suggestions_created,
                    error=error,
                )
            )
            await session.commit()
    except Exception:
        pass


async def start_run(
    run_id: str,
    module_name: str,
    module_display_name: str,
    action_id: str,
    action_name: str,
    action_type: str,
    max_rounds: int = 10,
    module_id: str | None = None,
) -> None:
    run = AgentRun(
        run_id=run_id,
        module_name=module_name,
        module_display_name=module_display_name,
        action_id=action_id,
        action_name=action_name,
        action_type=action_type,
        started_at=_now(),
        max_rounds=max_rounds,
        module_id=module_id,
    )
    async with _lock:
        _runs[run_id] = run

    # Persist in background
    asyncio.create_task(_persist_run_start(run))


async def update_round(run_id: str, round_num: int) -> None:
    async with _lock:
        run = _runs.get(run_id)
        if run:
            run.current_round = round_num

    asyncio.create_task(_persist_round_update(run_id, round_num))


async def log_tool_call_start(
    run_id: str, tool_name: str, arguments: dict, round_num: int, reasoning: str | None = None
) -> int:
    """Log start of a tool call. Returns the index for later update."""
    summary = _summarize_args(tool_name, arguments)
    entry = ToolCallEntry(
        tool_name=tool_name,
        arguments_summary=summary,
        started_at=_now(),
        round_number=round_num,
        reasoning=reasoning,
    )
    index = -1
    async with _lock:
        run = _runs.get(run_id)
        if run:
            run.tool_calls.append(entry)
            index = len(run.tool_calls) - 1

    # Persist and store the DB id on the entry
    if index >= 0:
        db_id = await _persist_tool_call_start(run_id, entry, arguments)
        entry.db_id = db_id

    return index


async def log_tool_call_end(
    run_id: str, index: int, result: str, failed: bool = False
) -> None:
    import json as _json

    result_summary = _summarize_result(result)
    db_id: str | None = None
    finished_at = _now()
    status = "failed" if failed else "completed"

    # Parse full result for DB storage
    result_full: dict | None = None
    try:
        result_full = _json.loads(result)
    except (ValueError, TypeError):
        pass

    async with _lock:
        run = _runs.get(run_id)
        if run and 0 <= index < len(run.tool_calls):
            tc = run.tool_calls[index]
            tc.status = status
            tc.finished_at = finished_at
            tc.result_summary = result_summary
            db_id = tc.db_id

    asyncio.create_task(_persist_tool_call_end(db_id, status, finished_at, result_summary, result_full))


async def finish_run(
    run_id: str, suggestions_created: int = 0, error: str | None = None
) -> None:
    finished_at = _now()
    status = "failed" if error else "completed"

    async with _lock:
        run = _runs.get(run_id)
        if run:
            run.status = status
            run.finished_at = finished_at
            run.suggestions_created = suggestions_created
            run.error = error

    asyncio.create_task(_persist_run_finish(run_id, status, finished_at, suggestions_created, error))


async def get_activity() -> list[dict]:
    """Return all active + recent runs, pruning old completed ones."""
    cutoff = datetime.now(timezone.utc) - _RETENTION
    async with _lock:
        to_remove = []
        for rid, run in _runs.items():
            if run.finished_at:
                try:
                    finished = datetime.fromisoformat(run.finished_at)
                    if finished < cutoff:
                        to_remove.append(rid)
                except (ValueError, TypeError):
                    pass
        for rid in to_remove:
            del _runs[rid]

        # Return running first, then completed (most recent first)
        runs = sorted(
            _runs.values(),
            key=lambda r: (r.status != "running", r.started_at),
            reverse=False,
        )
        # Put running ones first
        running = [r.to_dict() for r in runs if r.status == "running"]
        done = [r.to_dict() for r in runs if r.status != "running"]
        done.reverse()  # most recent first
        return running + done


def _summarize_args(tool_name: str, args: dict) -> str:
    """Create a brief human-readable summary of tool arguments."""
    if tool_name == "think":
        return args.get("thought", "")[:200]
    if tool_name == "web_search":
        return args.get("query", "")[:100]
    if tool_name == "fetch_page":
        return args.get("url", "")[:100]
    if tool_name == "search_notes":
        return args.get("query", "")[:100]
    if tool_name == "create_suggestion":
        return args.get("title", "")[:100]
    return str(args)[:100]


def _summarize_result(result_json: str) -> str:
    """Create a brief summary from a tool result JSON string."""
    import json
    try:
        data = json.loads(result_json)
    except (json.JSONDecodeError, TypeError):
        return result_json[:80]

    if "results" in data and isinstance(data["results"], list):
        return f"{len(data['results'])} results"
    if "content" in data:
        content = data["content"]
        return f"fetched ({len(content)} chars)"
    if "status" in data:
        status = data["status"]
        if status == "created":
            return f"created: {data.get('title', '')[:60]}"
        if status == "skipped":
            return f"skipped: {data.get('reason', '')[:60]}"
        return status
    if "error" in data:
        return f"error: {data['error'][:60]}"
    return str(data)[:80]
