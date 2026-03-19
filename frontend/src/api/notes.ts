import type { Note } from "../types/note";
import { apiFetch } from "./client";

export function fetchNotes(params: {
  module?: string;
  status?: string;
  sort_by?: string;
  limit?: number;
}): Promise<Note[]> {
  const sp = new URLSearchParams();
  if (params.module) sp.set("module", params.module);
  if (params.status) sp.set("status", params.status);
  if (params.sort_by) sp.set("sort_by", params.sort_by);
  if (params.limit) sp.set("limit", String(params.limit));
  return apiFetch(`/notes?${sp.toString()}`);
}

export function fetchNote(id: string): Promise<Note> {
  return apiFetch(`/notes/${id}`);
}

export function createNote(data: {
  module_id: string;
  title: string;
  content_md?: string;
  metadata?: Record<string, unknown>;
}): Promise<Note> {
  return apiFetch("/notes", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateNote(
  id: string,
  data: Partial<Pick<Note, "title" | "content_md" | "metadata" | "archived">>
): Promise<Note> {
  return apiFetch(`/notes/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteNote(id: string): Promise<void> {
  return apiFetch(`/notes/${id}`, { method: "DELETE" });
}
