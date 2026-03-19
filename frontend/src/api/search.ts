import { apiFetch } from "./client";

export interface SearchResult {
  note_id: string;
  title: string;
  content_preview: string;
  metadata: Record<string, unknown>;
  module_id: string;
  module_name: string;
  module_display_name: string;
  module_icon: string;
  similarity: number;
  updated_at: string;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export function searchNotes(
  q: string,
  module?: string,
  limit?: number
): Promise<SearchResponse> {
  const sp = new URLSearchParams({ q });
  if (module) sp.set("module", module);
  if (limit) sp.set("limit", String(limit));
  return apiFetch(`/search?${sp.toString()}`);
}
