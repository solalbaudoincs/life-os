"""CRUD API for MCP server management."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.engine.mcp_manager import mcp_manager
from app.models.mcp_server import McpServer
from app.schemas.mcp_server_schema import (
    McpServerCreate,
    McpServerResponse,
    McpServerUpdate,
    McpToolInfo,
)

router = APIRouter(prefix="/api/mcp-servers", tags=["mcp-servers"])


def _to_response(server: McpServer) -> dict:
    """Convert a McpServer ORM instance to response dict."""
    cached = server.cached_tools or []
    return {
        "id": server.id,
        "name": server.name,
        "display_name": server.display_name,
        "description": server.description,
        "transport": server.transport,
        "config": server.config,
        "enabled": server.enabled,
        "cached_tools": [
            {"name": t.get("name", ""), "description": t.get("description"), "parameters": t.get("parameters")}
            for t in cached
        ],
        "last_connected_at": server.last_connected_at,
        "created_at": server.created_at,
        "updated_at": server.updated_at,
    }


@router.get("", response_model=list[McpServerResponse])
async def list_servers(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(McpServer).order_by(McpServer.name))).scalars().all()
    return [_to_response(s) for s in rows]


@router.post("", response_model=McpServerResponse, status_code=201)
async def create_server(body: McpServerCreate, db: AsyncSession = Depends(get_db)):
    # Check uniqueness
    existing = (await db.execute(
        select(McpServer).where(McpServer.name == body.name)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(400, f"MCP server '{body.name}' already exists")

    server = McpServer(
        name=body.name,
        display_name=body.display_name,
        description=body.description,
        transport=body.transport,
        config=body.config,
        enabled=body.enabled,
    )
    db.add(server)
    await db.commit()
    await db.refresh(server)

    # Connect if enabled
    if server.enabled:
        await mcp_manager.add_server(server, db)

    return _to_response(server)


@router.put("/{server_id}", response_model=McpServerResponse)
async def update_server(
    server_id: uuid.UUID, body: McpServerUpdate, db: AsyncSession = Depends(get_db)
):
    server = await db.get(McpServer, server_id)
    if not server:
        raise HTTPException(404, "MCP server not found")

    needs_reconnect = False
    was_enabled = server.enabled

    if body.display_name is not None:
        server.display_name = body.display_name
    if body.description is not None:
        server.description = body.description
    if body.transport is not None and body.transport != server.transport:
        server.transport = body.transport
        needs_reconnect = True
    if body.config is not None and body.config != server.config:
        server.config = body.config
        needs_reconnect = True
    if body.enabled is not None:
        server.enabled = body.enabled

    await db.commit()
    await db.refresh(server)

    # Handle connection state changes
    if not server.enabled and was_enabled:
        await mcp_manager.remove_server(server.name)
    elif server.enabled and (not was_enabled or needs_reconnect):
        await mcp_manager.add_server(server, db)

    return _to_response(server)


@router.delete("/{server_id}", status_code=204)
async def delete_server(server_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    server = await db.get(McpServer, server_id)
    if not server:
        raise HTTPException(404, "MCP server not found")

    await mcp_manager.remove_server(server.name)
    await db.delete(server)
    await db.commit()


@router.post("/{server_id}/refresh", response_model=McpServerResponse)
async def refresh_server(server_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    server = await db.get(McpServer, server_id)
    if not server:
        raise HTTPException(404, "MCP server not found")

    await mcp_manager.refresh_server(server.name, db)
    await db.refresh(server)
    return _to_response(server)


@router.get("/tools", response_model=list[McpToolInfo])
async def list_all_tools():
    tools = []
    for info in mcp_manager.get_server_info():
        for tool_name in info["tools"]:
            tools.append({"name": tool_name, "description": None, "parameters": None})

    # Enrich with actual descriptions from cached tools
    all_tool_defs = mcp_manager.get_all_tools()
    tool_map = {t["function"]["name"]: t["function"] for t in all_tool_defs}
    for tool in tools:
        fn = tool_map.get(tool["name"])
        if fn:
            tool["description"] = fn.get("description")
            tool["parameters"] = fn.get("parameters")

    return tools
