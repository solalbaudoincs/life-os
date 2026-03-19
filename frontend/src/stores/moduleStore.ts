import { create } from "zustand";
import type { Module, ActionConfig } from "../types/module";
import * as api from "../api/modules";

interface ActionReview {
  moduleId: string;
  actions: ActionConfig[];
}

interface ModuleState {
  modules: Module[];
  activeModuleId: string | null;
  loading: boolean;
  pendingActionReview: ActionReview | null;

  setActiveModule: (id: string | null) => void;
  fetch: () => Promise<void>;
  create: (data: Partial<Module>) => Promise<Module>;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
  setPendingActionReview: (review: ActionReview | null) => void;
}

export const useModuleStore = create<ModuleState>((set, get) => ({
  modules: [],
  activeModuleId: null,
  loading: false,
  pendingActionReview: null,

  setActiveModule: (id) => set({ activeModuleId: id }),

  fetch: async () => {
    set({ loading: true });
    try {
      const modules = await api.fetchModules();
      set({ modules });
    } finally {
      set({ loading: false });
    }
  },

  create: async (data) => {
    const mod = await api.createModule(data);
    set({ modules: [...get().modules, mod] });
    return mod;
  },

  remove: async (id) => {
    await api.deleteModule(id);
    const { modules, activeModuleId } = get();
    set({
      modules: modules.filter((m) => m.id !== id),
      activeModuleId: activeModuleId === id ? null : activeModuleId,
    });
  },

  reorder: async (ids) => {
    const prev = get().modules;
    const sorted = ids.map((id) => prev.find((m) => m.id === id)!).filter(Boolean);
    set({ modules: sorted });
    try {
      await api.reorderModules(ids);
    } catch {
      set({ modules: prev });
    }
  },

  setPendingActionReview: (review) => set({ pendingActionReview: review }),
}));
