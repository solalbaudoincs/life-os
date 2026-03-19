"""Singleton manager for MCP server connections, tool caching, and execution dispatch."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class MCPManager:
    """Manages MCP server connections and tools.

    Lifecycle: initialized at app startup, shut down at app teardown.
    Long-lived MCP client instances keyed by server name.
    """

    def __init__(self) -> None:
        self._clients: dict[str, Any] = {}  # name → MCPClientBase
        self._tools_cache: dict[str, list[dict]] = {}  # name → namespaced Mistral tool defs
        self._server_meta: dict[str, dict] = {}  # name → {display_name, description}
        self._lock = asyncio.Lock()

    # ---- Lifecycle ----

    async def startup(self, db: AsyncSession) -> None:
        """Load enabled servers from DB and connect each."""
        from app.models.mcp_server import McpServer

        rows = (await db.execute(
            select(McpServer).where(McpServer.enabled == True)  # noqa: E712
        )).scalars().all()

        for server in rows:
            try:
                await self._connect_server(server, db)
            except Exception:
                logger.exception("Failed to connect MCP server '%s' on startup", server.name)

    async def shutdown(self) -> None:
        """Close all MCP client connections."""
        async with self._lock:
            for name, client in self._clients.items():
                try:
                    await client.aclose()
                except Exception:
                    logger.debug("Error closing MCP client '%s'", name, exc_info=True)
            self._clients.clear()
            self._tools_cache.clear()
            self._server_meta.clear()

    # ---- Connection management ----

    async def _connect_server(self, server: Any, db: AsyncSession | None = None) -> bool:
        """Instantiate and initialize an MCP client for one server.

        Returns True on success.
        """
        from app.models.mcp_server import McpServer

        name = server.name
        transport = server.transport
        config = server.config or {}

        try:
            client = self._create_client(name, transport, config)
            await client.initialize()

            # Fetch tool definitions
            raw_tools = await client.get_tools()
            namespaced = self._convert_tools_to_dicts(name, raw_tools)

            async with self._lock:
                # Close existing client if reconnecting
                if name in self._clients:
                    try:
                        await self._clients[name].aclose()
                    except Exception:
                        pass
                self._clients[name] = client
                self._tools_cache[name] = namespaced
                self._server_meta[name] = {
                    "display_name": server.display_name,
                    "description": server.description,
                }

            # Persist cached tools and connection timestamp
            if db is not None:
                server.cached_tools = [
                    {"name": t["function"]["name"], "description": t["function"].get("description", ""), "parameters": t["function"].get("parameters", {})}
                    for t in namespaced
                ]
                server.last_connected_at = datetime.now(timezone.utc)
                await db.commit()
                await db.refresh(server)

            logger.info("Connected MCP server '%s' (%s) — %d tools", name, transport, len(namespaced))
            return True

        except Exception:
            logger.exception("Failed to connect MCP server '%s'", name)
            # Use cached tools as fallback
            cached = getattr(server, "cached_tools", None) or []
            if cached:
                async with self._lock:
                    self._tools_cache[name] = [
                        self._cached_to_tool_dict(name, t) for t in cached
                    ]
                    self._server_meta[name] = {
                        "display_name": server.display_name,
                        "description": server.description,
                    }
                logger.info("Using %d cached tools for MCP server '%s'", len(cached), name)
            return False

    def _create_client(self, name: str, transport: str, config: dict) -> Any:
        """Create the appropriate Mistral MCP client."""
        if transport == "sse":
            from mistralai.extra.mcp.sse import MCPClientSSE, SSEServerParams
            params = SSEServerParams(
                url=config["url"],
                headers=config.get("headers"),
                timeout=config.get("timeout", 5),
                sse_read_timeout=config.get("sse_read_timeout", 300),
            )
            return MCPClientSSE(sse_params=params, name=name)

        elif transport == "stdio":
            from mistralai.extra.mcp.stdio import MCPClientSTDIO
            from mcp import StdioServerParameters
            params = StdioServerParameters(
                command=config["command"],
                args=config.get("args", []),
                env=config.get("env"),
            )
            return MCPClientSTDIO(stdio_params=params, name=name)

        raise ValueError(f"Unknown transport: {transport}")

    async def add_server(self, server: Any, db: AsyncSession) -> bool:
        """Connect a newly added or re-enabled server."""
        return await self._connect_server(server, db)

    async def remove_server(self, name: str) -> None:
        """Disconnect and remove a server."""
        async with self._lock:
            client = self._clients.pop(name, None)
            self._tools_cache.pop(name, None)
            self._server_meta.pop(name, None)
        if client:
            try:
                await client.aclose()
            except Exception:
                logger.debug("Error closing MCP client '%s'", name, exc_info=True)

    async def refresh_server(self, name: str, db: AsyncSession) -> bool:
        """Reconnect and re-fetch tools for a server."""
        from app.models.mcp_server import McpServer
        server = (await db.execute(
            select(McpServer).where(McpServer.name == name)
        )).scalar_one_or_none()
        if not server:
            return False
        return await self._connect_server(server, db)

    # ---- Tool access ----

    def get_all_tools(self) -> list[dict]:
        """Return all namespaced tool definitions from all connected servers."""
        tools: list[dict] = []
        for server_tools in self._tools_cache.values():
            tools.extend(server_tools)
        return tools

    def get_tools_for_servers(self, server_names: list[str]) -> list[dict]:
        """Return all tools from the named servers."""
        tools: list[dict] = []
        for name in server_names:
            tools.extend(self._tools_cache.get(name, []))
        return tools

    def get_server_info(self) -> list[dict]:
        """Return summary info for the system prompt."""
        info = []
        for name, meta in self._server_meta.items():
            tool_names = [t["function"]["name"] for t in self._tools_cache.get(name, [])]
            info.append({
                "name": name,
                "display_name": meta.get("display_name", name),
                "description": meta.get("description", ""),
                "tools": tool_names,
            })
        return info

    def is_mcp_tool(self, name: str) -> bool:
        """Check if a tool name belongs to an MCP server."""
        return name.startswith("mcp__")

    async def execute_tool(self, namespaced_name: str, arguments: dict) -> str:
        """Execute an MCP tool call. Returns result as JSON string."""
        parsed = self.parse_namespaced_name(namespaced_name)
        if parsed is None:
            return json.dumps({"error": f"Invalid MCP tool name: {namespaced_name}"})

        server_name, tool_name = parsed
        client = self._clients.get(server_name)
        if client is None:
            return json.dumps({"error": f"MCP server '{server_name}' is not connected"})

        try:
            result_chunks = await client.execute_tool(tool_name, arguments)
            # Combine text chunks into a single result
            texts = [chunk.get("text", "") for chunk in result_chunks if isinstance(chunk, dict)]
            combined = "\n".join(texts) if texts else str(result_chunks)
            return combined if combined else json.dumps({"result": "ok"})
        except Exception as e:
            # Attempt one reconnect
            logger.warning("MCP tool '%s' failed, attempting reconnect: %s", namespaced_name, e)
            try:
                from app.database import async_session
                async with async_session() as db:
                    reconnected = await self.refresh_server(server_name, db)
                if reconnected:
                    client = self._clients.get(server_name)
                    if client:
                        result_chunks = await client.execute_tool(tool_name, arguments)
                        texts = [chunk.get("text", "") for chunk in result_chunks if isinstance(chunk, dict)]
                        combined = "\n".join(texts) if texts else str(result_chunks)
                        return combined if combined else json.dumps({"result": "ok"})
            except Exception as retry_err:
                logger.exception("MCP reconnect failed for '%s'", server_name)
                return json.dumps({"error": f"MCP tool error after reconnect: {retry_err}"})
            return json.dumps({"error": f"MCP tool error: {e}"})

    # ---- Namespacing ----

    @staticmethod
    def namespace_tool_name(server_name: str, tool_name: str) -> str:
        return f"mcp__{server_name}__{tool_name}"

    @staticmethod
    def parse_namespaced_name(namespaced: str) -> tuple[str, str] | None:
        """Parse 'mcp__server__tool' -> (server, tool) or None."""
        if not namespaced.startswith("mcp__"):
            return None
        rest = namespaced[5:]  # strip "mcp__"
        idx = rest.find("__")
        if idx < 0:
            return None
        return rest[:idx], rest[idx + 2:]

    # ---- Conversion helpers ----

    def _convert_tools_to_dicts(self, server_name: str, tools: list) -> list[dict]:
        """Convert Mistral FunctionTool objects to namespaced dict format."""
        result = []
        for tool in tools:
            fn = tool.function if hasattr(tool, "function") else tool.get("function", {})
            original_name = fn.name if hasattr(fn, "name") else fn.get("name", "")
            description = fn.description if hasattr(fn, "description") else fn.get("description", "")
            parameters = fn.parameters if hasattr(fn, "parameters") else fn.get("parameters", {})

            result.append({
                "type": "function",
                "function": {
                    "name": self.namespace_tool_name(server_name, original_name),
                    "description": f"[{server_name}] {description}" if description else f"[{server_name}] {original_name}",
                    "parameters": parameters if isinstance(parameters, dict) else {},
                },
            })
        return result

    def _cached_to_tool_dict(self, server_name: str, cached: dict) -> dict:
        """Convert a cached tool entry back to Mistral tool dict format."""
        name = cached.get("name", "")
        # If already namespaced, use as-is; otherwise namespace it
        if not name.startswith("mcp__"):
            name = self.namespace_tool_name(server_name, name)
        return {
            "type": "function",
            "function": {
                "name": name,
                "description": cached.get("description", ""),
                "parameters": cached.get("parameters", {}),
            },
        }


# Module-level singleton
mcp_manager = MCPManager()
