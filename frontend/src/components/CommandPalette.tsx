import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  FileText,
  Folder,
  Plus,
  PanelLeft,
  BarChart3,
  Calendar,
  Table,
  Activity,
  MessageSquare,
  Layers,
  Clock,
  Trash2,
} from "lucide-react";
import { useUIStore } from "../stores/uiStore";
import { useModuleStore } from "../stores/moduleStore";
import { useNoteStore } from "../stores/noteStore";
import { useChatStore } from "../stores/chatStore";
import { searchNotes, type SearchResult } from "../api/search";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";

type PaletteItem = {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  category: "action" | "module" | "view" | "note" | "chat";
  action: () => void;
};

export function CommandPalette() {
  const [query, setQuery] = useState("");
  const [noteResults, setNoteResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const close = useUIStore((s) => s.setCommandPaletteOpen);
  const mode = useUIStore((s) => s.commandPaletteMode);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setShowAgentOverview = useUIStore((s) => s.setShowAgentOverview);
  const setShowSuggestionsView = useUIStore((s) => s.setShowSuggestionsView);
  const isChatsMode = mode === "chats";

  const { modules, setActiveModule } = useModuleStore();
  const { setActiveNote, create: createNote, fetchForModule } = useNoteStore();
  const activeModuleId = useModuleStore((s) => s.activeModuleId);
  const { clear: clearChat, send: sendChat, conversations, conversationsLoaded, fetchConversations, loadConversation, deleteConversation } = useChatStore();

  // Load conversations on mount if not yet loaded
  useEffect(() => {
    if (!conversationsLoaded) fetchConversations();
  }, [conversationsLoaded, fetchConversations]);

  // Search notes when query changes
  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (query.trim().length < 2) {
      setNoteResults([]);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const resp = await searchNotes(query.trim(), undefined, 5);
        setNoteResults(resp.results);
      } catch {
        setNoteResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
  }, [query]);

  const dismiss = () => close(false);

  const exec = (item: PaletteItem) => {
    item.action();
    dismiss();
  };

  // Build items list
  const { actions, views, moduleItems, noteItems, chatItems } = useMemo(() => {
    const q = query.toLowerCase().trim();

    const match = (item: PaletteItem) =>
      !q || item.label.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q);

    // Actions
    const allActions: PaletteItem[] = [
      {
        id: "new-note",
        label: "New Note",
        description: activeModuleId ? "Create in current module" : "Select a module first",
        icon: <Plus className="h-4 w-4" />,
        category: "action",
        action: () => {
          if (activeModuleId) {
            createNote({ module_id: activeModuleId, title: "Untitled", metadata: {} })
              .then((n) => setActiveNote(n.id));
          }
        },
      },
      {
        id: "new-module",
        label: "New Module",
        description: "Create a new module via the agent",
        icon: <Folder className="h-4 w-4" />,
        category: "action",
        action: () => {
          setActiveModule(null);
          setActiveNote(null);
          setShowAgentOverview(false);
          clearChat();
          setTimeout(() => sendChat("I want to create a new module. Help me design it."), 50);
        },
      },
      {
        id: "toggle-sidebar",
        label: "Toggle Sidebar",
        description: "Cmd+B",
        icon: <PanelLeft className="h-4 w-4" />,
        category: "action",
        action: toggleSidebar,
      },
      {
        id: "agent-overview",
        label: "Agent Overview",
        description: "View all agent runs",
        icon: <Activity className="h-4 w-4" />,
        category: "action",
        action: () => {
          setActiveModule(null);
          setActiveNote(null);
          setShowAgentOverview(true);
        },
      },
      {
        id: "open-chat",
        label: "Open Chat",
        description: "Go to the full-screen chat",
        icon: <MessageSquare className="h-4 w-4" />,
        category: "action",
        action: () => {
          setActiveModule(null);
          setActiveNote(null);
          setShowAgentOverview(false);
        },
      },
    ];

    // Views (only when a module is active)
    const allViews: PaletteItem[] = activeModuleId
      ? [
          {
            id: "view-table",
            label: "Table View",
            icon: <Table className="h-4 w-4" />,
            category: "view" as const,
            action: () => setActiveView("table"),
          },
          {
            id: "view-calendar",
            label: "Calendar View",
            icon: <Calendar className="h-4 w-4" />,
            category: "view" as const,
            action: () => setActiveView("calendar"),
          },
          {
            id: "view-pipeline",
            label: "Pipeline View",
            icon: <Layers className="h-4 w-4" />,
            category: "view" as const,
            action: () => setActiveView("pipeline"),
          },
          {
            id: "view-agents",
            label: "Agents View",
            icon: <Activity className="h-4 w-4" />,
            category: "view" as const,
            action: () => setActiveView("agents"),
          },
        ]
      : [];

    // Modules
    const allModuleItems: PaletteItem[] = modules.map((mod) => ({
      id: `mod-${mod.id}`,
      label: mod.display_name,
      description: `${mod.note_count} notes`,
      icon: <span className="text-sm leading-none">{mod.icon}</span>,
      category: "module" as const,
      action: () => {
        setActiveModule(mod.id);
        setActiveNote(null);
        setShowAgentOverview(false);
        fetchForModule(mod.id);
      },
    }));

    // Note search results
    const allNoteItems: PaletteItem[] = noteResults.map((r) => ({
      id: `note-${r.note_id}`,
      label: r.title,
      description: r.module_display_name,
      icon: <FileText className="h-4 w-4" />,
      category: "note" as const,
      action: () => {
        setActiveModule(r.module_id);
        fetchForModule(r.module_id);
        setTimeout(() => setActiveNote(r.note_id), 100);
      },
    }));

    // Recent chats
    const allChatItems: PaletteItem[] = conversations.slice(0, 8).map((conv) => ({
      id: `chat-${conv.id}`,
      label: conv.title,
      description: `${conv.message_count} messages`,
      icon: <Clock className="h-4 w-4" />,
      category: "chat" as const,
      action: () => {
        setActiveModule(null);
        setActiveNote(null);
        setShowAgentOverview(false);
        setShowSuggestionsView(false);
        loadConversation(conv.id);
      },
    }));

    if (isChatsMode) {
      return {
        actions: [] as PaletteItem[],
        views: [] as PaletteItem[],
        moduleItems: [] as PaletteItem[],
        noteItems: [] as PaletteItem[],
        chatItems: q ? allChatItems.filter(match) : allChatItems,
      };
    }

    return {
      actions: q ? allActions.filter(match) : allActions,
      views: q ? allViews.filter(match) : allViews,
      moduleItems: q ? allModuleItems.filter(match) : allModuleItems,
      noteItems: q ? allNoteItems : [],
      chatItems: q ? allChatItems.filter(match) : allChatItems,
    };
  }, [
    query, noteResults, modules, activeModuleId, conversations, isChatsMode,
    createNote, setActiveNote, setActiveModule, setActiveView,
    toggleSidebar, setShowAgentOverview, setShowSuggestionsView, fetchForModule,
    clearChat, sendChat, loadConversation,
  ]);

  const hasNoResults =
    noteItems.length === 0 && actions.length === 0 && views.length === 0 && moduleItems.length === 0 && chatItems.length === 0;

  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const breakpoint = useUIStore((s) => s.breakpoint);
  const sidebarOffset = breakpoint === "mobile" ? 0 : sidebarCollapsed ? 28 : 110;

  return (
    <CommandDialog
      open
      onOpenChange={(open) => { if (!open) dismiss(); }}
      contentStyle={{ left: `calc(50% + ${sidebarOffset}px)` }}
    >
      <CommandInput
        placeholder={isChatsMode ? "Search recent chats..." : "Search notes, modules, actions..."}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[min(480px,60vh)]">
        <CommandEmpty>
          {searching ? "Searching..." : "No results found"}
        </CommandEmpty>

        {noteItems.length > 0 && (
          <CommandGroup heading="Notes">
            {noteItems.map((item) => (
              <CommandItem
                key={item.id}
                value={item.label}
                onSelect={() => exec(item)}
              >
                <span className="text-muted-foreground">{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.description && (
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                    {item.description}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {actions.length > 0 && (
          <>
            {noteItems.length > 0 && <CommandSeparator />}
            <CommandGroup heading="Actions">
              {actions.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.label}
                  onSelect={() => exec(item)}
                >
                  <span className="text-muted-foreground">{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.description && (
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">
                      {item.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {views.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Views">
              {views.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.label}
                  onSelect={() => exec(item)}
                >
                  <span className="text-muted-foreground">{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {moduleItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Modules">
              {moduleItems.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.label}
                  onSelect={() => exec(item)}
                >
                  <span className="text-muted-foreground">{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.description && (
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">
                      {item.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {chatItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Chats">
              {chatItems.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`chat: ${item.label}`}
                  onSelect={() => exec(item)}
                  className="group/chat"
                >
                  <span className="text-muted-foreground">{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.description && (
                    <span className="ml-auto text-xs text-muted-foreground shrink-0 group-hover/chat:hidden">
                      {item.description}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const convId = item.id.replace("chat-", "");
                      deleteConversation(convId);
                    }}
                    className="hidden group-hover/chat:flex ml-auto p-0.5 rounded text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
