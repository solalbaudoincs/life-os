import type { PendingConfirmation, SSEEvent, ToolCallInfo } from "../types/chat";
import { apiFetch } from "./client";

export interface ChatApiResponse {
  response: string;
  tool_calls: ToolCallInfo[];
  conversation_id: string;
  pending_confirmation?: PendingConfirmation | null;
  messages_snapshot?: Record<string, unknown>[] | null;
}

export function sendMessage(
  message: string,
  history: { role: string; content: string }[],
  conversationId?: string | null
): Promise<ChatApiResponse> {
  return apiFetch("/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      history,
      conversation_id: conversationId ?? null,
    }),
  });
}

export function confirmAction(
  conversationId: string,
  pendingTool: Record<string, unknown>,
  messagesSnapshot: Record<string, unknown>[]
): Promise<ChatApiResponse> {
  return apiFetch("/chat/confirm", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationId,
      pending_tool: pendingTool,
      messages_snapshot: messagesSnapshot,
    }),
  });
}

export function cancelAction(
  conversationId: string,
  pendingTool: Record<string, unknown>,
  messagesSnapshot: Record<string, unknown>[]
): Promise<ChatApiResponse> {
  return apiFetch("/chat/cancel", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationId,
      pending_tool: pendingTool,
      messages_snapshot: messagesSnapshot,
    }),
  });
}

export async function sendMessageStream(
  message: string,
  history: { role: string; content: string }[],
  conversationId: string | null | undefined,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history,
      conversation_id: conversationId ?? null,
    }),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${detail}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events: each event is "data: <json>\n\n"
    const parts = buffer.split("\n\n");
    buffer = parts.pop()!; // keep incomplete last chunk

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(trimmed.slice(6));
        onEvent(data as SSEEvent);
      } catch {
        // skip malformed events
      }
    }
  }

  // Process any remaining buffer
  const trimmed = buffer.trim();
  if (trimmed && trimmed.startsWith("data: ")) {
    try {
      const data = JSON.parse(trimmed.slice(6));
      onEvent(data as SSEEvent);
    } catch {
      // skip
    }
  }
}
