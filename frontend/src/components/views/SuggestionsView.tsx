import { useEffect, useState, useRef } from "react";
import { Check, Clock, XCircle, Pencil, X, RefreshCw, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { useSuggestionStore } from "../../stores/suggestionStore";
import { useModuleStore } from "../../stores/moduleStore";
import { useUIStore } from "../../stores/uiStore";
import { triggerProactiveScan } from "../../api/suggestions";
import { ConfirmDialog } from "../common/ConfirmDialog";
import type { Suggestion } from "../../types/suggestion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const TYPE_BADGE_CLASSES: Record<string, string> = {
  alert: "bg-red-50 text-red-500 border-red-200",
  follow_up: "bg-green-50 text-green-600 border-green-200",
  new_opportunity: "bg-blue-50 text-blue-500 border-blue-200",
  connection: "bg-purple-50 text-purple-500 border-purple-200",
  insight: "bg-purple-50 text-purple-500 border-purple-200",
  enrichment: "bg-blue-50 text-blue-500 border-blue-200",
};

const TYPE_LABELS: Record<string, string> = {
  alert: "Alerts",
  follow_up: "Follow-ups",
  new_opportunity: "Opportunities",
  connection: "Connections",
  insight: "Insights",
  enrichment: "Enrichments",
};

export function SuggestionsView() {
  const { suggestions, loading, fetch, accept, reject, snooze, editingId, setEditing, updatePayload } =
    useSuggestionStore();
  const fetchModules = useModuleStore((s) => s.fetch);
  const modules = useModuleStore((s) => s.modules);
  const [confirmSuggestion, setConfirmSuggestion] = useState<Suggestion | null>(null);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const suggestionModuleFilter = useUIStore((s) => s.suggestionModuleFilter);
  const setSuggestionModuleFilter = useUIStore((s) => s.setSuggestionModuleFilter);
  const [moduleFilter, setModuleFilter] = useState<string | null>(suggestionModuleFilter);

  const highlightId = useUIStore((s) => s.highlightSuggestionId);
  const setHighlightId = useUIStore((s) => s.setHighlightSuggestionId);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Clear the store filter on unmount so it doesn't persist for direct navigation
  useEffect(() => {
    return () => setSuggestionModuleFilter(null);
  }, [setSuggestionModuleFilter]);

  // Scroll to highlighted suggestion after render
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      // Clear after animation
      const timer = setTimeout(() => setHighlightId(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [highlightId, suggestions, setHighlightId]);

  const handleAccept = async (s: Suggestion) => {
    if (s.proposed_action === "create_note" || s.proposed_action === "update_note") {
      setConfirmSuggestion(s);
      return;
    }
    await accept(s.id);
    fetchModules();
    toast.success(`Accepted: ${s.title}`);
  };

  const handleConfirmAccept = async () => {
    if (!confirmSuggestion) return;
    await accept(confirmSuggestion.id);
    fetchModules();
    toast.success(`Created: ${confirmSuggestion.proposed_payload.title || confirmSuggestion.title}`);
    setConfirmSuggestion(null);
  };

  const handleReject = async (id: string) => {
    await reject(id);
    toast("Dismissed");
  };

  const handleSnooze = async (id: string) => {
    await snooze(id);
    toast("Snoozed for 24h");
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await triggerProactiveScan();
      await fetch();
      toast.success("Scan complete");
    } catch {
      toast.error("Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const getModuleName = (moduleId: string | null) => {
    if (!moduleId) return "";
    const mod = modules.find((m) => m.id === moduleId);
    return mod?.display_name || "";
  };

  const getConfirmDetails = (s: Suggestion): Record<string, unknown> => {
    const details: Record<string, unknown> = {};
    const payload = s.proposed_payload;
    if (payload.title) details["Title"] = payload.title;
    const moduleName = getModuleName(s.module_id);
    if (moduleName) details["Module"] = moduleName;
    if (payload.metadata && typeof payload.metadata === "object") {
      for (const [k, v] of Object.entries(payload.metadata as Record<string, unknown>)) {
        details[k] = v;
      }
    }
    return details;
  };

  // Module filter
  const moduleIds = Array.from(new Set(suggestions.map((s) => s.module_id).filter((id): id is string => id !== null)));
  const moduleFiltered = moduleFilter ? suggestions.filter((s) => s.module_id === moduleFilter) : suggestions;

  // Type filter on top of module filter
  const types = Array.from(new Set(moduleFiltered.map((s) => s.type)));
  const filtered = filter ? moduleFiltered.filter((s) => s.type === filter) : moduleFiltered;

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-[960px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-foreground tracking-tight">Suggestions</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {filtered.length} pending {filtered.length === 1 ? "suggestion" : "suggestions"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleScan}
            disabled={scanning}
            className="gap-1.5"
          >
            <RefreshCw size={13} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning..." : "Scan now"}
          </Button>
        </div>

        {/* Filters */}
        {(moduleIds.length > 1 || types.length > 1) && (
          <div className="flex items-center gap-1 mb-6 border-b border-border">
            {moduleIds.length > 1 && (
              <>
                <button
                  onClick={() => { setModuleFilter(null); setFilter(null); }}
                  className={cn(
                    "px-3 py-2 text-sm -mb-px border-b-2 transition-colors",
                    moduleFilter === null
                      ? "border-foreground text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  All
                </button>
                {moduleIds.map((mid) => {
                  const mod = modules.find((m) => m.id === mid);
                  return (
                    <button
                      key={mid}
                      onClick={() => { setModuleFilter(mid); setFilter(null); }}
                      className={cn(
                        "px-3 py-2 text-sm -mb-px border-b-2 transition-colors",
                        moduleFilter === mid
                          ? "border-foreground text-foreground font-medium"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {mod?.display_name || mid}
                    </button>
                  );
                })}
                {types.length > 1 && (
                  <div className="w-px h-4 bg-border mx-2" />
                )}
              </>
            )}
            {types.length > 1 && (
              <>
                <button
                  onClick={() => setFilter(null)}
                  className={cn(
                    "px-3 py-2 text-sm -mb-px border-b-2 transition-colors",
                    filter === null
                      ? "border-foreground text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  All types
                </button>
                {types.map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilter(t)}
                    className={cn(
                      "px-3 py-2 text-sm -mb-px border-b-2 transition-colors",
                      filter === t
                        ? "border-foreground text-foreground font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {TYPE_LABELS[t] || t.replace("_", " ")}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* Content */}
        {loading && (
          <div className="py-20 text-center text-muted-foreground text-sm">Loading...</div>
        )}

        {!loading && suggestions.length === 0 && (
          <div className="py-20 text-center">
            <Lightbulb size={32} className="mx-auto mb-3 text-muted-foreground/30" />
            <div className="text-sm font-medium text-muted-foreground">All caught up</div>
            <div className="text-xs text-muted-foreground/60 mt-1">
              No pending suggestions. Run a scan to check for new ones.
            </div>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((s) => (
              <div
                key={s.id}
                ref={s.id === highlightId ? highlightRef : undefined}
                className={cn(
                  "transition-all duration-500",
                  s.id === highlightId && "ring-2 ring-primary/30 rounded-lg"
                )}
              >
                <SuggestionFullCard
                  suggestion={s}
                  moduleName={getModuleName(s.module_id)}
                  isEditing={editingId === s.id}
                  onAccept={() => handleAccept(s)}
                  onReject={() => handleReject(s.id)}
                  onSnooze={() => handleSnooze(s.id)}
                  onEdit={() => setEditing(s.id)}
                  onCancelEdit={() => setEditing(null)}
                  onAcceptEdited={async (payload) => {
                    await updatePayload(s.id, payload);
                    const updated = useSuggestionStore.getState().suggestions.find((x) => x.id === s.id);
                    if (updated) handleAccept(updated);
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmSuggestion && (
        <ConfirmDialog
          title={confirmSuggestion.proposed_action === "create_note" ? "Create note" : "Update note"}
          description={`${confirmSuggestion.proposed_action === "create_note" ? "Create" : "Update"} "${
            confirmSuggestion.proposed_payload.title || confirmSuggestion.title
          }" in ${getModuleName(confirmSuggestion.module_id)}`}
          details={getConfirmDetails(confirmSuggestion)}
          onConfirm={handleConfirmAccept}
          onCancel={() => setConfirmSuggestion(null)}
        />
      )}
    </div>
  );
}

/* --- Full-page Suggestion Card --- */

interface SuggestionFullCardProps {
  suggestion: Suggestion;
  moduleName: string;
  isEditing: boolean;
  onAccept: () => void;
  onReject: () => void;
  onSnooze: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onAcceptEdited: (payload: Record<string, unknown>) => void;
}

function SuggestionFullCard({
  suggestion: s,
  moduleName,
  isEditing,
  onAccept,
  onReject,
  onSnooze,
  onEdit,
  onCancelEdit,
  onAcceptEdited,
}: SuggestionFullCardProps) {
  const badgeClass = TYPE_BADGE_CLASSES[s.type] || "bg-muted text-muted-foreground border-border";
  const [editTitle, setEditTitle] = useState((s.proposed_payload.title as string) || s.title);
  const [editSummary, setEditSummary] = useState(s.summary);
  const [editMeta, setEditMeta] = useState<Record<string, string>>(() => {
    const meta = (s.proposed_payload.metadata || {}) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(meta)) {
      result[k] = String(v ?? "");
    }
    return result;
  });

  const buildPayload = (): Record<string, unknown> => {
    const metadata: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(editMeta)) {
      metadata[k] = v;
    }
    return { ...s.proposed_payload, title: editTitle, metadata };
  };

  const timeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="p-4 bg-muted rounded-lg border border-border flex flex-col">
      {/* Header row */}
      <div className="flex items-center gap-1.5 mb-2">
        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-normal", badgeClass)}>
          {s.type.replace("_", " ")}
        </Badge>
        {moduleName && (
          <span className="text-[10px] text-muted-foreground/60">{moduleName}</span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground/60">{timeAgo(s.created_at)}</span>
        {s.confidence != null && (
          <span className="text-[10px] text-muted-foreground/40">{s.confidence.toFixed(2)}</span>
        )}
      </div>

      {isEditing ? (
        <div className="flex flex-col gap-1.5">
          <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-8 text-sm font-medium" />
          <Textarea value={editSummary} onChange={(e) => setEditSummary(e.target.value)} rows={2} className="min-h-0 text-xs resize-y" />
          {Object.keys(editMeta).length > 0 && (
            <div className="bg-background rounded-md p-1.5">
              {Object.entries(editMeta).map(([key, val]) => (
                <div key={key} className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs text-muted-foreground min-w-[80px]">{key}</span>
                  <Input value={val} onChange={(e) => setEditMeta({ ...editMeta, [key]: e.target.value })} className="h-7 text-xs flex-1" />
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5 mt-1">
            <Button variant="ghost" size="sm" onClick={() => onAcceptEdited(buildPayload())} className="h-7 px-2.5 text-xs bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700">
              <Check className="h-3 w-3" /> Accept edited
            </Button>
            <Button variant="secondary" size="sm" onClick={onCancelEdit} className="h-7 px-2.5 text-xs">Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-sm font-medium text-foreground mb-1">{s.title}</div>
          <div className="text-xs text-muted-foreground leading-relaxed mb-3 flex-1">{s.summary}</div>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={onAccept} className="h-7 px-2.5 text-xs bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700">
              <Check className="h-3 w-3" /> Accept
            </Button>
            <Button variant="secondary" size="sm" onClick={onEdit} className="h-7 px-2.5 text-xs">
              <Pencil className="h-3 w-3" /> Edit
            </Button>
            <Button variant="secondary" size="sm" onClick={onSnooze} className="h-7 px-2.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> Snooze
            </Button>
            <Button variant="ghost" size="sm" onClick={onReject} className="h-7 px-2.5 text-xs bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600">
              <XCircle className="h-3 w-3" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
