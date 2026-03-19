import { create } from "zustand";
import type { Note } from "../types/note";
import * as api from "../api/notes";

interface NoteState {
  notes: Note[];
  activeNoteId: string | null;
  loading: boolean;

  setActiveNote: (id: string | null) => void;
  fetchForModule: (moduleId: string) => Promise<void>;
  create: (data: {
    module_id: string;
    title: string;
    content_md?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<Note>;
  update: (
    id: string,
    data: Partial<Pick<Note, "title" | "content_md" | "metadata" | "archived">>
  ) => Promise<Note>;
  remove: (id: string) => Promise<void>;
}

let _fetchSeq = 0;

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  activeNoteId: null,
  loading: false,

  setActiveNote: (id) => set({ activeNoteId: id }),

  fetchForModule: async (moduleId) => {
    const seq = ++_fetchSeq;
    set({ loading: true });
    try {
      const notes = await api.fetchNotes({ module: moduleId });
      if (seq === _fetchSeq) {
        set({ notes });
      }
    } finally {
      if (seq === _fetchSeq) {
        set({ loading: false });
      }
    }
  },

  create: async (data) => {
    const note = await api.createNote(data);
    set({ notes: [note, ...get().notes] });
    return note;
  },

  update: async (id, data) => {
    const updated = await api.updateNote(id, data);
    set({
      notes: get().notes.map((n) => (n.id === id ? updated : n)),
    });
    return updated;
  },

  remove: async (id) => {
    await api.deleteNote(id);
    set({ notes: get().notes.filter((n) => n.id !== id) });
  },
}));
