import { useState } from "react";
import {
  Globe,
  FileText,
  Search,
  Lightbulb,
  Check,
  Loader,
  XCircle,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { PersistedToolCall } from "../../api/activity";

/* ---- Constants ---- */

const TOOL_ICON: Record<string, typeof Globe> = {
  web_search: Globe,
  fetch_page: FileText,
  search_notes: Search,
  create_suggestion: Lightbulb,
};

const TOOL_COLOR: Record<string, string> = {
  web_search: "rgb(59 130 246)",      // blue-500
  fetch_page: "rgb(168 85 247)",      // purple-500
  search_notes: "hsl(var(--primary))",
  create_suggestion: "rgb(22 163 74)", // green-600
};

const TOOL_TYPE_LABELS: Record<string, string> = {
  web_search: "Web Search",
  fetch_page: "Fetch Page",
  search_notes: "Search Notes",
  create_suggestion: "Create Suggestion",
};

/* ---- Helpers ---- */

function duration(start: string, end: string | null): string {
  if (!end) return "...";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running")
    return (
      <Loader
        size={11}
        className="animate-spin text-primary"
      />
    );
  if (status === "completed") return <Check size={11} className="text-green-600" />;
  return <XCircle size={11} className="text-red-500" />;
}

/* ---- Result detail renderers ---- */

function WebSearchResults({ results }: { results: Array<{ title: string; url: string; snippet: string; published_date?: string }> }) {
  return (
    <div className="flex flex-col gap-1.5">
      {results.map((r, i) => (
        <div key={i} className="p-1.5 px-2 bg-muted rounded">
          <div className="text-sm font-medium text-foreground">{r.title}</div>
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary no-underline break-all"
          >
            {r.url}
          </a>
          {r.snippet && (
            <div className="text-xs text-muted-foreground/70 mt-0.5 leading-snug">{r.snippet}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function FetchPageResult({ url, content }: { url: string; content: string }) {
  const [showFull, setShowFull] = useState(false);
  const preview = content.slice(0, 500);
  const hasMore = content.length > 500;
  return (
    <div className="p-1.5 px-2 bg-muted rounded">
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary no-underline break-all">{url}</a>
      <pre className={cn(
        "text-xs text-muted-foreground/70 mt-1 whitespace-pre-wrap break-words leading-snug",
        !showFull && "max-h-[120px] overflow-hidden"
      )}>
        {showFull ? content : preview}{!showFull && hasMore ? "..." : ""}
      </pre>
      {hasMore && (
        <button onClick={() => setShowFull(!showFull)} className="text-xs text-primary mt-0.5 bg-transparent border-none cursor-pointer p-0">
          {showFull ? "Show less" : `Show full (${content.length} chars)`}
        </button>
      )}
    </div>
  );
}

function SearchNotesResults({ results }: { results: Array<{ title?: string; note_id?: string; similarity?: number; content_preview?: string }> }) {
  return (
    <div className="flex flex-col gap-1">
      {results.map((r, i) => (
        <div key={i} className="p-1.5 px-2 bg-muted rounded">
          <div className="text-sm font-medium text-foreground">
            {r.title || "Untitled"}
            {r.similarity != null && (
              <span className="text-xs text-muted-foreground/70 ml-1.5">
                ({(r.similarity * 100).toFixed(0)}% match)
              </span>
            )}
          </div>
          {r.content_preview && (
            <div className="text-xs text-muted-foreground/70 mt-0.5">{r.content_preview}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function SuggestionResult({ data }: { data: Record<string, unknown> }) {
  const status = data.status as string;
  return (
    <div className="p-1.5 px-2 bg-muted rounded">
      <span className={cn(
        "text-sm font-medium",
        status === "created" && "text-green-600",
        status === "skipped" && "text-muted-foreground/70",
        status !== "created" && status !== "skipped" && "text-red-500"
      )}>
        {status}
      </span>
      {data.title ? <span className="text-sm text-muted-foreground ml-1.5">{String(data.title)}</span> : null}
      {data.reason ? <div className="text-xs text-muted-foreground/70 mt-0.5">{String(data.reason)}</div> : null}
    </div>
  );
}

export function ResultDetail({ toolName, resultFull }: { toolName: string; resultFull: Record<string, unknown> }) {
  if (toolName === "web_search" && Array.isArray(resultFull.results)) {
    return <WebSearchResults results={resultFull.results as Array<{ title: string; url: string; snippet: string; published_date?: string }>} />;
  }
  if (toolName === "fetch_page" && typeof resultFull.content === "string") {
    return <FetchPageResult url={(resultFull.url as string) || ""} content={resultFull.content} />;
  }
  if (toolName === "search_notes" && Array.isArray(resultFull.results)) {
    return <SearchNotesResults results={resultFull.results as Array<{ title?: string; note_id?: string; similarity?: number; content_preview?: string }>} />;
  }
  if (toolName === "create_suggestion" && resultFull.status) {
    return <SuggestionResult data={resultFull} />;
  }
  if (resultFull.error) {
    return <div className="p-1.5 px-2 bg-muted rounded text-xs text-red-500">Error: {resultFull.error as string}</div>;
  }
  return (
    <pre className="p-1.5 px-2 bg-muted rounded text-xs text-muted-foreground/70 whitespace-pre-wrap break-words max-h-[200px] overflow-auto">
      {JSON.stringify(resultFull, null, 2)}
    </pre>
  );
}

/* ---- Main component ---- */

/** Tool call type that works with both persisted and real-time data */
type ToolCallData = PersistedToolCall | {
  tool_name: string;
  arguments_summary: string;
  status: string;
  result_summary: string | null;
  round_number: number;
  started_at: string;
  finished_at: string | null;
};

export function ToolCallRow({ tc }: { tc: ToolCallData }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICON[tc.tool_name] || Globe;
  const color = TOOL_COLOR[tc.tool_name] || "hsl(var(--muted-foreground))";
  const hasDetail = "result_full" in tc && tc.result_full != null;

  return (
    <div className="bg-secondary rounded-md mb-0.5 overflow-hidden">
      <div
        onClick={hasDetail ? () => setExpanded(!expanded) : undefined}
        className={cn(
          "flex items-start gap-2.5 px-2.5 py-1.5 text-sm",
          hasDetail ? "cursor-pointer" : "cursor-default"
        )}
      >
        <Icon size={12} style={{ color }} className="shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground font-medium">
              {TOOL_TYPE_LABELS[tc.tool_name] || tc.tool_name}
            </span>
            <StatusIcon status={tc.status} />
            {tc.finished_at && (
              <span className="text-xs text-muted-foreground/70">
                {duration(tc.started_at, tc.finished_at)}
              </span>
            )}
            {hasDetail && (
              <ChevronDown
                size={10}
                className={cn(
                  "text-muted-foreground/70 transition-transform duration-150",
                  expanded && "rotate-180"
                )}
              />
            )}
          </div>
          {tc.arguments_summary && (
            <div className="text-xs text-muted-foreground/70 overflow-hidden text-ellipsis whitespace-nowrap">
              {tc.arguments_summary}
            </div>
          )}
          {!expanded && tc.result_summary && (
            <div className="text-xs text-muted-foreground/70 italic">
              {tc.result_summary}
            </div>
          )}
        </div>
        <Badge variant="secondary" className="text-xs font-normal shrink-0">
          R{tc.round_number}
        </Badge>
      </div>
      {expanded && hasDetail && "result_full" in tc && tc.result_full && (
        <div className="px-2.5 pb-2 pl-8">
          <ResultDetail toolName={tc.tool_name} resultFull={tc.result_full as Record<string, unknown>} />
        </div>
      )}
    </div>
  );
}
