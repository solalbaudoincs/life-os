export interface ToolCallInfo {
  name: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tool_calls?: ToolCallInfo[];
  suggested_followups?: string[];
}

export interface PendingConfirmation {
  tool_name: string;
  arguments: Record<string, unknown>;
  title: string;
  description: string;
  details: Record<string, unknown>;
  confirm_label: string;
  destructive: boolean;
}

// SSE event types from POST /api/chat/stream

export interface SSEStreamStart {
  type: "stream_start";
  conversation_id: string;
}

export interface SSEToolStart {
  type: "tool_start";
  name: string;
  arguments: Record<string, unknown>;
}

export interface SSEToolEnd {
  type: "tool_end";
  name: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface SSETextDelta {
  type: "text_delta";
  delta: string;
}

export interface SSEComplete {
  type: "complete";
  response: string;
  tool_calls: ToolCallInfo[];
  suggested_followups: string[];
}

export interface SSEPendingConfirmation {
  type: "pending_confirmation";
  tool_calls: ToolCallInfo[];
  pending_confirmation: PendingConfirmation;
  pending_tool: Record<string, unknown>;
  messages_snapshot: Record<string, unknown>[];
}

export interface SSEError {
  type: "error";
  message: string;
}

export type SSEEvent =
  | SSEStreamStart
  | SSEToolStart
  | SSEToolEnd
  | SSETextDelta
  | SSEComplete
  | SSEPendingConfirmation
  | SSEError;
