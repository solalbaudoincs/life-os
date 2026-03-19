import { useState, useEffect, useRef, useCallback } from "react";
import {
  CheckCircle2,
  Circle,
  CircleDotDashed,
  CircleX,
  Globe,
  FileText,
  Search,
  Lightbulb,
  Wrench,
  Play,
  RefreshCw,
  Loader,
  AlertTriangle,
  BrainCircuit,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  fetchAgentRuns,
  fetchAgentRunDetail,
  fetchAgentActivity,
  type AgentRunSummary,
  type AgentRunDetail,
  type AgentRun as RealtimeRun,
  type PersistedToolCall,
  type ToolCallEntry,
} from "../../api/activity";
import { apiFetch } from "../../api/client";
import { ResultDetail } from "../common/ToolCallRow";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type TabFilter = "all" | "running" | "completed" | "failed";

/* ---- Constants ---- */

const TOOL_ICON: Record<string, typeof Globe> = {
  web_search: Globe,
  fetch_page: FileText,
  search_notes: Search,
  create_suggestion: Lightbulb,
};

const TOOL_COLOR: Record<string, string> = {
  web_search: "text-blue-500",
  fetch_page: "text-purple-500",
  search_notes: "text-primary",
  create_suggestion: "text-green-600",
};

const TOOL_LABELS: Record<string, string> = {
  web_search: "Web Search",
  fetch_page: "Fetch Page",
  search_notes: "Search Notes",
  create_suggestion: "Create Suggestion",
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

/* ---- Reduced motion ---- */

const prefersReducedMotion =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

/* ---- Animation variants ---- */

const EASE_APPLE: [number, number, number, number] = [0.2, 0.65, 0.3, 0.9];
const EASE_BOUNCE: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

const taskVariants = {
  hidden: { opacity: 0, y: prefersReducedMotion ? 0 : -5 },
  visible: {
    opacity: 1,
    y: 0,
    transition: prefersReducedMotion
      ? { type: "tween" as const, duration: 0.2 }
      : { type: "spring" as const, stiffness: 500, damping: 30 },
  },
};

const subtaskListVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    height: "auto",
    opacity: 1,
    transition: {
      duration: 0.25,
      staggerChildren: prefersReducedMotion ? 0 : 0.04,
      when: "beforeChildren" as const,
      ease: EASE_APPLE,
    },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.2, ease: EASE_APPLE },
  },
};

const subtaskVariants = {
  hidden: { opacity: 0, x: prefersReducedMotion ? 0 : -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: prefersReducedMotion
      ? { type: "tween" as const, duration: 0.2 }
      : { type: "spring" as const, stiffness: 500, damping: 25 },
  },
  exit: {
    opacity: 0,
    x: prefersReducedMotion ? 0 : -10,
    transition: { duration: 0.15 },
  },
};

const detailVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1,
    height: "auto",
    transition: { duration: 0.25, ease: EASE_APPLE },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: { duration: 0.2, ease: EASE_APPLE },
  },
};

const statusBadgeVariants = {
  initial: { scale: 1 },
  animate: {
    scale: prefersReducedMotion ? 1 : [1, 1.08, 1],
    transition: { duration: 0.35, ease: EASE_BOUNCE },
  },
};

/* ---- Merged tool call type ---- */

type DisplayToolCall = PersistedToolCall | ToolCallEntry;

/* ---- Main component ---- */

export function AgentOverviewPage() {
  const [tab, setTab] = useState<TabFilter>("all");
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [realtimeRuns, setRealtimeRuns] = useState<RealtimeRun[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Plan-style expansion state
  const [expandedRuns, setExpandedRuns] = useState<string[]>([]);
  const [expandedToolCalls, setExpandedToolCalls] = useState<
    Record<string, boolean>
  >({});
  const [runDetails, setRunDetails] = useState<
    Record<string, AgentRunDetail>
  >({});
  const [loadingDetails, setLoadingDetails] = useState<
    Record<string, boolean>
  >({});

  /* ---- Data fetching ---- */

  const loadRuns = useCallback(async () => {
    try {
      const statusFilter = tab === "all" ? undefined : tab;
      const resp = await fetchAgentRuns({ status: statusFilter, limit: 50 });
      setRuns(resp.runs);
      setTotal(resp.total);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [tab]);

  const loadRealtime = useCallback(async () => {
    try {
      const resp = await fetchAgentActivity();
      setRealtimeRuns(resp.runs);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadRuns();
    loadRealtime();

    intervalRef.current = setInterval(() => {
      loadRuns();
      loadRealtime();
    }, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadRuns, loadRealtime]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await apiFetch("/proactive/scan?force=true", { method: "POST" });
      setTimeout(() => {
        loadRuns();
        loadRealtime();
      }, 1000);
    } catch {
      /* ignore */
    } finally {
      setScanning(false);
    }
  };

  /* ---- Expansion handlers ---- */

  const toggleRunExpansion = async (runId: string) => {
    const isExpanding = !expandedRuns.includes(runId);
    setExpandedRuns((prev) =>
      prev.includes(runId)
        ? prev.filter((id) => id !== runId)
        : [...prev, runId]
    );

    if (isExpanding && !runDetails[runId] && !loadingDetails[runId]) {
      setLoadingDetails((prev) => ({ ...prev, [runId]: true }));
      try {
        const detail = await fetchAgentRunDetail(runId);
        setRunDetails((prev) => ({ ...prev, [runId]: detail }));
      } catch {
        /* ignore */
      } finally {
        setLoadingDetails((prev) => ({ ...prev, [runId]: false }));
      }
    }
  };

  const toggleToolCallExpansion = (runId: string, tcIndex: number) => {
    const key = `${runId}-${tcIndex}`;
    setExpandedToolCalls((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  /* ---- Merged display data ---- */

  const runningRealtime = realtimeRuns.filter((r) => r.status === "running");
  const runningCount = runningRealtime.length;
  const completedToday = runs.filter((r) => {
    if (r.status !== "completed") return false;
    const d = new Date(r.started_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  const realtimeMap = new Map(realtimeRuns.map((r) => [r.run_id, r]));

  const displayRuns: AgentRunSummary[] =
    tab === "running"
      ? runningRealtime.map(
          (r) =>
            ({
              id: r.run_id,
              module_id: null,
              action_id: r.action_id,
              action_name: r.action_name,
              action_type: r.action_type,
              status: r.status as "running" | "completed" | "failed",
              current_round: r.current_round,
              max_rounds: r.max_rounds,
              suggestions_created: r.suggestions_created,
              error: r.error,
              started_at: r.started_at,
              finished_at: r.finished_at,
              tool_call_count: r.tool_calls.length,
            }) satisfies AgentRunSummary
        )
      : runs;

  const tabs: { id: TabFilter; label: string; count?: number }[] = [
    { id: "all", label: "All", count: total },
    { id: "running", label: "Running", count: runningCount },
    { id: "completed", label: "Completed" },
    { id: "failed", label: "Failed" },
  ];

  /* ---- Render ---- */

  return (
    <div className="py-7 px-9 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-xs text-muted-foreground/60">
            {runningCount > 0 && (
              <span className="text-primary font-mono">
                {runningCount} running
              </span>
            )}
            {runningCount > 0 && completedToday > 0 && " -- "}
            {completedToday > 0 && (
              <span className="font-mono">{completedToday} completed today</span>
            )}
            {runningCount === 0 && completedToday === 0 && "No recent activity"}
          </div>
        </div>
        <Button
          onClick={handleScan}
          disabled={scanning}
          size="sm"
          className="gap-1.5"
        >
          {scanning ? (
            <RefreshCw size={13} className="animate-spin" />
          ) : (
            <Play size={13} />
          )}
          {scanning ? "Scanning..." : "Trigger Scan"}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-muted rounded-md p-0.5 mb-4 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-1.5 text-xs rounded-md transition-all duration-150 flex items-center gap-1.5",
              tab === t.id
                ? "text-foreground bg-secondary font-medium"
                : "text-muted-foreground/60 hover:text-muted-foreground"
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <Badge
                className={cn(
                  "text-[10px] px-1.5 py-0 h-4 font-medium",
                  t.id === "running"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground/60 border-transparent"
                )}
              >
                {t.count}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Loading / empty states */}
      {loading && displayRuns.length === 0 ? (
        <div className="py-16 px-5 text-center text-muted-foreground/60 text-xs">
          <Loader
            size={20}
            className="animate-spin mb-3 opacity-50 mx-auto"
          />
          <div>Loading agent runs...</div>
        </div>
      ) : displayRuns.length === 0 ? (
        <div className="py-16 px-5 text-center text-muted-foreground/60">
          <div className="text-sm font-medium mb-1.5">
            {tab === "all" ? "No agent runs yet" : `No ${tab} runs`}
          </div>
          <div className="text-xs leading-relaxed">
            Trigger a proactive scan to start seeing agent activity here.
          </div>
        </div>
      ) : (
        /* Plan-style run list */
        <motion.div
          className="bg-card border-border rounded-lg border shadow-sm overflow-hidden"
          initial={{ opacity: 0, y: 10 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: { duration: 0.3, ease: [0.2, 0.65, 0.3, 0.9] },
          }}
        >
          <LayoutGroup>
            <div className="p-3 overflow-hidden">
              <ul className="space-y-0.5 overflow-hidden">
                {displayRuns.map((run, index) => {
                  const realtimeRun = realtimeMap.get(run.id);
                  const status = realtimeRun?.status ?? run.status;
                  const isExpanded = expandedRuns.includes(run.id);
                  const currentRound =
                    realtimeRun?.current_round ?? run.current_round;
                  const maxRounds =
                    realtimeRun?.max_rounds ?? run.max_rounds;
                  const suggestionsCreated =
                    realtimeRun?.suggestions_created ?? run.suggestions_created;
                  const error = realtimeRun?.error ?? run.error;
                  const startedAt = realtimeRun?.started_at ?? run.started_at;
                  const finishedAt =
                    realtimeRun?.finished_at ?? run.finished_at;
                  const toolCallCount =
                    realtimeRun?.tool_calls.length ?? run.tool_call_count;

                  // Prefer persisted detail, fall back to realtime for live runs
                  const toolCalls: DisplayToolCall[] =
                    runDetails[run.id]?.tool_calls ??
                    realtimeRun?.tool_calls ??
                    [];
                  const isLoadingDetail = loadingDetails[run.id];

                  return (
                    <motion.li
                      key={run.id}
                      className={index !== 0 ? "mt-0.5 pt-1 border-t border-border/50" : ""}
                      initial="hidden"
                      animate="visible"
                      variants={taskVariants}
                    >
                      {/* Run row */}
                      <motion.div
                        className="group flex items-center px-3 py-2 rounded-md cursor-pointer"
                        onClick={() => toggleRunExpansion(run.id)}
                        whileHover={{
                          backgroundColor: "rgba(0,0,0,0.03)",
                          transition: { duration: 0.2 },
                        }}
                      >
                        {/* Status icon */}
                        <div className="mr-2.5 flex-shrink-0">
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={status}
                              initial={{
                                opacity: 0,
                                scale: 0.8,
                                rotate: -10,
                              }}
                              animate={{ opacity: 1, scale: 1, rotate: 0 }}
                              exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
                              transition={{
                                duration: 0.2,
                                ease: [0.2, 0.65, 0.3, 0.9],
                              }}
                            >
                              {status === "completed" ? (
                                <CheckCircle2
                                  size={18}
                                  className="text-green-500"
                                />
                              ) : status === "running" ? (
                                <CircleDotDashed
                                  size={18}
                                  className="text-blue-500"
                                />
                              ) : status === "failed" ? (
                                <CircleX
                                  size={18}
                                  className="text-red-500"
                                />
                              ) : (
                                <Circle
                                  size={18}
                                  className="text-muted-foreground"
                                />
                              )}
                            </motion.div>
                          </AnimatePresence>
                        </div>

                        {/* Title + metadata */}
                        <div className="flex min-w-0 flex-grow items-center justify-between">
                          <div className="mr-2 flex-1 truncate">
                            <span
                              className={cn(
                                "text-sm",
                                status === "completed" &&
                                  "text-muted-foreground"
                              )}
                            >
                              {run.action_name}
                            </span>
                          </div>

                          <div className="flex flex-shrink-0 items-center gap-2 text-xs">
                            {/* Action type badge */}
                            <motion.span
                              className="bg-secondary/60 text-secondary-foreground rounded px-1.5 py-0.5 text-[10px] font-medium"
                              whileHover={{
                                y: -1,
                                transition: { duration: 0.2 },
                              }}
                            >
                              {run.action_type}
                            </motion.span>

                            {/* Round counter for running */}
                            {status === "running" && (
                              <span className="text-primary font-mono text-[10px]">
                                {currentRound}/{maxRounds}
                              </span>
                            )}

                            {/* Tool count */}
                            {toolCallCount > 0 && (
                              <span className="text-muted-foreground/50 font-mono text-[10px]">
                                {toolCallCount} tool
                                {toolCallCount !== 1 ? "s" : ""}
                              </span>
                            )}

                            {/* Suggestions */}
                            {suggestionsCreated > 0 && (
                              <span className="text-green-600 font-mono text-[10px]">
                                {suggestionsCreated} suggestion
                                {suggestionsCreated !== 1 ? "s" : ""}
                              </span>
                            )}

                            {/* Timing */}
                            <span className="text-muted-foreground/50 font-mono text-[10px]">
                              {finishedAt
                                ? duration(startedAt, finishedAt)
                                : timeAgo(startedAt)}
                            </span>

                            {/* Status badge */}
                            <motion.span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                status === "completed" &&
                                  "bg-green-100 text-green-700",
                                status === "running" &&
                                  "bg-blue-100 text-blue-700",
                                status === "failed" &&
                                  "bg-red-100 text-red-700"
                              )}
                              variants={statusBadgeVariants}
                              initial="initial"
                              animate="animate"
                              key={status}
                            >
                              {status}
                            </motion.span>
                          </div>
                        </div>
                      </motion.div>

                      {/* Error */}
                      {error && (
                        <div className="px-10 py-1 text-xs text-red-500 flex items-start gap-1.5">
                          <AlertTriangle
                            size={12}
                            className="shrink-0 mt-0.5"
                          />
                          <span>{error}</span>
                        </div>
                      )}

                      {/* Tool calls (subtasks) */}
                      <AnimatePresence mode="wait">
                        {isExpanded && (
                          <motion.div
                            className="relative overflow-hidden"
                            variants={subtaskListVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            layout
                          >
                            {/* Vertical connecting line */}
                            <div className="absolute top-0 bottom-0 left-[22px] border-l-2 border-dashed border-muted-foreground/20" />

                            <ul className="mt-1 mr-2 mb-2 ml-4 space-y-0.5">
                              {isLoadingDetail && toolCalls.length === 0 && (
                                <div className="p-3 pl-8 text-muted-foreground/60 text-xs flex items-center gap-2">
                                  <Loader
                                    size={12}
                                    className="animate-spin"
                                  />
                                  Loading tool calls...
                                </div>
                              )}
                              {toolCalls.length === 0 && !isLoadingDetail && (
                                <div className="p-3 pl-8 text-muted-foreground/60 text-xs">
                                  No tool calls recorded
                                </div>
                              )}
                              {toolCalls.map((tc, tcIndex) => {
                                const tcKey = `${run.id}-${tcIndex}`;
                                const isTcExpanded =
                                  expandedToolCalls[tcKey];
                                const ToolIcon =
                                  TOOL_ICON[tc.tool_name] || Wrench;
                                const toolColor =
                                  TOOL_COLOR[tc.tool_name] ||
                                  "text-muted-foreground";
                                const hasDetail =
                                  "result_full" in tc &&
                                  tc.result_full != null;

                                // Think tool calls render as collapsible reasoning blocks
                                if (tc.tool_name === "think") {
                                  const thought =
                                    ("arguments_full" in tc
                                      ? (tc.arguments_full as Record<string, unknown>)?.thought
                                      : null) as string | null;
                                  const text = thought || tc.arguments_summary;
                                  if (!text) return null;
                                  // Build a one-line summary: first sentence or first 120 chars
                                  const firstLine = text.split(/\n/)[0];
                                  const summary =
                                    firstLine.length > 120
                                      ? firstLine.slice(0, 120) + "..."
                                      : firstLine;
                                  const isThinkExpanded =
                                    expandedToolCalls[tcKey];
                                  return (
                                    <motion.li
                                      key={
                                        "id" in tc ? String(tc.id) : tcIndex
                                      }
                                      className="py-0.5 pl-6"
                                      variants={subtaskVariants}
                                      initial="hidden"
                                      animate="visible"
                                      exit="exit"
                                      layout
                                    >
                                      <motion.div
                                        className="rounded-md bg-muted/50 overflow-hidden cursor-pointer"
                                        onClick={() =>
                                          toggleToolCallExpansion(
                                            run.id,
                                            tcIndex
                                          )
                                        }
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ duration: 0.2 }}
                                        layout
                                      >
                                        {/* Summary row */}
                                        <div className="flex items-center gap-2 px-2 py-1.5">
                                          <BrainCircuit
                                            size={14}
                                            className="text-primary/50 shrink-0"
                                          />
                                          <span className="text-xs text-muted-foreground truncate flex-1">
                                            {summary}
                                          </span>
                                          <ChevronDown
                                            size={10}
                                            className={cn(
                                              "text-muted-foreground/40 shrink-0 transition-transform duration-150",
                                              isThinkExpanded && "rotate-180"
                                            )}
                                          />
                                        </div>
                                        {/* Expanded content */}
                                        <AnimatePresence mode="wait">
                                          {isThinkExpanded && (
                                            <motion.div
                                              className="px-2 pb-2 pl-8 overflow-hidden"
                                              variants={detailVariants}
                                              initial="hidden"
                                              animate="visible"
                                              exit="exit"
                                              layout
                                            >
                                              <p className="text-xs text-muted-foreground/70 leading-relaxed whitespace-pre-wrap">
                                                {text}
                                              </p>
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </motion.div>
                                    </motion.li>
                                  );
                                }

                                return (
                                  <motion.li
                                    key={
                                      "id" in tc ? String(tc.id) : tcIndex
                                    }
                                    className="flex flex-col py-0.5 pl-6"
                                    variants={subtaskVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    layout
                                  >
                                    <motion.div
                                      className={cn(
                                        "flex items-center rounded-md px-1.5 py-1",
                                        hasDetail && "cursor-pointer"
                                      )}
                                      onClick={
                                        hasDetail
                                          ? () =>
                                              toggleToolCallExpansion(
                                                run.id,
                                                tcIndex
                                              )
                                          : undefined
                                      }
                                      whileHover={{
                                        backgroundColor: "rgba(0,0,0,0.03)",
                                        transition: { duration: 0.2 },
                                      }}
                                      layout
                                    >
                                      {/* Tool call status icon */}
                                      <div className="mr-2 flex-shrink-0">
                                        <AnimatePresence mode="wait">
                                          <motion.div
                                            key={tc.status}
                                            initial={{
                                              opacity: 0,
                                              scale: 0.8,
                                            }}
                                            animate={{
                                              opacity: 1,
                                              scale: 1,
                                            }}
                                            exit={{
                                              opacity: 0,
                                              scale: 0.8,
                                            }}
                                            transition={{ duration: 0.2 }}
                                          >
                                            {tc.status === "completed" ? (
                                              <CheckCircle2
                                                size={14}
                                                className="text-green-500"
                                              />
                                            ) : tc.status === "running" ? (
                                              <CircleDotDashed
                                                size={14}
                                                className="text-blue-500"
                                              />
                                            ) : tc.status === "failed" ? (
                                              <CircleX
                                                size={14}
                                                className="text-red-500"
                                              />
                                            ) : (
                                              <Circle
                                                size={14}
                                                className="text-muted-foreground"
                                              />
                                            )}
                                          </motion.div>
                                        </AnimatePresence>
                                      </div>

                                      {/* Tool icon */}
                                      <ToolIcon
                                        size={12}
                                        className={cn(
                                          "mr-1.5 shrink-0",
                                          toolColor
                                        )}
                                      />

                                      {/* Tool name + args */}
                                      <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                                        <span
                                          className={cn(
                                            "text-sm font-medium whitespace-nowrap",
                                            tc.status === "completed"
                                              ? "text-muted-foreground"
                                              : ""
                                          )}
                                        >
                                          {TOOL_LABELS[tc.tool_name] ||
                                            tc.tool_name}
                                        </span>
                                        {tc.arguments_summary && (
                                          <span className="text-xs text-muted-foreground/50 truncate">
                                            {tc.arguments_summary}
                                          </span>
                                        )}
                                      </div>

                                      {/* Duration + round badge */}
                                      <div className="flex items-center gap-1.5 text-xs shrink-0 ml-2">
                                        {tc.finished_at && (
                                          <span className="text-muted-foreground/50 font-mono text-[10px]">
                                            {duration(
                                              tc.started_at,
                                              tc.finished_at
                                            )}
                                          </span>
                                        )}
                                        <Badge
                                          variant="secondary"
                                          className="text-[10px] font-normal px-1 py-0 h-4"
                                        >
                                          R{tc.round_number}
                                        </Badge>
                                      </div>
                                    </motion.div>

                                    {/* Result summary (when not expanded) */}
                                    {!isTcExpanded && tc.result_summary && (
                                      <div className="text-xs text-muted-foreground/50 italic pl-8 pb-0.5 truncate">
                                        {tc.result_summary}
                                      </div>
                                    )}

                                    {/* Expanded tool call detail */}
                                    <AnimatePresence mode="wait">
                                      {isTcExpanded &&
                                        hasDetail &&
                                        "result_full" in tc &&
                                        tc.result_full && (
                                          <motion.div
                                            className="mt-1 ml-2 border-l border-dashed border-foreground/15 pl-5 overflow-hidden"
                                            variants={detailVariants}
                                            initial="hidden"
                                            animate="visible"
                                            exit="exit"
                                            layout
                                          >
                                            <div className="pb-2">
                                              <ResultDetail
                                                toolName={tc.tool_name}
                                                resultFull={
                                                  tc.result_full as Record<
                                                    string,
                                                    unknown
                                                  >
                                                }
                                              />
                                            </div>
                                          </motion.div>
                                        )}
                                    </AnimatePresence>
                                  </motion.li>
                                );
                              })}
                            </ul>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.li>
                  );
                })}
              </ul>
            </div>
          </LayoutGroup>
        </motion.div>
      )}
    </div>
  );
}
