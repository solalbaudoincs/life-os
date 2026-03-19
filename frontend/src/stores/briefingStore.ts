import { create } from "zustand";
import { fetchBriefing, type BriefingSection } from "../api/suggestions";

const CACHE_KEY = "briefing_cache";
const CACHE_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours

interface CachedBriefing {
  sections: BriefingSection[];
  generated_at: string;
  cached_at: number; // Date.now()
}

interface BriefingState {
  sections: BriefingSection[];
  generatedAt: string;
  cachedAt: number | null;
  loading: boolean;
  load: () => Promise<void>;
  regenerate: () => Promise<void>;
  isStale: () => boolean;
}

function readCache(): CachedBriefing | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedBriefing;
  } catch {
    return null;
  }
}

function writeCache(data: CachedBriefing) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

export const useBriefingStore = create<BriefingState>((set, get) => ({
  sections: [],
  generatedAt: "",
  cachedAt: null,
  loading: false,

  isStale: () => {
    const { cachedAt } = get();
    if (!cachedAt) return true;
    return Date.now() - cachedAt > CACHE_MAX_AGE_MS;
  },

  load: async () => {
    // Try cache first
    const cached = readCache();
    if (cached && Date.now() - cached.cached_at < CACHE_MAX_AGE_MS) {
      set({
        sections: cached.sections,
        generatedAt: cached.generated_at,
        cachedAt: cached.cached_at,
        loading: false,
      });
      return;
    }

    // Fetch fresh
    set({ loading: true });
    try {
      const resp = await fetchBriefing();
      const now = Date.now();
      const cacheData: CachedBriefing = {
        sections: resp.sections,
        generated_at: resp.generated_at,
        cached_at: now,
      };
      writeCache(cacheData);
      set({
        sections: resp.sections,
        generatedAt: resp.generated_at,
        cachedAt: now,
      });
    } finally {
      set({ loading: false });
    }
  },

  regenerate: async () => {
    set({ loading: true });
    try {
      const resp = await fetchBriefing();
      const now = Date.now();
      const cacheData: CachedBriefing = {
        sections: resp.sections,
        generated_at: resp.generated_at,
        cached_at: now,
      };
      writeCache(cacheData);
      set({
        sections: resp.sections,
        generatedAt: resp.generated_at,
        cachedAt: now,
      });
    } finally {
      set({ loading: false });
    }
  },
}));
