import type { Suggestion } from "../types/suggestion";
import { apiFetch } from "./client";

export function fetchSuggestions(status = "pending"): Promise<Suggestion[]> {
  return apiFetch(`/suggestions?status=${status}`);
}

export function acceptSuggestion(id: string): Promise<Record<string, unknown>> {
  return apiFetch(`/suggestions/${id}/accept`, { method: "POST" });
}

export function rejectSuggestion(id: string): Promise<void> {
  return apiFetch(`/suggestions/${id}/reject`, { method: "POST" });
}

export function snoozeSuggestion(id: string, hours = 24): Promise<void> {
  return apiFetch(`/suggestions/${id}/snooze?hours=${hours}`, { method: "POST" });
}

export function editSuggestion(
  id: string,
  payload: Record<string, unknown>
): Promise<Suggestion> {
  return apiFetch(`/suggestions/${id}/edit`, {
    method: "PUT",
    body: JSON.stringify({ proposed_payload: payload }),
  });
}

export function triggerProactiveScan(): Promise<{ status: string }> {
  return apiFetch("/proactive/scan", { method: "POST" });
}

export interface BriefingSection {
  name: string;
  color: string;
  items: { title: string; summary: string; id?: string; module_id?: string; related_note_id?: string }[];
}

export function fetchBriefing(): Promise<{ sections: BriefingSection[]; generated_at: string }> {
  return apiFetch("/briefing");
}
