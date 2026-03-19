"""Execute tool calls from the LLM by dispatching to the right handler."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session as session_factory

logger = logging.getLogger(__name__)

from app.engine.schema_engine import validate_metadata
from app.models.module import Module
from app.models.note import Note
from app.models.suggestion import Suggestion
from app.models.user_profile import UserProfile
from app.schemas.module_schema import ActionConfig, AlertConfig, FieldDefinition


async def execute_tool_call(
    name: str,
    arguments: dict,
    db: AsyncSession,
) -> str:
    """Dispatch a tool call and return the result as a JSON string."""

    # --- Meta tools ---
    if name == "get_note":
        return await _get_note(arguments, db)
    if name == "delete_note":
        return await _delete_note(arguments, db)
    if name == "search_notes":
        return await _search_notes(arguments, db)
    if name == "preview_module":
        return _preview_module(arguments)
    if name == "create_module":
        return await _create_module(arguments, db)
    if name == "list_modules":
        return await _list_modules(db)
    if name == "update_module":
        return await _update_module(arguments, db)
    if name == "delete_module":
        return await _delete_module(arguments, db)

    # --- Suggestion tools ---
    if name == "list_suggestions":
        return await _list_suggestions(arguments, db)
    if name == "accept_suggestion":
        return await _accept_suggestion(arguments, db)
    if name == "reject_suggestion":
        return await _reject_suggestion(arguments, db)
    if name == "snooze_suggestion":
        return await _snooze_suggestion(arguments, db)

    # --- Profile tools ---
    if name == "get_profile":
        return await _get_profile(db)
    if name == "update_profile":
        return await _update_profile(arguments, db)

    # --- Web tools ---
    if name == "web_search":
        return await _web_search(arguments)
    if name == "fetch_page":
        return await _fetch_page(arguments)

    # --- Proactive tools ---
    if name == "trigger_scan":
        return await _trigger_scan(arguments, db)

    # --- Module tools: parse prefix ---
    for prefix in ("create_", "update_", "list_"):
        if name.startswith(prefix):
            module_name = name[len(prefix):]
            mod = await _get_module_by_name(module_name, db)
            if not mod:
                return json.dumps({"error": f"Module '{module_name}' not found"})

            if prefix == "create_":
                return await _create_note(mod, arguments, db)
            elif prefix == "update_":
                return await _update_note(mod, arguments, db)
            elif prefix == "list_":
                return await _list_notes(mod, arguments, db)

    # --- MCP tools: check namespace prefix ---
    from app.engine.mcp_manager import mcp_manager
    if mcp_manager.is_mcp_tool(name):
        try:
            result = await mcp_manager.execute_tool(name, arguments)
            return result
        except Exception as e:
            return json.dumps({"error": f"MCP tool error: {str(e)}"})

    # --- MCP management tools ---
    if name == "list_mcp_servers":
        return await _list_mcp_servers(db)
    if name == "add_mcp_server":
        return await _add_mcp_server(arguments, db)
    if name == "remove_mcp_server":
        return await _remove_mcp_server(arguments, db)
    if name == "toggle_mcp_server":
        return await _toggle_mcp_server(arguments, db)
    if name == "list_mcp_tools":
        return _list_mcp_tools()

    return json.dumps({"error": f"Unknown tool: {name}"})


async def _get_module_by_name(name: str, db: AsyncSession) -> Module | None:
    result = await db.execute(select(Module).where(Module.name == name))
    return result.scalar_one_or_none()


def _parse_fields(mod: Module) -> list[FieldDefinition]:
    return [FieldDefinition.model_validate(f) for f in mod.fields_schema]


async def _create_note(mod: Module, args: dict, db: AsyncSession) -> str:
    title = args.get("title", "Untitled")
    content_md = args.get("content_md", "")

    # Separate metadata fields from title/content
    meta = {k: v for k, v in args.items() if k not in ("title", "content_md")}

    fields = _parse_fields(mod)
    try:
        validated = validate_metadata(mod.name, fields, meta)
    except ValueError as e:
        return json.dumps({"error": str(e)})

    note = Note(
        module_id=mod.id,
        title=title,
        content_md=content_md,
        metadata_=validated,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)

    # Embed in background
    asyncio.create_task(_embed_bg(note.id))

    return json.dumps({
        "success": True,
        "note_id": str(note.id),
        "title": note.title,
        "module": mod.display_name,
    })


async def _embed_bg(note_id: uuid.UUID) -> None:
    try:
        from app.engine.embeddings import embed_and_store
        async with session_factory() as db:
            await embed_and_store(note_id, db)
    except Exception:
        logger.exception("Failed to embed note %s", note_id)


async def _update_note(mod: Module, args: dict, db: AsyncSession) -> str:
    note_id = args.get("note_id")
    if not note_id:
        return json.dumps({"error": "note_id is required"})

    try:
        note = await db.get(Note, uuid.UUID(note_id))
    except ValueError:
        return json.dumps({"error": "Invalid note_id"})

    if not note:
        return json.dumps({"error": "Note not found"})

    if "title" in args:
        note.title = args["title"]
    if "content_md" in args:
        note.content_md = args["content_md"]

    meta_updates = {k: v for k, v in args.items() if k not in ("note_id", "title", "content_md")}
    if meta_updates:
        merged = {**note.metadata_, **meta_updates}
        fields = _parse_fields(mod)
        try:
            note.metadata_ = validate_metadata(mod.name, fields, merged)
        except ValueError as e:
            return json.dumps({"error": str(e)})

    await db.commit()
    await db.refresh(note)

    return json.dumps({
        "success": True,
        "note_id": str(note.id),
        "title": note.title,
        "updated_fields": list(args.keys()),
    })


async def _list_notes(mod: Module, args: dict, db: AsyncSession) -> str:
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


async def _get_note(args: dict, db: AsyncSession) -> str:
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
        "module_id": str(note.module_id),
        "created_at": note.created_at.isoformat(),
        "updated_at": note.updated_at.isoformat(),
        "_widget": {"type": "note_card"},
    })


async def _delete_note(args: dict, db: AsyncSession) -> str:
    note_id = args.get("note_id")
    if not note_id:
        return json.dumps({"error": "note_id is required"})

    try:
        note = await db.get(Note, uuid.UUID(note_id))
    except ValueError:
        return json.dumps({"error": "Invalid note_id"})

    if not note:
        return json.dumps({"error": "Note not found"})

    note.archived = True
    await db.commit()
    return json.dumps({"success": True, "archived": str(note.id)})


def _preview_module(args: dict) -> str:
    """Return module definition as a preview card — no DB writes."""
    return json.dumps({
        "preview": True,
        "name": args.get("name", ""),
        "display_name": args.get("display_name", ""),
        "icon": args.get("icon", "📁"),
        "description": args.get("description", ""),
        "fields": args.get("fields_schema", []),
        "status_lifecycle": args.get("status_lifecycle", []),
        "alerts": args.get("alerts_config", []),
        "actions": args.get("actions_config", []),
        "_widget": {"type": "module_card"},
    })


async def _create_module(args: dict, db: AsyncSession) -> str:
    name = args.get("name", "")
    display_name = args.get("display_name", "")
    description = args.get("description", "")
    icon = args.get("icon", "📁")
    fields_schema = args.get("fields_schema", [])
    status_lifecycle = args.get("status_lifecycle", [])
    alerts_config = args.get("alerts_config", [])
    actions_config = args.get("actions_config", [])

    if not name or not display_name:
        return json.dumps({"error": "name and display_name are required"})

    # Check uniqueness
    existing = await _get_module_by_name(name, db)
    if existing:
        return json.dumps({"error": f"A module with name '{name}' already exists"})

    # Validate each field definition
    validated_fields = []
    for f in fields_schema:
        try:
            fd = FieldDefinition.model_validate(f)
            validated_fields.append(fd.model_dump())
        except Exception as e:
            return json.dumps({"error": f"Invalid field definition: {e}"})

    # Validate alerts
    validated_alerts = []
    for a in alerts_config:
        try:
            ac = AlertConfig.model_validate(a)
            validated_alerts.append(ac.model_dump())
        except Exception as e:
            return json.dumps({"error": f"Invalid alert config: {e}"})

    # Validate actions
    validated_actions = []
    for a in actions_config:
        try:
            ac = ActionConfig.model_validate(a)
            validated_actions.append(ac.model_dump())
        except Exception as e:
            return json.dumps({"error": f"Invalid action config: {e}"})

    # Determine sort_order
    max_order = (await db.execute(select(func.coalesce(func.max(Module.sort_order), 0)))).scalar()

    mod = Module(
        name=name,
        display_name=display_name,
        description=description,
        icon=icon,
        fields_schema=validated_fields,
        status_lifecycle=status_lifecycle,
        alerts_config=validated_alerts,
        actions_config=validated_actions,
        sort_order=max_order + 1,
    )
    db.add(mod)
    await db.commit()
    await db.refresh(mod)

    return json.dumps({
        "success": True,
        "module_id": str(mod.id),
        "name": mod.name,
        "display_name": mod.display_name,
        "icon": mod.icon,
        "description": mod.description,
        "fields": validated_fields,
        "status_lifecycle": status_lifecycle,
        "alerts": validated_alerts,
        "actions": validated_actions,
        "_widget": {"type": "module_card"},
    })


async def _search_notes(args: dict, db: AsyncSession) -> str:
    from app.engine.embeddings import search_similar

    query = args.get("query", "")
    if not query:
        return json.dumps({"error": "query is required"})

    module_id = None
    module_name = args.get("module")
    if module_name:
        mod = await _get_module_by_name(module_name, db)
        if mod:
            module_id = mod.id

    try:
        results = await search_similar(
            query, db, module_id=module_id, limit=args.get("limit", 5)
        )
    except Exception:
        # Fallback to title search if no embeddings yet
        stmt = (
            select(Note)
            .where(Note.archived == False)  # noqa: E712
            .where(Note.title.ilike(f"%{query}%"))
            .limit(args.get("limit", 5))
        )
        rows = (await db.execute(stmt)).scalars().all()
        results = [
            {"note_id": str(n.id), "title": n.title, "module_id": str(n.module_id), "similarity": 0}
            for n in rows
        ]

    return json.dumps({"query": query, "results": results})


# --- Module management tools ---


async def _list_modules(db: AsyncSession) -> str:
    count_sq = (
        select(Note.module_id, func.count().label("cnt"))
        .where(Note.archived == False)  # noqa: E712
        .group_by(Note.module_id)
        .subquery()
    )
    stmt = (
        select(Module, func.coalesce(count_sq.c.cnt, 0).label("note_count"))
        .outerjoin(count_sq, Module.id == count_sq.c.module_id)
        .order_by(Module.sort_order, Module.created_at)
    )
    rows = (await db.execute(stmt)).all()
    modules = []
    for mod, note_count in rows:
        field_names = [f.get("name", "") for f in mod.fields_schema]
        modules.append({
            "module_id": str(mod.id),
            "name": mod.name,
            "display_name": mod.display_name,
            "description": mod.description,
            "icon": mod.icon,
            "fields": field_names,
            "status_lifecycle": mod.status_lifecycle or [],
            "note_count": note_count,
        })
    return json.dumps({"modules": modules, "count": len(modules), "_widget": {"type": "module_list"}})


async def _update_module(args: dict, db: AsyncSession) -> str:
    module_name = args.get("module_name")
    if not module_name:
        return json.dumps({"error": "module_name is required"})

    mod = await _get_module_by_name(module_name, db)
    if not mod:
        return json.dumps({"error": f"Module '{module_name}' not found"})

    updated_fields = []

    if "display_name" in args:
        mod.display_name = args["display_name"]
        updated_fields.append("display_name")
    if "description" in args:
        mod.description = args["description"]
        updated_fields.append("description")
    if "icon" in args:
        mod.icon = args["icon"]
        updated_fields.append("icon")
    if "status_lifecycle" in args:
        mod.status_lifecycle = args["status_lifecycle"]
        updated_fields.append("status_lifecycle")

    if "fields_schema" in args:
        validated_fields = []
        for f in args["fields_schema"]:
            try:
                fd = FieldDefinition.model_validate(f)
                validated_fields.append(fd.model_dump())
            except Exception as e:
                return json.dumps({"error": f"Invalid field definition: {e}"})
        mod.fields_schema = validated_fields
        updated_fields.append("fields_schema")

    if "alerts_config" in args:
        validated_alerts = []
        for a in args["alerts_config"]:
            try:
                ac = AlertConfig.model_validate(a)
                validated_alerts.append(ac.model_dump())
            except Exception as e:
                return json.dumps({"error": f"Invalid alert config: {e}"})
        mod.alerts_config = validated_alerts
        updated_fields.append("alerts_config")

    if "actions_config" in args:
        validated_actions = []
        for a in args["actions_config"]:
            try:
                ac = ActionConfig.model_validate(a)
                validated_actions.append(ac.model_dump())
            except Exception as e:
                return json.dumps({"error": f"Invalid action config: {e}"})
        mod.actions_config = validated_actions
        updated_fields.append("actions_config")

    if not updated_fields:
        return json.dumps({"error": "No fields to update"})

    await db.commit()
    await db.refresh(mod)

    # Return full module info for the widget
    field_names = [f.get("name", "") for f in mod.fields_schema]
    return json.dumps({
        "success": True,
        "module_id": str(mod.id),
        "name": mod.name,
        "display_name": mod.display_name,
        "icon": mod.icon,
        "description": mod.description,
        "fields": mod.fields_schema,
        "status_lifecycle": mod.status_lifecycle or [],
        "alerts": mod.alerts_config or [],
        "actions": mod.actions_config or [],
        "updated_fields": updated_fields,
        "_widget": {"type": "module_card"},
    })


async def _delete_module(args: dict, db: AsyncSession) -> str:
    module_name = args.get("module_name")
    if not module_name:
        return json.dumps({"error": "module_name is required"})

    mod = await _get_module_by_name(module_name, db)
    if not mod:
        return json.dumps({"error": f"Module '{module_name}' not found"})

    # Count notes for response
    note_count_result = await db.execute(
        select(func.count()).where(Note.module_id == mod.id)
    )
    note_count = note_count_result.scalar() or 0

    # Nullify suggestion FKs
    note_ids = (await db.execute(
        select(Note.id).where(Note.module_id == mod.id)
    )).scalars().all()
    await db.execute(
        update(Suggestion).where(Suggestion.module_id == mod.id).values(module_id=None)
    )
    if note_ids:
        await db.execute(
            update(Suggestion).where(Suggestion.related_note_id.in_(note_ids)).values(related_note_id=None)
        )

    await db.delete(mod)
    await db.commit()

    return json.dumps({
        "success": True,
        "deleted_module": module_name,
        "notes_deleted": note_count,
    })


# --- Suggestion tools ---


async def _list_suggestions(args: dict, db: AsyncSession) -> str:
    status = args.get("status", "pending")
    limit = args.get("limit", 10)

    stmt = (
        select(Suggestion)
        .where(Suggestion.status == status)
        .order_by(Suggestion.confidence.desc().nullslast(), Suggestion.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()

    suggestions = []
    for s in rows:
        # Get module name if available
        module_name = None
        if s.module_id:
            mod = await db.get(Module, s.module_id)
            if mod:
                module_name = mod.display_name

        suggestions.append({
            "suggestion_id": str(s.id),
            "type": s.type,
            "title": s.title,
            "summary": s.summary,
            "confidence": s.confidence,
            "module": module_name,
            "proposed_action": s.proposed_action,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })

    return json.dumps({"status": status, "count": len(suggestions), "suggestions": suggestions})


async def _accept_suggestion(args: dict, db: AsyncSession) -> str:
    suggestion_id = args.get("suggestion_id")
    if not suggestion_id:
        return json.dumps({"error": "suggestion_id is required"})

    try:
        s = await db.get(Suggestion, uuid.UUID(suggestion_id))
    except ValueError:
        return json.dumps({"error": "Invalid suggestion_id"})

    if not s:
        return json.dumps({"error": "Suggestion not found"})

    result = {"success": True, "suggestion_id": str(s.id)}

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
        asyncio.create_task(_embed_bg(note.id))

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
            result["note_id"] = str(note.id)

    s.status = "accepted"
    s.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    return json.dumps(result)


async def _reject_suggestion(args: dict, db: AsyncSession) -> str:
    suggestion_id = args.get("suggestion_id")
    if not suggestion_id:
        return json.dumps({"error": "suggestion_id is required"})

    try:
        s = await db.get(Suggestion, uuid.UUID(suggestion_id))
    except ValueError:
        return json.dumps({"error": "Invalid suggestion_id"})

    if not s:
        return json.dumps({"error": "Suggestion not found"})

    s.status = "rejected"
    s.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    return json.dumps({"success": True, "rejected": str(s.id)})


async def _snooze_suggestion(args: dict, db: AsyncSession) -> str:
    suggestion_id = args.get("suggestion_id")
    if not suggestion_id:
        return json.dumps({"error": "suggestion_id is required"})

    hours = args.get("hours", 24)

    try:
        s = await db.get(Suggestion, uuid.UUID(suggestion_id))
    except ValueError:
        return json.dumps({"error": "Invalid suggestion_id"})

    if not s:
        return json.dumps({"error": "Suggestion not found"})

    s.status = "snoozed"
    s.snoozed_until = datetime.now(timezone.utc) + timedelta(hours=hours)
    await db.commit()
    return json.dumps({"success": True, "snoozed": str(s.id), "until": s.snoozed_until.isoformat()})


# --- Profile tools ---


async def _get_profile(db: AsyncSession) -> str:
    result = await db.execute(select(UserProfile).limit(1))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserProfile(data={})
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return json.dumps({"profile_id": str(profile.id), "data": profile.data})


async def _update_profile(args: dict, db: AsyncSession) -> str:
    data = args.get("data", {})
    if not data:
        return json.dumps({"error": "data is required"})

    result = await db.execute(select(UserProfile).limit(1))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserProfile(data={})
        db.add(profile)
        await db.flush()

    profile.data = {**profile.data, **data}
    await db.commit()
    await db.refresh(profile)
    return json.dumps({"success": True, "profile_id": str(profile.id), "data": profile.data})


# --- Web tools ---


async def _web_search(args: dict) -> str:
    from app.services.web_search import web_search as ws_search

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


async def _fetch_page(args: dict) -> str:
    from app.services.web_search import fetch_page as ws_fetch

    url = args.get("url", "")
    max_chars = args.get("max_chars", 8000)
    try:
        content = await ws_fetch(url, max_chars)
        return json.dumps({"url": url, "content": content})
    except Exception as e:
        logger.exception("Fetch page failed")
        return json.dumps({"error": str(e)})


# --- Proactive scan trigger ---


async def _trigger_scan(args: dict, db: AsyncSession) -> str:
    from app.api.proactive import _run_full_scan, _run_module_scan

    module_name = args.get("module")
    if module_name:
        mod = await _get_module_by_name(module_name, db)
        if not mod:
            return json.dumps({"error": f"Module '{module_name}' not found"})
        asyncio.create_task(_run_module_scan(mod.id))
        return json.dumps({"status": "scan_started", "scope": f"module:{module_name}"})
    else:
        asyncio.create_task(_run_full_scan())
        return json.dumps({"status": "scan_started", "scope": "all_modules"})


# --- MCP management handlers ---


async def _list_mcp_servers(db: AsyncSession) -> str:
    from app.models.mcp_server import McpServer
    from app.engine.mcp_manager import mcp_manager

    rows = (await db.execute(select(McpServer).order_by(McpServer.name))).scalars().all()
    servers = []
    for s in rows:
        connected = s.name in mcp_manager._clients
        servers.append({
            "name": s.name,
            "display_name": s.display_name,
            "description": s.description,
            "transport": s.transport,
            "enabled": s.enabled,
            "connected": connected,
            "tool_count": len(s.cached_tools or []),
        })
    return json.dumps({"servers": servers})


async def _add_mcp_server(args: dict, db: AsyncSession) -> str:
    from app.models.mcp_server import McpServer
    from app.engine.mcp_manager import mcp_manager

    name = args.get("name", "")
    display_name = args.get("display_name", "")
    transport = args.get("transport", "")
    config = args.get("config", {})

    if not name or not display_name or not transport:
        return json.dumps({"error": "name, display_name, and transport are required"})
    if transport not in ("sse", "stdio"):
        return json.dumps({"error": "transport must be 'sse' or 'stdio'"})

    existing = (await db.execute(
        select(McpServer).where(McpServer.name == name)
    )).scalar_one_or_none()
    if existing:
        return json.dumps({"error": f"MCP server '{name}' already exists"})

    server = McpServer(
        name=name,
        display_name=display_name,
        description=args.get("description", ""),
        transport=transport,
        config=config,
        enabled=True,
    )
    db.add(server)
    await db.commit()
    await db.refresh(server)

    connected = await mcp_manager.add_server(server, db)

    return json.dumps({
        "success": True,
        "name": server.name,
        "display_name": server.display_name,
        "transport": server.transport,
        "connected": connected,
        "tool_count": len(server.cached_tools or []),
    })


async def _remove_mcp_server(args: dict, db: AsyncSession) -> str:
    from app.models.mcp_server import McpServer
    from app.engine.mcp_manager import mcp_manager

    name = args.get("name", "")
    if not name:
        return json.dumps({"error": "name is required"})

    server = (await db.execute(
        select(McpServer).where(McpServer.name == name)
    )).scalar_one_or_none()
    if not server:
        return json.dumps({"error": f"MCP server '{name}' not found"})

    await mcp_manager.remove_server(name)
    await db.delete(server)
    await db.commit()

    return json.dumps({"success": True, "removed": name})


async def _toggle_mcp_server(args: dict, db: AsyncSession) -> str:
    from app.models.mcp_server import McpServer
    from app.engine.mcp_manager import mcp_manager

    name = args.get("name", "")
    enabled = args.get("enabled")
    if not name:
        return json.dumps({"error": "name is required"})
    if enabled is None:
        return json.dumps({"error": "enabled (true/false) is required"})

    server = (await db.execute(
        select(McpServer).where(McpServer.name == name)
    )).scalar_one_or_none()
    if not server:
        return json.dumps({"error": f"MCP server '{name}' not found"})

    server.enabled = bool(enabled)
    await db.commit()
    await db.refresh(server)

    if server.enabled:
        connected = await mcp_manager.add_server(server, db)
    else:
        await mcp_manager.remove_server(name)
        connected = False

    return json.dumps({
        "success": True,
        "name": server.name,
        "enabled": server.enabled,
        "connected": connected,
    })


def _list_mcp_tools() -> str:
    from app.engine.mcp_manager import mcp_manager

    tools = []
    for server_info in mcp_manager.get_server_info():
        for tool_name in server_info["tools"]:
            tools.append({
                "name": tool_name,
                "server": server_info["name"],
                "server_display_name": server_info["display_name"],
            })
    return json.dumps({"tools": tools, "count": len(tools)})
