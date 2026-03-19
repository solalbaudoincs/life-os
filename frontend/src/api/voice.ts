import type { ToolCallInfo } from "../types/chat";

interface VoiceResponse {
  transcript: string;
  response: string;
  tool_calls: ToolCallInfo[];
  conversation_id: string | null;
}

export async function sendVoice(
  audioBlob: Blob,
  conversationId?: string | null
): Promise<VoiceResponse> {
  const form = new FormData();
  form.append("audio", audioBlob, "recording.webm");
  if (conversationId) {
    form.append("conversation_id", conversationId);
  }

  const res = await fetch("/api/voice", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Voice API error ${res.status}: ${detail}`);
  }

  return res.json();
}
