export interface Suggestion {
  id: string;
  module_id: string | null;
  action_id: string;
  related_note_id: string | null;
  type: "new_opportunity" | "follow_up" | "connection" | "alert" | "insight" | "enrichment";
  title: string;
  summary: string;
  data: Record<string, unknown>;
  confidence: number | null;
  proposed_action: string;
  proposed_payload: Record<string, unknown>;
  status: string;
  snoozed_until: string | null;
  resolved_at: string | null;
  created_at: string;
}
