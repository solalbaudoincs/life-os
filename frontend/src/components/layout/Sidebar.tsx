import { useEffect, useState, useCallback } from "react";
import { Activity, Lightbulb, Home, Trash2, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModuleStore } from "../../stores/moduleStore";
import { useNoteStore } from "../../stores/noteStore";
import { useUIStore } from "../../stores/uiStore";
import { useChatStore } from "../../stores/chatStore";
import { ConfirmDialog } from "../common/ConfirmDialog";

const MODULE_COLORS = [
  "30 72% 46%",   // amber
  "14 65% 48%",   // terracotta
  "152 38% 42%",  // sage
  "215 42% 50%",  // slate-blue
  "340 42% 52%",  // dusty rose
  "50 55% 44%",   // olive gold
  "180 32% 42%",  // teal
  "270 32% 50%",  // muted purple
];

export function getModuleColor(index: number): string {
  return MODULE_COLORS[index % MODULE_COLORS.length];
}

export function Sidebar() {
  const { modules, activeModuleId, setActiveModule, fetch: fetchModules, reorder, remove: removeModule } = useModuleStore();
  const { fetchForModule, setActiveNote } = useNoteStore();
  const { showAgentOverview, setShowAgentOverview, showSuggestionsView, setShowSuggestionsView, showMcpSettings, setShowMcpSettings, setActiveView, sidebarCollapsed, breakpoint } = useUIStore();
  const { send, clear } = useChatStore();

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; noteCount: number } | null>(null);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  const handleModuleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  }, []);

  const handleModuleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropIdx(idx);
  }, []);

  const handleModuleDrop = useCallback((e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    const fromIdx = dragIdx;
    setDragIdx(null);
    setDropIdx(null);
    if (fromIdx === null || fromIdx === targetIdx) return;
    const ids = modules.map((m) => m.id);
    const [moved] = ids.splice(fromIdx, 1);
    ids.splice(targetIdx, 0, moved);
    reorder(ids);
  }, [dragIdx, modules, reorder]);

  const handleModuleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDropIdx(null);
  }, []);

  if (breakpoint === "mobile") return null;

  const collapsed = sidebarCollapsed;

  const handleModuleClick = (id: string) => {
    setActiveModule(id);
    setActiveNote(null);
    setShowAgentOverview(false);
    setShowSuggestionsView(false);
    setActiveView("dashboard");
    fetchForModule(id);
  };

  const handleNewModule = () => {
    setActiveModule(null);
    setActiveNote(null);
    setShowAgentOverview(false);
    setShowSuggestionsView(false);
    clear();
    setTimeout(() => {
      send("I want to create a new module. Help me design it.");
    }, 50);
  };

  const handleAgentsClick = () => {
    setActiveModule(null);
    setActiveNote(null);
    setShowAgentOverview(true);
  };

  const handleSuggestionsClick = () => {
    setActiveModule(null);
    setActiveNote(null);
    setShowSuggestionsView(true);
  };

  const handleMcpClick = () => {
    setActiveModule(null);
    setActiveNote(null);
    setShowMcpSettings(true);
  };

  const handleHome = () => {
    setActiveModule(null);
    setActiveNote(null);
    setShowAgentOverview(false);
    setShowSuggestionsView(false);
    setShowMcpSettings(false);
  };

  const totalNotes = modules.reduce((s, m) => s + (m.note_count ?? 0), 0);

  return (
    <aside
      data-tour="sidebar"
      className={cn(
        "flex flex-col h-screen overflow-hidden bg-background transition-all duration-200 z-10",
        "border-r border-dashed border-[hsl(var(--foreground)/0.08)]",
        collapsed ? "w-14 min-w-14" : "w-[220px] min-w-[220px]"
      )}
    >
      {/* Logo — pixel font */}
      <div
        className={cn(
          "flex flex-col shrink-0",
          collapsed ? "py-5 items-center" : "px-4 pt-5 pb-4 items-start"
        )}
      >
        <span className="text-[11px] text-primary font-pixel whitespace-nowrap">
          {collapsed ? "L" : "life os"}
        </span>
        {!collapsed && (
          <span className="text-[11px] font-mono text-muted-foreground/50 mt-1 tabular-nums">
            {totalNotes} note{totalNotes !== 1 ? "s" : ""} · {modules.length} module{modules.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Home button */}
      <div className="px-2 pb-1">
        <button
          onClick={handleHome}
          title={collapsed ? "Home" : undefined}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-md text-[13px] whitespace-nowrap overflow-hidden transition-colors duration-100",
            collapsed ? "py-2 justify-center" : "py-[6px] px-2",
            !activeModuleId && !showAgentOverview && !showSuggestionsView && !showMcpSettings
              ? "bg-[hsl(var(--foreground)/0.04)] text-foreground font-[500]"
              : "text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--foreground)/0.025)]"
          )}
        >
          <Home size={14} className="min-w-5" />
          {!collapsed && <span>Home</span>}
        </button>
      </div>

      {/* Module list */}
      <nav data-tour="modules" className="flex-1 overflow-auto py-0.5 px-2">
        {modules.map((mod, idx) => {
          const isActive = activeModuleId === mod.id;
          const isDragging = dragIdx === idx;
          const isDropTarget = dropIdx === idx;
          const moduleColor = getModuleColor(idx);
          return (
            <div
              key={mod.id}
              className="group/mod relative my-px flex items-center"
              draggable
              onDragStart={(e) => handleModuleDragStart(e, idx)}
              onDragOver={(e) => handleModuleDragOver(e, idx)}
              onDrop={(e) => handleModuleDrop(e, idx)}
              onDragEnd={handleModuleDragEnd}
            >
              <button
                onClick={() => handleModuleClick(mod.id)}
                title={collapsed ? mod.display_name : undefined}
                className={cn(
                  "flex items-center gap-2.5 w-full text-[13px] rounded-md transition-colors duration-100 cursor-grab whitespace-nowrap overflow-hidden",
                  collapsed ? "py-2 justify-center" : "py-[6px] px-2 pr-1",
                  isActive
                    ? "bg-[hsl(var(--foreground)/0.04)] text-foreground font-[500]"
                    : "text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--foreground)/0.025)]",
                  isDragging && "opacity-30",
                  isDropTarget && dragIdx !== null && dragIdx > idx && "border-t-2 border-t-primary/40",
                  isDropTarget && dragIdx !== null && dragIdx < idx && "border-b-2 border-b-primary/40"
                )}
              >
                <span className="w-5 min-w-5 text-center text-[13px]">
                  {mod.icon}
                </span>
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{mod.display_name}</span>
                    <span
                      className="text-[11px] font-mono tabular-nums group-hover/mod:hidden"
                      style={{ color: isActive ? `hsl(${moduleColor})` : undefined, opacity: isActive ? 0.7 : 0.35 }}
                    >
                      {mod.note_count}
                    </span>
                  </>
                )}
              </button>
              {!collapsed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ id: mod.id, name: mod.display_name, noteCount: mod.note_count ?? 0 });
                  }}
                  className="hidden group-hover/mod:flex shrink-0 p-0.5 rounded text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}

        {/* + New module */}
        <button
          data-tour="new-module"
          onClick={handleNewModule}
          title={collapsed ? "New module" : undefined}
          className={cn(
            "flex items-center gap-2.5 w-full text-[13px] mt-1 rounded-md whitespace-nowrap overflow-hidden transition-colors duration-100 text-muted-foreground/40 hover:text-muted-foreground",
            collapsed ? "py-2 justify-center" : "py-[6px] px-2"
          )}
        >
          <span className="w-5 min-w-5 text-center font-mono text-[13px]">+</span>
          {!collapsed && <span>New module</span>}
        </button>
      </nav>

      {/* Agents & Suggestions buttons */}
      <div data-tour="sidebar-actions" className="px-2 pt-1 flex flex-col gap-0.5">
        <button
          onClick={handleAgentsClick}
          title={collapsed ? "Agents" : undefined}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-md text-[13px] whitespace-nowrap overflow-hidden transition-colors duration-100",
            collapsed ? "py-2 justify-center" : "py-[6px] px-2",
            showAgentOverview
              ? "bg-[hsl(var(--foreground)/0.04)] text-foreground font-[500]"
              : "text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--foreground)/0.025)]"
          )}
        >
          <Activity size={14} className="min-w-5" />
          {!collapsed && <span>Agents</span>}
        </button>
        <button
          onClick={handleSuggestionsClick}
          title={collapsed ? "Suggestions" : undefined}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-md text-[13px] whitespace-nowrap overflow-hidden transition-colors duration-100",
            collapsed ? "py-2 justify-center" : "py-[6px] px-2",
            showSuggestionsView
              ? "bg-[hsl(var(--foreground)/0.04)] text-foreground font-[500]"
              : "text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--foreground)/0.025)]"
          )}
        >
          <Lightbulb size={14} className="min-w-5" />
          {!collapsed && <span>Suggestions</span>}
        </button>
        <button
          onClick={handleMcpClick}
          title={collapsed ? "Integrations" : undefined}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-md text-[13px] whitespace-nowrap overflow-hidden transition-colors duration-100",
            collapsed ? "py-2 justify-center" : "py-[6px] px-2",
            showMcpSettings
              ? "bg-[hsl(var(--foreground)/0.04)] text-foreground font-[500]"
              : "text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--foreground)/0.025)]"
          )}
        >
          <Plug size={14} className="min-w-5" />
          {!collapsed && <span>Integrations</span>}
        </button>
      </div>

      {/* Bottom — Mistral-style pixel cat + gradient bands */}
      {!collapsed && (
        <div className="mt-auto shrink-0 relative">
          {/* Pixel cat — positioned to sit on top of the gradient */}
          <div className="relative z-10 flex justify-end px-4" style={{ marginBottom: "-12px" }}>
            <svg width="44" height="30" viewBox="0 0 22 15" style={{ imageRendering: "pixelated", transform: "scaleX(-1)" }}>
              {/* -- head: ears -- */}
              {/* left ear — pointy */}
              <rect x="0" y="0" width="1" height="1" fill="#222" />
              <rect x="1" y="0" width="1" height="1" fill="#222" />
              <rect x="0" y="1" width="1" height="1" fill="#222" />
              <rect x="1" y="1" width="1" height="1" fill="#fff" />
              <rect x="2" y="1" width="1" height="1" fill="#222" />
              {/* right ear — pointy */}
              <rect x="5" y="0" width="1" height="1" fill="#222" />
              <rect x="6" y="0" width="1" height="1" fill="#222" />
              <rect x="4" y="1" width="1" height="1" fill="#222" />
              <rect x="5" y="1" width="1" height="1" fill="#fff" />
              <rect x="6" y="1" width="1" height="1" fill="#222" />
              {/* head top between ears */}
              <rect x="3" y="1" width="1" height="1" fill="#222" />
              {/* head row 2 */}
              <rect x="0" y="2" width="1" height="1" fill="#222" />
              <rect x="1" y="2" width="1" height="1" fill="#fff" />
              <rect x="2" y="2" width="1" height="1" fill="#222" />
              <rect x="3" y="2" width="1" height="1" fill="#fff" />
              <rect x="4" y="2" width="1" height="1" fill="#222" />
              <rect x="5" y="2" width="1" height="1" fill="#fff" />
              <rect x="6" y="2" width="1" height="1" fill="#222" />
              {/* head row 3 — mouth */}
              <rect x="0" y="3" width="1" height="1" fill="#222" />
              <rect x="1" y="3" width="5" height="1" fill="#fff" />
              <rect x="6" y="3" width="1" height="1" fill="#222" />
              {/* head bottom */}
              <rect x="1" y="4" width="1" height="1" fill="#222" />
              <rect x="2" y="4" width="4" height="1" fill="#222" />
              <rect x="5" y="4" width="1" height="1" fill="#222" />
              {/* -- body -- */}
              <rect x="1" y="5" width="1" height="1" fill="#222" />
              <rect x="2" y="5" width="5" height="1" fill="#fff" />
              <rect x="7" y="5" width="1" height="1" fill="#222" />
              <rect x="1" y="6" width="1" height="1" fill="#222" />
              <rect x="2" y="6" width="6" height="1" fill="#fff" />
              <rect x="8" y="6" width="1" height="1" fill="#222" />
              <rect x="1" y="7" width="1" height="1" fill="#222" />
              <rect x="2" y="7" width="7" height="1" fill="#fff" />
              <rect x="9" y="7" width="1" height="1" fill="#222" />
              {/* belly/bottom */}
              <rect x="1" y="8" width="1" height="1" fill="#222" />
              <rect x="2" y="8" width="8" height="1" fill="#fff" />
              <rect x="10" y="8" width="1" height="1" fill="#222" />
              {/* -- tail curving up -- */}
              <rect x="10" y="7" width="1" height="1" fill="#222" />
              <rect x="11" y="6" width="1" height="1" fill="#222" />
              <rect x="12" y="5" width="1" height="1" fill="#222" />
              <rect x="13" y="4" width="1" height="1" fill="#222" />
              <rect x="14" y="3" width="1" height="1" fill="#222" />
              <rect x="14" y="2" width="1" height="1" fill="#222" />
              <rect x="13" y="2" width="1" height="1" fill="#222" />
              {/* -- paws -- */}
              <rect x="2" y="9" width="2" height="1" fill="#222" />
              <rect x="6" y="9" width="2" height="1" fill="#222" />
              {/* whiskers */}
              <rect x="7" y="3" width="1" height="1" fill="#222" opacity="0.4" />
              <rect x="8" y="2" width="1" height="1" fill="#222" opacity="0.4" />
              <rect x="8" y="4" width="1" height="1" fill="#222" opacity="0.4" />
            </svg>
          </div>
          {/* Gradient bands — full width, thick, like Mistral's brand */}
          <div className="flex flex-col">
            <div className="h-[5px]" style={{ background: "#f5c842" }} />
            <div className="h-[5px]" style={{ background: "#f0a830" }} />
            <div className="h-[5px]" style={{ background: "#eb8c28" }} />
            <div className="h-[5px]" style={{ background: "#e57020" }} />
            <div className="h-[5px]" style={{ background: "#d94e1a" }} />
            <div className="h-[5px]" style={{ background: "#c03018" }} />
            <div className="h-[5px]" style={{ background: "#a01a14" }} />
          </div>
        </div>
      )}
      {collapsed && <div className="pb-4" />}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete module"
          description={`This will permanently delete "${deleteTarget.name}" and all its notes. This cannot be undone.`}
          details={{
            Module: deleteTarget.name,
            "Notes that will be deleted": deleteTarget.noteCount,
          }}
          destructive
          onConfirm={async () => {
            await removeModule(deleteTarget.id);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </aside>
  );
}
