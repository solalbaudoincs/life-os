import type { Module } from "../types/module";
import { apiFetch } from "./client";

export function fetchModules(): Promise<Module[]> {
  return apiFetch("/modules");
}

export function createModule(data: Partial<Module>): Promise<Module> {
  return apiFetch("/modules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateModule(id: string, data: Partial<Module>): Promise<Module> {
  return apiFetch(`/modules/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteModule(id: string): Promise<void> {
  return apiFetch(`/modules/${id}`, { method: "DELETE" });
}

export function reorderModules(ids: string[]): Promise<{ ok: boolean }> {
  return apiFetch("/modules/reorder", {
    method: "PUT",
    body: JSON.stringify({ ids }),
  });
}
