import { apiFetch } from "./client";

export interface ToolCallEntry {
  tool_name: string;
  arguments_summary: string;
  status: "running" | "completed" | "failed";
  started_at: string;
  finished_at: string | null;
  result_summary: string | null;
  round_number: number;
  reasoning: string | null;
}

export interface AgentRun {
  run_id: string;
  module_name: string;
  module_display_name: string;
  action_id: string;
  action_name: string;
  action_type: string;
  status: "running" | "completed" | "failed";
  started_at: string;
  finished_at: string | null;
  current_round: number;
  max_rounds: number;
  suggestions_created: number;
  tool_calls: ToolCallEntry[];
  error: string | null;
}

/** In-memory real-time activity (fast, 30-min retention) */
export function fetchAgentActivity(): Promise<{ runs: AgentRun[] }> {
  return apiFetch("/proactive/activity");
}

/* ---- Persisted history types ---- */

export interface PersistedToolCall {
  id: string;
  tool_name: string;
  arguments_summary: string;
  arguments_full: Record<string, unknown>;
  result_summary: string | null;
  result_full: Record<string, unknown> | null;
  reasoning: string | null;
  status: "running" | "completed" | "failed";
  round_number: number;
  started_at: string;
  finished_at: string | null;
}

export interface AgentRunSummary {
  id: string;
  module_id: string | null;
  action_id: string;
  action_name: string;
  action_type: string;
  status: "running" | "completed" | "failed";
  current_round: number;
  max_rounds: number;
  suggestions_created: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  tool_call_count: number;
}

export interface AgentRunDetail {
  id: string;
  module_id: string | null;
  action_id: string;
  action_name: string;
  action_type: string;
  status: "running" | "completed" | "failed";
  current_round: number;
  max_rounds: number;
  suggestions_created: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  tool_calls: PersistedToolCall[];
}

export interface AgentRunsListResponse {
  runs: AgentRunSummary[];
  total: number;
}

/** Paginated list of persisted agent runs */
export function fetchAgentRuns(
  params?: { status?: string; module_id?: string; limit?: number; offset?: number }
): Promise<AgentRunsListResponse> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.module_id) sp.set("module_id", params.module_id);
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return apiFetch(`/proactive/runs${qs ? `?${qs}` : ""}`);
}

/** Single run with full tool calls */
export function fetchAgentRunDetail(runId: string): Promise<AgentRunDetail> {
  return apiFetch(`/proactive/runs/${runId}`);
}
