import { useEffect } from "react";
import { useUIStore } from "../stores/uiStore";
import { useNoteStore } from "../stores/noteStore";
import { useModuleStore } from "../stores/moduleStore";

export function useKeyboardShortcuts() {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const toggleChat = useUIStore((s) => s.toggleChat);
  const toggleVoice = useUIStore((s) => s.toggleVoice);
  const closeSearch = useUIStore((s) => s.closeSearch);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);

  const activeNoteId = useNoteStore((s) => s.activeNoteId);
  const setActiveNote = useNoteStore((s) => s.setActiveNote);
  const createNote = useNoteStore((s) => s.create);

  const modules = useModuleStore((s) => s.modules);
  const activeModuleId = useModuleStore((s) => s.activeModuleId);
  const setActiveModule = useModuleStore((s) => s.setActiveModule);
  const fetchForModule = useNoteStore((s) => s.fetchForModule);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const editable = tag === "input" || tag === "textarea" || tag === "select" ||
        (e.target as HTMLElement)?.isContentEditable;

      // Cmd+K or Cmd+P — toggle command palette (always active)
      if (meta && (e.key === "k" || e.key === "p")) {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
        return;
      }

      // Escape — close command palette, search, or deselect note
      if (e.key === "Escape") {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          return;
        }
        if (searchQuery !== null) {
          closeSearch();
          return;
        }
        if (activeNoteId) {
          setActiveNote(null);
          return;
        }
        return;
      }

      // Don't intercept other shortcuts when in an editable field
      if (editable) return;

      // Cmd+. — toggle chat overlay
      if (meta && e.key === ".") {
        e.preventDefault();
        toggleChat();
        return;
      }

      // Cmd+Shift+U — toggle voice recording
      if (meta && e.shiftKey && e.key === "u") {
        e.preventDefault();
        toggleVoice();
        return;
      }

      // Cmd+B — toggle sidebar
      if (meta && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Cmd+N — new note in active module
      if (meta && e.key === "n") {
        e.preventDefault();
        if (activeModuleId) {
          createNote({ module_id: activeModuleId, title: "Untitled", metadata: {} })
            .then((note) => setActiveNote(note.id));
        }
        return;
      }

      // Cmd+1 through Cmd+9 — switch module
      if (meta && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (idx < modules.length) {
          const mod = modules[idx];
          setActiveModule(mod.id);
          setActiveNote(null);
          fetchForModule(mod.id);
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    toggleSidebar, toggleChat, toggleVoice, closeSearch, searchQuery,
    commandPaletteOpen, setCommandPaletteOpen,
    activeNoteId, setActiveNote, createNote,
    modules, activeModuleId, setActiveModule, fetchForModule,
  ]);
}
