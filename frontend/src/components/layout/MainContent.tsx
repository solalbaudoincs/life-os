import { useState, useEffect, useRef } from "react";
import { Plus, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getModuleColor } from "./Sidebar";
import { useModuleStore } from "../../stores/moduleStore";
import { useNoteStore } from "../../stores/noteStore";
import { useUIStore } from "../../stores/uiStore";
import { fetchAgentActivity } from "../../api/activity";
import { TableView } from "../views/TableView";
import { PipelineView } from "../views/PipelineView";
import { CalendarView } from "../views/CalendarView";
import { NoteEditor } from "../editor/NoteEditor";
import { SearchBar } from "../search/SearchBar";
import { SearchResultsView } from "../search/SearchResultsView";
import { AgentActivityPanel } from "../panel/AgentActivityPanel";
import { AgentOverviewPage } from "../views/AgentOverviewPage";
import { ModuleAgentsView } from "../views/ModuleAgentsView";
import { FullScreenChatView } from "../views/FullScreenChatView";
import { SuggestionsView } from "../views/SuggestionsView";
import { ModuleDashboard } from "../views/ModuleDashboard";
import { McpServersView } from "../views/McpServersView";

export function MainContent() {
  const { modules, activeModuleId } = useModuleStore();
  const { activeNoteId, setActiveNote, create: createNote } = useNoteStore();
  const { activeView, setActiveView, searchQuery, showAgentOverview, showSuggestionsView, showMcpSettings } = useUIStore();
  const [showActivity, setShowActivity] = useState(false);
  const [hasRunningAgents, setHasRunningAgents] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeMod = modules.find((m) => m.id === activeModuleId);
  const activeModIdx = modules.findIndex((m) => m.id === activeModuleId);
  const activeColor = activeModIdx >= 0 ? getModuleColor(activeModIdx) : null;
  const hasLifecycle = activeMod && activeMod.status_lifecycle.length > 0;

  useEffect(() => {
    const check = async () => {
      try {
        const resp = await fetchAgentActivity();
        setHasRunningAgents(resp.runs.some((r) => r.status === "running"));
      } catch {
        /* ignore */
      }
    };
    check();
    pollRef.current = setInterval(check, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleNewNote = async () => {
    if (!activeModuleId) return;
    const note = await createNote({
      module_id: activeModuleId,
      title: "Untitled",
      metadata: {},
    });
    setActiveNote(note.id);
  };

  const toggleActivity = () => setShowActivity((v) => !v);

  const views = [
    { id: "dashboard" as const, label: "Overview" },
    ...(hasLifecycle ? [{ id: "pipeline" as const, label: "Pipeline" }] : []),
    { id: "table" as const, label: "Table" },
    { id: "calendar" as const, label: "Calendar" },
    { id: "agents" as const, label: "Agents" },
  ];

  return (
    <main id="main-pane" className="flex-1 flex flex-col h-screen overflow-hidden min-w-0 relative z-[1]">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-5 h-12 shrink-0 border-b border-dashed border-[hsl(var(--foreground)/0.07)]">
        {activeNoteId && activeMod ? (
          <button
            onClick={() => setActiveNote(null)}
            className="text-[13px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <span className="text-muted-foreground/40 mr-0.5 font-mono">←</span>
            {activeMod.display_name}
          </button>
        ) : showAgentOverview ? (
          <h2 className="text-[14px] font-[550] text-foreground" style={{ letterSpacing: "-0.02em" }}>
            Agent Overview
          </h2>
        ) : showMcpSettings ? (
          <h2 className="text-[14px] font-[550] text-foreground" style={{ letterSpacing: "-0.02em" }}>
            Integrations
          </h2>
        ) : showSuggestionsView ? (
          <h2 className="text-[14px] font-[550] text-foreground" style={{ letterSpacing: "-0.02em" }}>
            Suggestions
          </h2>
        ) : (
          <>
            <h2
              className="text-[14px] font-[550]"
              style={{
                letterSpacing: "-0.02em",
                color: activeColor ? `hsl(${activeColor})` : undefined,
              }}
            >
              {activeMod ? activeMod.display_name : ""}
            </h2>

            {/* View switcher — underline tabs in mono */}
            {activeMod && views.length > 1 && (
              <div className="flex gap-0 ml-2">
                {views.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setActiveView(v.id)}
                    className={cn(
                      "px-2.5 py-1 text-[11px] font-mono transition-colors duration-100 relative",
                      activeView === v.id
                        ? "text-foreground"
                        : "text-muted-foreground/50 hover:text-muted-foreground"
                    )}
                  >
                    {v.label}
                    {activeView === v.id && (
                      <span
                        className="absolute bottom-0 left-2.5 right-2.5 h-[1.5px] rounded-full"
                        style={{ backgroundColor: activeColor ? `hsl(${activeColor})` : undefined }}
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex-1" />

        {(activeMod || showAgentOverview || showSuggestionsView || searchQuery) && <SearchBar />}

        {activeMod && !activeNoteId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewNote}
            className="gap-1 h-7 text-[12px] font-mono text-muted-foreground/50 hover:text-muted-foreground"
          >
            <Plus size={13} />
            New
          </Button>
        )}

        {/* Agent Activity — pixel square dot */}
        <button
          onClick={toggleActivity}
          className={cn(
            "relative p-1.5 rounded-md transition-colors",
            showActivity ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"
          )}
          title="Agent Activity"
        >
          <Activity size={15} />
          {hasRunningAgents && (
            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-primary animate-gentle-pulse" />
          )}
        </button>
      </header>

      {/* Overlay panels */}
      {showActivity && (
        <AgentActivityPanel onClose={() => setShowActivity(false)} />
      )}

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {showMcpSettings ? (
          <McpServersView />
        ) : showSuggestionsView ? (
          <SuggestionsView />
        ) : showAgentOverview ? (
          <AgentOverviewPage />
        ) : searchQuery ? (
          <SearchResultsView query={searchQuery} />
        ) : activeNoteId && activeMod ? (
          <NoteEditor noteId={activeNoteId} module={activeMod} />
        ) : activeMod ? (
          activeView === "agents" ? (
            <ModuleAgentsView module={activeMod} />
          ) : activeView === "calendar" ? (
            <CalendarView module={activeMod} />
          ) : activeView === "pipeline" && hasLifecycle ? (
            <PipelineView module={activeMod} />
          ) : activeView === "table" ? (
            <TableView module={activeMod} />
          ) : (
            <ModuleDashboard module={activeMod} />
          )
        ) : (
          <FullScreenChatView />
        )}
      </div>
    </main>
  );
}
