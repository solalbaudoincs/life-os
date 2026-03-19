"""Simple asyncio background scheduler for proactive scans."""

from __future__ import annotations

import asyncio
import logging

from app.database import async_session

logger = logging.getLogger(__name__)

_task: asyncio.Task | None = None


async def _scheduler_loop() -> None:
    """Run proactive scans periodically."""
    # Wait a bit before first run to let the app start up
    await asyncio.sleep(60)

    while True:
        try:
            from app.engine.proactive import run_proactive_scan

            logger.info("Scheduler: starting proactive scan")
            async with async_session() as db:
                results = await run_proactive_scan(db)
            logger.info("Scheduler: scan complete, %d items processed", len(results))
        except Exception:
            logger.exception("Scheduler: proactive scan failed")

        await asyncio.sleep(3600)  # Check every hour


def start_scheduler() -> None:
    """Start the background scheduler task."""
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_scheduler_loop())
        logger.info("Background scheduler started")


def stop_scheduler() -> None:
    """Stop the background scheduler task."""
    global _task
    if _task and not _task.done():
        _task.cancel()
        _task = None
        logger.info("Background scheduler stopped")
