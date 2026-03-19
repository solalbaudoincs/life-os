import { useState, useEffect, useRef, useCallback } from "react";
import {
  Globe,
  Search,
  Sparkles,
  Play,
  Settings,
  Loader,
  ChevronDown,
  AlertTriangle,
  Plus,
  Clock,
  Zap,
  FileText,
  Lightbulb,
  Plug,
} from "lucide-react";
import type { Module, ActionConfig } from "../../types/module";
import {
  fetchAgentRuns,
  fetchAgentRunDetail,
  fetchAgentActivity,
  type AgentRunSummary,
  type AgentRunDetail,
  type AgentRun as RealtimeRun,
} from "../../api/activity";
import { apiFetch } from "../../api/client";
import { updateModule } from "../../api/modules";
import { ToolCallRow } from "../common/ToolCallRow";
import { useModuleStore } from "../../stores/moduleStore";
import { ActionConfigReview } from "../modules/ActionConfigReview";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PixelGrid } from "@/components/ui/pixel-grid";

/* ---- Constants ---- */

const TYPE_ICONS: Record<string, typeof Globe> = {
  web_search: Globe,
  internal_scan: Search,
  enrichment: Sparkles,
};

const TYPE_COLOR_CLASSES: Record<string, { text: string; bg: string }> = {
  web_search: { text: "text-blue-500", bg: "bg-blue-500/10" },
  internal_scan: { text: "text-purple-500", bg: "bg-purple-500/10" },
  enrichment: { text: "text-green-600", bg: "bg-green-600/10" },
};

const TYPE_LABELS: Record<string, string> = {
  web_search: "Web Search",
  internal_scan: "Internal Scan",
  enrichment: "Enrichment",
};

const AGENT_TOOLS: Record<string, { name: string; icon: typeof Globe; textClass: string; bgClass: string }[]> = {
  web_search: [
    { name: "Web Search", icon: Globe, textClass: "text-blue-500", bgClass: "bg-blue-500/10" },
    { name: "Fetch Page", icon: FileText, textClass: "text-purple-500", bgClass: "bg-purple-500/10" },
    { name: "Search Notes", icon: Search, textClass: "text-primary", bgClass: "bg-primary/10" },
    { name: "Create Suggestion", icon: Lightbulb, textClass: "text-green-600", bgClass: "bg-green-600/10" },
  ],
  enrichment: [
    { name: "Search Notes", icon: Search, textClass: "text-primary", bgClass: "bg-primary/10" },
    { name: "Web Search", icon: Globe, textClass: "text-blue-500", bgClass: "bg-blue-500/10" },
    { name: "Fetch Page", icon: FileText, textClass: "text-purple-500", bgClass: "bg-purple-500/10" },
    { name: "Create Suggestion", icon: Lightbulb, textClass: "text-green-600", bgClass: "bg-green-600/10" },
  ],
  internal_scan: [
    { name: "Search Notes", icon: Search, textClass: "text-primary", bgClass: "bg-primary/10" },
    { name: "Create Suggestion", icon: Lightbulb, textClass: "text-green-600", bgClass: "bg-green-600/10" },
  ],
};


/* ---- Helpers ---- */

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function duration(start: string, end: string | null): string {
  if (!end) return "...";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/* ---- Small components ---- */

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "w-2 h-2 shrink-0",
        status === "running" && "bg-primary animate-gentle-pulse",
        status === "completed" && "bg-green-600",
        status !== "running" && status !== "completed" && "bg-red-500"
      )}
    />
  );
}

/* ---- Action Card ---- */

function ActionCard({
  action,
  lastRun,
  onTrigger,
  triggering,
}: {
  action: ActionConfig;
  lastRun?: AgentRunSummary;
  onTrigger: () => void;
  triggering: boolean;
}) {
  const Icon = TYPE_ICONS[action.type] || Globe;
  const colorClasses = TYPE_COLOR_CLASSES[action.type] || { text: "text-muted-foreground/60", bg: "bg-muted" };
  const tools = AGENT_TOOLS[action.type] || [];
  const queries = (action.config?.queries as string[] | undefined) || [];

  return (
    <div className="bg-muted rounded-lg p-6 flex gap-4 items-start">
      {/* Icon */}
      <div
        className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
          colorClasses.bg
        )}
      >
        <Icon size={20} className={colorClasses.text} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground mb-1">
          {action.name || action.id}
        </div>
        {action.description && (
          <div className="text-xs text-muted-foreground/60 leading-relaxed mb-2.5">
            {action.description}
          </div>
        )}

        {/* Config details */}
        {action.type === "web_search" && queries.length > 0 && (
          <div className="mb-2.5">
            <div className="text-[10px] text-muted-foreground/60 flex items-center gap-1 mb-1">
              <Search size={10} />
              Search queries
            </div>
            <ul className="m-0 pl-4 text-xs text-muted-foreground leading-relaxed">
              {queries.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}
        {action.type === "enrichment" && (
          <div className="text-xs text-muted-foreground mb-2.5 italic">
            Enriches existing notes with additional web data
          </div>
        )}
        {action.type === "internal_scan" && (
          <div className="text-xs text-muted-foreground mb-2.5 italic">
            Analyzes connections across all modules
          </div>
        )}

        {/* Tools row */}
        {tools.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            {tools.map((tool) => {
              const ToolIcon = tool.icon;
              return (
                <span
                  key={tool.name}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-sm flex items-center gap-1",
                    tool.bgClass,
                    tool.textClass
                  )}
                >
                  <ToolIcon size={9} />
                  {tool.name}
                </span>
              );
            })}
          </div>
        )}

        {/* MCP server badges */}
        {(action.mcp_servers?.length ?? 0) > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            {action.mcp_servers!.map((serverName) => (
              <span
                key={serverName}
                className="text-[10px] px-1.5 py-0.5 rounded-sm flex items-center gap-1 bg-orange-500/10 text-orange-600"
              >
                <Plug size={9} />
                {serverName}
              </span>
            ))}
          </div>
        )}

        {/* Last run stats */}
        {lastRun && (
          <div
            className={cn(
              "text-[10px] mb-1.5 flex items-center gap-1",
              lastRun.status === "failed" ? "text-red-500" : "text-muted-foreground/60"
            )}
          >
            {lastRun.status === "failed" && <AlertTriangle size={10} />}
            <span className="font-mono">
              Last run: {timeAgo(lastRun.started_at)}
              {" -- "}
              {lastRun.status}
              {lastRun.status === "failed" && lastRun.error
                ? ` -- "${lastRun.error}"`
                : <>
                    {lastRun.tool_call_count > 0 && ` -- ${lastRun.tool_call_count} tool call${lastRun.tool_call_count !== 1 ? "s" : ""}`}
                    {lastRun.suggestions_created > 0 && ` -- ${lastRun.suggestions_created} suggestion${lastRun.suggestions_created !== 1 ? "s" : ""}`}
                  </>
              }
            </span>
          </div>
        )}

        {/* Execution info */}
        <div className="text-[10px] text-muted-foreground/60 mb-2.5">
          Runs up to 10 rounds -- Creates suggestions with &gt;70% confidence
        </div>

        {/* Metadata badges */}
        <div className="flex gap-1.5 flex-wrap items-center">
          <Badge
            className={cn(
              "text-[10px] font-medium",
              colorClasses.bg,
              colorClasses.text,
              "border-transparent"
            )}
          >
            {TYPE_LABELS[action.type] || action.type}
          </Badge>
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Zap size={9} />
            {action.trigger}
          </Badge>
          {action.frequency && (
            <Badge variant="secondary" className="text-[10px] gap-1 font-mono">
              <Clock size={9} />
              {action.frequency}
            </Badge>
          )}
        </div>
      </div>

      {/* Run button */}
      <Button
        onClick={onTrigger}
        disabled={triggering}
        variant="ghost"
        size="sm"
        className={cn(
          "shrink-0 gap-1.5 font-medium",
          colorClasses.bg,
          colorClasses.text,
          "hover:opacity-80"
        )}
      >
        {triggering ? (
          <Loader size={13} className="animate-spin" />
        ) : (
          <Play size={13} />
        )}
        {triggering ? "Starting..." : "Run now"}
      </Button>
    </div>
  );
}

/* ---- Run card for history ---- */

function RunCard({ run, realtimeRun }: { run: AgentRunSummary; realtimeRun?: RealtimeRun }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<AgentRunDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const status = realtimeRun?.status ?? run.status;
  const currentRound = realtimeRun?.current_round ?? run.current_round;
  const maxRounds = realtimeRun?.max_rounds ?? run.max_rounds;
  const suggestionsCreated = realtimeRun?.suggestions_created ?? run.suggestions_created;
  const error = realtimeRun?.error ?? run.error;
  const startedAt = realtimeRun?.started_at ?? run.started_at;
  const finishedAt = realtimeRun?.finished_at ?? run.finished_at;
  const progress = maxRounds > 0 ? (currentRound / maxRounds) * 100 : 0;
  const toolCallCount = realtimeRun?.tool_calls.length ?? run.tool_call_count;

  const handleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail && !loadingDetail) {
      setLoadingDetail(true);
      try {
        const d = await fetchAgentRunDetail(run.id);
        setDetail(d);
      } catch { /* ignore */ }
      finally { setLoadingDetail(false); }
    }
  };

  // Prefer persisted detail (has result_full), fall back to realtime for running agents
  const toolCalls = detail?.tool_calls ?? realtimeRun?.tool_calls ?? [];

  return (
    <div
      className={cn(
        "rounded-lg mb-2 overflow-hidden border relative",
        status === "running" ? "border-primary bg-transparent" : "bg-muted border-border"
      )}
    >
      {/* Pixel grid background for running agents */}
      {status === "running" && (
        <PixelGrid
          contained
          pixelColor="#ff8c42"
          pixelSize={2}
          pixelSpacing={5}
          noiseScale={0.12}
          speed={0.6}
          cutoff={0.25}
          maxAlpha={0.7}
          className="pointer-events-none opacity-40"
        />
      )}
      <button
        onClick={handleExpand}
        className="w-full px-4 py-3 flex items-center gap-2.5 bg-transparent text-left cursor-pointer relative z-[1]"
      >
        <StatusDot status={status} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
            {run.action_name}
          </div>
          <div className="text-xs text-muted-foreground/60 flex gap-2.5 mt-0.5">
            <span className="font-mono">{timeAgo(startedAt)}</span>
            {finishedAt && <span className="font-mono">{duration(startedAt, finishedAt)}</span>}
            {toolCallCount > 0 && <span className="font-mono">{toolCallCount} tool call{toolCallCount !== 1 ? "s" : ""}</span>}
            {suggestionsCreated > 0 && (
              <span className="text-green-600 font-mono">
                {suggestionsCreated} suggestion{suggestionsCreated !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        {status === "running" && (
          <span className="text-xs text-primary whitespace-nowrap font-mono">
            Round {currentRound}/{maxRounds}
          </span>
        )}
        <ChevronDown
          size={14}
          className={cn(
            "text-muted-foreground/60 shrink-0 transition-transform duration-150",
            expanded && "rotate-180"
          )}
        />
      </button>

      {status === "running" && (
        <div className="flex gap-[2px] mx-4 relative z-[1]">
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className={cn(
                "w-1.5 h-1.5",
                i < Math.round((currentRound / maxRounds) * 10)
                  ? "bg-primary"
                  : "bg-[hsl(var(--foreground)/0.05)]"
              )}
            />
          ))}
        </div>
      )}

      {expanded && (
        <div className="px-3.5 pb-3.5 pt-2 relative z-[1]">
          {loadingDetail && toolCalls.length === 0 && (
            <div className="p-3 text-center text-muted-foreground/60 text-xs">
              Loading tool calls...
            </div>
          )}
          {toolCalls.length === 0 && !loadingDetail && (
            <div className="p-3 text-center text-muted-foreground/60 text-xs">
              No tool calls recorded
            </div>
          )}
          {toolCalls.map((tc, i) => (
            <ToolCallRow key={"id" in tc ? String(tc.id) : i} tc={tc} />
          ))}
        </div>
      )}

      {error && (
        <div className="px-4 pt-2 pb-3 text-xs text-red-500 flex items-start gap-1.5 relative z-[1]">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/* ---- Main view ---- */

export function ModuleAgentsView({ module }: { module: Module }) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [triggeringAction, setTriggeringAction] = useState<string | null>(null);
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [realtimeRuns, setRealtimeRuns] = useState<RealtimeRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { fetch: refreshModules } = useModuleStore();

  const actions = module.actions_config || [];

  const loadRuns = useCallback(async () => {
    try {
      const resp = await fetchAgentRuns({ module_id: module.id, limit: 20 });
      setRuns(resp.runs);
    } catch { /* ignore */ }
    finally { setLoadingRuns(false); }
  }, [module.id]);

  const loadRealtime = useCallback(async () => {
    try {
      const resp = await fetchAgentActivity();
      // Filter to this module's runs
      setRealtimeRuns(resp.runs.filter((r) => r.module_name === module.name));
    } catch { /* ignore */ }
  }, [module.name]);

  useEffect(() => {
    setLoadingRuns(true);
    loadRuns();
    loadRealtime();
    intervalRef.current = setInterval(() => { loadRuns(); loadRealtime(); }, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadRuns, loadRealtime]);

  const handleTrigger = async (actionId: string) => {
    setTriggeringAction(actionId);
    try {
      await apiFetch(`/proactive/action/${module.id}/${actionId}`, { method: "POST" });
      setTimeout(() => { loadRuns(); loadRealtime(); }, 1000);
    } catch { /* ignore */ }
    finally { setTriggeringAction(null); }
  };

  const handleSaveActions = async (newActions: ActionConfig[]) => {
    try {
      await updateModule(module.id, { actions_config: newActions } as Partial<Module>);
      await refreshModules();
    } catch { /* ignore */ }
    setShowEditModal(false);
  };

  const realtimeMap = new Map(realtimeRuns.map((r) => [r.run_id, r]));

  return (
    <div className="py-7 px-9 max-w-[900px] mx-auto">
      {/* Section: Configured Actions */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground">
            Configured Agents
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEditModal(true)}
            className="gap-1.5 text-xs"
          >
            <Settings size={12} />
            Edit actions
          </Button>
        </div>

        {actions.length === 0 ? (
          <div className="py-12 px-5 text-center bg-muted rounded-lg border border-dashed border-border">
            <div className="text-sm text-muted-foreground/60 mb-2">
              No agents configured for this module
            </div>
            <Button onClick={() => setShowEditModal(true)} size="sm" className="gap-1.5">
              <Plus size={13} />
              Add Agent
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {actions.map((action) => {
              const lastRun = runs.find((r) => r.action_id === action.id);
              return (
                <ActionCard
                  key={action.id}
                  action={action}
                  lastRun={lastRun}
                  onTrigger={() => handleTrigger(action.id)}
                  triggering={triggeringAction === action.id}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Section: Recent Runs */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">
          Recent Runs
        </h3>

        {loadingRuns && runs.length === 0 ? (
          <div className="py-10 px-5 text-center text-muted-foreground/60 text-xs">
            <Loader size={18} className="animate-spin mb-2 opacity-50 mx-auto" />
            <div>Loading runs...</div>
          </div>
        ) : runs.length === 0 && realtimeRuns.length === 0 ? (
          <div className="py-10 px-5 text-center text-muted-foreground/60 bg-muted rounded-lg">
            <div className="text-sm font-medium mb-1">
              No runs yet
            </div>
            <div className="text-xs">
              Trigger an action above to see results here.
            </div>
          </div>
        ) : (
          runs.map((run) => (
            <RunCard key={run.id} run={run} realtimeRun={realtimeMap.get(run.id)} />
          ))
        )}
      </div>

      {/* Edit modal */}
      {showEditModal && (
        <ActionConfigReview
          actions={actions}
          onSave={handleSaveActions}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
}
