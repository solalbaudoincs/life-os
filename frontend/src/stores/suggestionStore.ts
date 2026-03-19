import { create } from "zustand";
import type { Suggestion } from "../types/suggestion";
import * as api from "../api/suggestions";

interface SuggestionState {
  suggestions: Suggestion[];
  loading: boolean;
  editingId: string | null;

  fetch: () => Promise<void>;
  accept: (id: string) => Promise<Record<string, unknown>>;
  reject: (id: string) => Promise<void>;
  snooze: (id: string, hours?: number) => Promise<void>;
  setEditing: (id: string | null) => void;
  updatePayload: (id: string, payload: Record<string, unknown>) => Promise<void>;
}

export const useSuggestionStore = create<SuggestionState>((set, get) => ({
  suggestions: [],
  loading: false,
  editingId: null,

  fetch: async () => {
    set({ loading: true });
    try {
      const suggestions = await api.fetchSuggestions();
      set({ suggestions });
    } finally {
      set({ loading: false });
    }
  },

  accept: async (id) => {
    const result = await api.acceptSuggestion(id);
    set({ suggestions: get().suggestions.filter((s) => s.id !== id) });
    return result;
  },

  reject: async (id) => {
    await api.rejectSuggestion(id);
    set({ suggestions: get().suggestions.filter((s) => s.id !== id) });
  },

  snooze: async (id, hours = 24) => {
    await api.snoozeSuggestion(id, hours);
    set({ suggestions: get().suggestions.filter((s) => s.id !== id) });
  },

  setEditing: (id) => set({ editingId: id }),

  updatePayload: async (id, payload) => {
    const updated = await api.editSuggestion(id, payload);
    set({
      suggestions: get().suggestions.map((s) => (s.id === id ? updated : s)),
      editingId: null,
    });
  },
}));
