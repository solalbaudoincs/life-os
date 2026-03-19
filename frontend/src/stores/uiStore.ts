import { create } from "zustand";

type View = "dashboard" | "table" | "pipeline" | "calendar" | "agents";
type Breakpoint = "desktop" | "tablet" | "mobile";
type VoiceState = "idle" | "recording" | "processing";
export type CommandPaletteMode = "default" | "chats";

interface UIState {
  activeView: View;
  setActiveView: (v: View) => void;

  searchQuery: string | null;
  openSearch: (query: string) => void;
  closeSearch: () => void;

  showAgentOverview: boolean;
  setShowAgentOverview: (v: boolean) => void;

  showSuggestionsView: boolean;
  setShowSuggestionsView: (v: boolean) => void;

  showMcpSettings: boolean;
  setShowMcpSettings: (v: boolean) => void;

  suggestionModuleFilter: string | null;
  setSuggestionModuleFilter: (id: string | null) => void;

  highlightSuggestionId: string | null;
  setHighlightSuggestionId: (id: string | null) => void;

  commandPaletteOpen: boolean;
  commandPaletteMode: CommandPaletteMode;
  setCommandPaletteOpen: (v: boolean, mode?: CommandPaletteMode) => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;

  chatOpen: boolean;
  toggleChat: () => void;
  setChatOpen: (v: boolean) => void;

  voiceActive: boolean;
  toggleVoice: () => void;
  voiceState: VoiceState;
  setVoiceState: (s: VoiceState) => void;

  breakpoint: Breakpoint;
  setBreakpoint: (b: Breakpoint) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeView: "dashboard",
  setActiveView: (v) => set({ activeView: v }),

  searchQuery: null,
  openSearch: (query) => set({ searchQuery: query }),
  closeSearch: () => set({ searchQuery: null }),

  showAgentOverview: false,
  setShowAgentOverview: (v) => set({ showAgentOverview: v, ...(v ? { showSuggestionsView: false } : {}) }),

  showSuggestionsView: false,
  setShowSuggestionsView: (v) => set({ showSuggestionsView: v, ...(v ? { showAgentOverview: false, showMcpSettings: false } : { suggestionModuleFilter: null }) }),

  showMcpSettings: false,
  setShowMcpSettings: (v) => set({ showMcpSettings: v, ...(v ? { showAgentOverview: false, showSuggestionsView: false } : {}) }),

  suggestionModuleFilter: null,
  setSuggestionModuleFilter: (id) => set({ suggestionModuleFilter: id }),

  highlightSuggestionId: null,
  setHighlightSuggestionId: (id) => set({ highlightSuggestionId: id }),

  commandPaletteOpen: false,
  commandPaletteMode: "default",
  setCommandPaletteOpen: (v, mode) => set({ commandPaletteOpen: v, commandPaletteMode: v ? (mode ?? "default") : "default" }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

  chatOpen: false,
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
  setChatOpen: (v) => set({ chatOpen: v }),

  voiceActive: false,
  toggleVoice: () => set((s) => {
    // Don't toggle off while processing
    if (s.voiceState === "processing") return {};
    return { voiceActive: !s.voiceActive };
  }),
  voiceState: "idle" as VoiceState,
  setVoiceState: (v) => set({ voiceState: v }),

  breakpoint: "desktop",
  setBreakpoint: (b) => set({ breakpoint: b }),
}));
