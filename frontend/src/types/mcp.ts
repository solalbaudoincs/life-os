export interface McpToolInfo {
  name: string;
  description: string | null;
  parameters: Record<string, unknown> | null;
}

export interface McpServer {
  id: string;
  name: string;
  display_name: string;
  description: string;
  transport: "sse" | "stdio";
  config: Record<string, unknown>;
  enabled: boolean;
  cached_tools: McpToolInfo[];
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}
