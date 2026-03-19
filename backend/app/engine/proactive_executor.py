"""Tool dispatch for the proactive agent, including dedup logic."""

from __future__ import annotations

import json
import logging
import uuid

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.engine.embeddings import embed_text, search_similar
from app.models.module import Module
from app.models.suggestion import Suggestion
from app.services.web_search import web_search as ws_search, fetch_page as ws_fetch

logger = logging.getLogger(__name__)


async def execute_proactive_tool(
    name: str,
    arguments: dict,
    module: Module,
    db: AsyncSession,
) -> str:
    """Dispatch a proactive tool call and return the result as JSON string."""
    if name == "think":
        # No-op tool — reasoning is captured by the activity tracker
        return json.dumps({"status": "ok"})
    if name == "web_search":
        return await _handle_web_search(arguments)
    if name == "fetch_page":
        return await _handle_fetch_page(arguments)
    if name == "search_notes":
        return await _handle_search_notes(arguments, db)
    if name == "create_suggestion":
        return await _handle_create_suggestion(arguments, module, db)
    if name == "get_note":
        return await _handle_get_note(arguments, db)

    # --- Per-module list tools ---
    if name.startswith("list_"):
        return await _handle_list_notes(name, arguments, db)

    # --- MCP tools ---
    from app.engine.mcp_manager import mcp_manager
    if mcp_manager.is_mcp_tool(name):
        try:
            return await mcp_manager.execute_tool(name, arguments)
        except Exception as e:
            return json.dumps({"error": f"MCP tool error: {str(e)}"})

    return json.dumps({"error": f"Unknown tool: {name}"})


async def _handle_web_search(args: dict) -> str:
    query = args.get("query", "")
    num = args.get("num_results", 5)
    try:
        results = await ws_search(query, num)
        return json.dumps({
            "results": [
                {"title": r.title, "url": r.url, "snippet": r.snippet, "published_date": r.published_date}
                for r in results
            ]
        })
    except Exception as e:
        logger.exception("Web search failed")
        return json.dumps({"error": str(e)})


async def _handle_fetch_page(args: dict) -> str:
    url = args.get("url", "")
    max_chars = args.get("max_chars", 8000)
    content = await ws_fetch(url, max_chars)
    return json.dumps({"url": url, "content": content})


async def _handle_search_notes(args: dict, db: AsyncSession) -> str:
    query = args.get("query", "")
    if not query:
        return json.dumps({"error": "query is required"})

    module_id = None
    module_name = args.get("module")
    if module_name:
        result = await db.execute(select(Module).where(Module.name == module_name))
        mod = result.scalar_one_or_none()
        if mod:
            module_id = mod.id

    try:
        results = await search_similar(query, db, module_id=module_id, limit=args.get("limit", 5))
    except Exception:
        results = []

    return json.dumps({"query": query, "results": results})


async def _handle_create_suggestion(
    args: dict,
    module: Module,
    db: AsyncSession,
) -> str:
    """Create a suggestion with embedding-based deduplication."""
    title = args.get("title", "")
    summary = args.get("summary", "")
    confidence = args.get("confidence", 0.5)

    # Only create suggestions with sufficient confidence
    if confidence < 0.7:
        return json.dumps({"status": "skipped", "reason": f"confidence {confidence} < 0.7 threshold"})

    # Step 1: Embed the suggestion content for dedup
    embed_content = f"{title}\n{summary}"
    try:
        embedding = await embed_text(embed_content)
    except Exception as e:
        logger.warning("Failed to embed suggestion: %s", e)
        embedding = None

    # Step 2: Dedup against existing notes in the module
    if embedding:
        emb_str = str(embedding)
        threshold = settings.DEDUP_SIMILARITY_THRESHOLD

        # Check against notes
        note_check = await db.execute(text("""
            SELECT id, title, 1 - (embedding <=> CAST(:emb AS vector)) as similarity
            FROM notes
            WHERE module_id = :mid AND archived = false AND embedding IS NOT NULL
            ORDER BY embedding <=> CAST(:emb AS vector) LIMIT 1
        """), {"emb": emb_str, "mid": str(module.id)})
        note_row = note_check.mappings().first()
        if note_row and float(note_row["similarity"]) > threshold:
            return json.dumps({
                "status": "skipped",
                "reason": f"duplicate of existing note '{note_row['title']}' (similarity: {note_row['similarity']:.3f})",
            })

        # Check against rejected suggestions
        rejected_check = await db.execute(text("""
            SELECT id, title, 1 - (embedding <=> CAST(:emb AS vector)) as similarity
            FROM suggestions
            WHERE status = 'rejected' AND embedding IS NOT NULL
            ORDER BY embedding <=> CAST(:emb AS vector) LIMIT 1
        """), {"emb": emb_str})
        rejected_row = rejected_check.mappings().first()
        if rejected_row and float(rejected_row["similarity"]) > threshold:
            return json.dumps({
                "status": "skipped",
                "reason": f"similar to rejected suggestion (similarity: {rejected_row['similarity']:.3f})",
            })

        # Check against pending suggestions
        pending_check = await db.execute(text("""
            SELECT id, title, 1 - (embedding <=> CAST(:emb AS vector)) as similarity
            FROM suggestions
            WHERE status = 'pending' AND embedding IS NOT NULL
            ORDER BY embedding <=> CAST(:emb AS vector) LIMIT 1
        """), {"emb": emb_str})
        pending_row = pending_check.mappings().first()
        if pending_row and float(pending_row["similarity"]) > threshold:
            return json.dumps({
                "status": "skipped",
                "reason": f"similar to pending suggestion '{pending_row['title']}' (similarity: {pending_row['similarity']:.3f})",
            })

    # Step 3: Create the suggestion
    suggestion = Suggestion(
        module_id=module.id,
        action_id=args.get("_action_id", "proactive"),
        type=args.get("type", "new_opportunity"),
        title=title,
        summary=summary,
        data=args.get("data", {}),
        confidence=confidence,
        proposed_action=args.get("proposed_action", "notify"),
        proposed_payload=args.get("proposed_payload", {}),
        embedding=embedding,
    )
    db.add(suggestion)
    await db.flush()

    return json.dumps({
        "status": "created",
        "suggestion_id": str(suggestion.id),
        "title": title,
    })


async def _handle_get_note(args: dict, db: AsyncSession) -> str:
    """Get a note by ID — same logic as interactive agent's get_note."""
    from app.models.note import Note

    note_id = args.get("note_id")
    if not note_id:
        return json.dumps({"error": "note_id is required"})

    try:
        note = await db.get(Note, uuid.UUID(note_id))
    except ValueError:
        return json.dumps({"error": "Invalid note_id"})

    if not note:
        return json.dumps({"error": "Note not found"})

    return json.dumps({
        "note_id": str(note.id),
        "title": note.title,
        "content_md": note.content_md,
        "metadata": note.metadata_,
        "created_at": note.created_at.isoformat(),
        "updated_at": note.updated_at.isoformat(),
    })


async def _handle_list_notes(tool_name: str, args: dict, db: AsyncSession) -> str:
    """List notes for a module — dispatched from list_{module_name} tool calls."""
    from app.models.note import Note

    module_name = tool_name[len("list_"):]
    result = await db.execute(select(Module).where(Module.name == module_name))
    mod = result.scalar_one_or_none()
    if not mod:
        return json.dumps({"error": f"Module '{module_name}' not found"})

    stmt = (
        select(Note)
        .where(Note.module_id == mod.id, Note.archived == False)  # noqa: E712
        .order_by(Note.updated_at.desc())
    )

    status = args.get("status")
    if status:
        stmt = stmt.where(Note.metadata_["status"].astext == status)

    limit = args.get("limit", 20)
    stmt = stmt.limit(limit)

    rows = (await db.execute(stmt)).scalars().all()
    notes = []
    for n in rows:
        notes.append({
            "note_id": str(n.id),
            "title": n.title,
            "metadata": n.metadata_,
            "updated_at": n.updated_at.isoformat(),
        })
    return json.dumps({"module": mod.display_name, "count": len(notes), "notes": notes})
