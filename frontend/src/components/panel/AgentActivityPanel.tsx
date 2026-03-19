import { useEffect, useState, useRef } from "react";
import {
  X,
  RefreshCw,
  Globe,
  FileText,
  Search,
  Lightbulb,
  Check,
  Loader,
  XCircle,
} from "lucide-react";
import {
  fetchAgentActivity,
  type AgentRun,
  type ToolCallEntry,
} from "../../api/activity";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const TOOL_ICON: Record<string, typeof Globe> = {
  web_search: Globe,
  fetch_page: FileText,
  search_notes: Search,
  create_suggestion: Lightbulb,
};

const TOOL_COLOR_CLASSES: Record<string, string> = {
  web_search: "text-blue-500",
  fetch_page: "text-purple-500",
  search_notes: "text-primary",
  create_suggestion: "text-green-600",
};

const TYPE_LABELS: Record<string, string> = {
  web_search: "Web Search",
  fetch_page: "Fetch Page",
  search_notes: "Search Notes",
  create_suggestion: "Create Suggestion",
};

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "w-1.5 h-1.5 shrink-0",
        status === "running" && "bg-primary animate-gentle-pulse",
        status === "completed" && "bg-green-600",
        status !== "running" && status !== "completed" && "bg-red-500"
      )}
    />
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running")
    return <Loader className="h-2.5 w-2.5 animate-spin text-primary" />;
  if (status === "completed")
    return <Check className="h-2.5 w-2.5 text-green-600" />;
  return <XCircle className="h-2.5 w-2.5 text-red-500" />;
}

function ToolCallRow({ tc }: { tc: ToolCallEntry }) {
  const Icon = TOOL_ICON[tc.tool_name] || Globe;
  const colorClass = TOOL_COLOR_CLASSES[tc.tool_name] || "text-muted-foreground";

  return (
    <div className="flex items-start gap-2 px-2.5 py-1.5 bg-secondary rounded-md mb-0.5 text-xs">
      <Icon className={cn("h-3 w-3 shrink-0 mt-0.5", colorClass)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground font-medium">
            {TYPE_LABELS[tc.tool_name] || tc.tool_name}
          </span>
          <StatusIcon status={tc.status} />
        </div>
        {tc.arguments_summary && (
          <div className="text-muted-foreground text-[10px] overflow-hidden text-ellipsis whitespace-nowrap">
            {tc.arguments_summary}
          </div>
        )}
        {tc.result_summary && (
          <div className="text-muted-foreground text-[10px] italic">
            {tc.result_summary}
          </div>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
        R{tc.round_number}
      </span>
    </div>
  );
}

function RunCard({ run }: { run: AgentRun }) {
  const [expanded, setExpanded] = useState(run.status === "running");
  const elapsed = run.finished_at
    ? `${Math.round(
        (new Date(run.finished_at).getTime() -
          new Date(run.started_at).getTime()) /
          1000
      )}s`
    : null;

  const progress =
    run.max_rounds > 0 ? (run.current_round / run.max_rounds) * 100 : 0;

  return (
    <div className="bg-muted rounded-lg mb-1.5 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2.5 flex items-center gap-2 bg-transparent text-left"
      >
        <StatusDot status={run.status} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
            {run.action_name}
          </div>
          <div className="text-[10px] text-muted-foreground flex gap-2">
            <span>{run.module_display_name}</span>
            <span className="font-mono">
              {run.status === "running"
                ? `Round ${run.current_round}/${run.max_rounds}`
                : run.status === "completed"
                  ? `Done${elapsed ? ` in ${elapsed}` : ""}`
                  : "Failed"}
            </span>
            {run.suggestions_created > 0 && (
              <span className="text-green-600 font-mono">
                {run.suggestions_created} suggestion
                {run.suggestions_created > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <span
          className={cn(
            "text-[10px] text-muted-foreground transition-transform duration-150",
            expanded && "rotate-180"
          )}
        >
          &#9662;
        </span>
      </button>

      {/* Progress bar */}
      {run.status === "running" && (
        <div className="flex gap-[2px] mx-3">
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className={cn(
                "w-1.5 h-1.5",
                i < Math.round((run.current_round / run.max_rounds) * 10)
                  ? "bg-primary"
                  : "bg-[hsl(var(--foreground)/0.05)]"
              )}
            />
          ))}
        </div>
      )}

      {/* Tool calls */}
      {expanded && run.tool_calls.length > 0 && (
        <div className="px-2.5 pt-1.5 pb-2.5">
          {run.tool_calls.map((tc, i) => (
            <ToolCallRow key={i} tc={tc} />
          ))}
        </div>
      )}

      {/* Error */}
      {run.error && (
        <div className="px-3 pt-1.5 pb-2.5 text-xs text-red-500">
          {run.error}
        </div>
      )}
    </div>
  );
}

export function AgentActivityPanel({ onClose }: { onClose: () => void }) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const resp = await fetchAgentActivity();
      setRuns(resp.runs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

    // Poll -- fast while agents are running, slow otherwise
    const poll = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(async () => {
        try {
          const resp = await fetchAgentActivity();
          setRuns(resp.runs);
          const hasRunning = resp.runs.some((r) => r.status === "running");
          // Speed up polling while agents are active
          if (hasRunning && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = setInterval(
              async () => {
                const r2 = await fetchAgentActivity();
                setRuns(r2.runs);
              },
              2000
            );
          }
        } catch {
          /* ignore */
        }
      }, 5000);
    };
    poll();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const hasRunning = runs.some((r) => r.status === "running");

  return (
    <div className="fixed top-12 right-4 w-[400px] max-h-[calc(100vh-100px)] bg-card border border-border rounded-lg z-[200] flex flex-col overflow-hidden animate-scale-in shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            Agent Activity
          </span>
          {hasRunning && <StatusDot status="running" />}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={load}
            disabled={loading}
            title="Refresh"
            className="h-6 w-6"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {loading && runs.length === 0 && (
            <div className="p-5 text-center text-muted-foreground text-xs">
              Loading...
            </div>
          )}

          {!loading && runs.length === 0 && (
            <div className="py-10 px-5 text-center text-muted-foreground">
              <div className="text-sm font-medium">No recent activity</div>
              <div className="text-xs mt-1.5 leading-relaxed">
                Trigger a proactive scan from the Briefing panel to see agents in
                action.
              </div>
            </div>
          )}

          {runs.map((run) => (
            <RunCard key={run.run_id} run={run} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
