import type { McpServer, McpToolInfo } from "../types/mcp";
import { apiFetch } from "./client";

export function fetchMcpServers(): Promise<McpServer[]> {
  return apiFetch("/mcp-servers");
}

export function createMcpServer(
  data: Partial<McpServer>
): Promise<McpServer> {
  return apiFetch("/mcp-servers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateMcpServer(
  id: string,
  data: Partial<McpServer>
): Promise<McpServer> {
  return apiFetch(`/mcp-servers/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteMcpServer(id: string): Promise<void> {
  return apiFetch(`/mcp-servers/${id}`, { method: "DELETE" });
}

export function refreshMcpServer(id: string): Promise<McpServer> {
  return apiFetch(`/mcp-servers/${id}/refresh`, { method: "POST" });
}

export function fetchAllMcpTools(): Promise<McpToolInfo[]> {
  return apiFetch("/mcp-servers/tools");
}
