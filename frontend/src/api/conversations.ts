import { apiFetch } from "./client";

export interface ConversationSummary {
  id: string;
  title: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  tool_calls?: { name: string; arguments: Record<string, unknown>; result: Record<string, unknown> }[];
  created_at: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  messages: ConversationMessage[];
}

export function listConversations(): Promise<ConversationSummary[]> {
  return apiFetch("/conversations");
}

export function getConversation(id: string): Promise<ConversationDetail> {
  return apiFetch(`/conversations/${id}`);
}

export function deleteConversation(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/conversations/${id}`, { method: "DELETE" });
}

export function updateConversation(id: string, title: string): Promise<ConversationSummary> {
  return apiFetch(`/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}
