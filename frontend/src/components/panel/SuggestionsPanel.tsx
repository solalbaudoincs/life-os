import { useEffect, useState } from "react";
import { X, Check, Clock, XCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useSuggestionStore } from "../../stores/suggestionStore";
import { useModuleStore } from "../../stores/moduleStore";
import { ConfirmDialog } from "../common/ConfirmDialog";
import type { Suggestion } from "../../types/suggestion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

const TYPE_BADGE_CLASSES: Record<string, string> = {
  alert: "bg-red-50 text-red-500 border-red-200",
  follow_up: "bg-green-50 text-green-600 border-green-200",
  new_opportunity: "bg-blue-50 text-blue-500 border-blue-200",
  connection: "bg-purple-50 text-purple-500 border-purple-200",
  insight: "bg-purple-50 text-purple-500 border-purple-200",
  enrichment: "bg-blue-50 text-blue-500 border-blue-200",
};

export function SuggestionsPanel({ onClose }: { onClose: () => void }) {
  const { suggestions, loading, fetch, accept, reject, snooze, editingId, setEditing, updatePayload } =
    useSuggestionStore();
  const fetchModules = useModuleStore((s) => s.fetch);
  const modules = useModuleStore((s) => s.modules);

  const [confirmSuggestion, setConfirmSuggestion] = useState<Suggestion | null>(null);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const handleAccept = async (s: Suggestion) => {
    // For create_note/update_note, show confirmation first
    if (s.proposed_action === "create_note" || s.proposed_action === "update_note") {
      setConfirmSuggestion(s);
      return;
    }
    // notify = immediate
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

  return (
    <>
      <div className="fixed top-12 right-15 w-[400px] max-h-[calc(100vh-100px)] bg-card border border-border rounded-lg z-[200] flex flex-col overflow-hidden animate-scale-in shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-foreground">
            Suggestions
            {suggestions.length > 0 && (
              <span className="text-muted-foreground font-normal">
                {" "}({suggestions.length})
              </span>
            )}
          </span>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-2.5">
            {loading && (
              <div className="p-5 text-center text-muted-foreground text-xs">
                Loading...
              </div>
            )}

            {!loading && suggestions.length === 0 && (
              <div className="py-10 px-5 text-center text-muted-foreground">
                <div className="text-sm font-medium">All caught up</div>
                <div className="text-xs mt-1.5 leading-relaxed">
                  No pending suggestions.
                </div>
              </div>
            )}

            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                isEditing={editingId === s.id}
                onAccept={() => handleAccept(s)}
                onReject={() => handleReject(s.id)}
                onSnooze={() => handleSnooze(s.id)}
                onEdit={() => setEditing(s.id)}
                onCancelEdit={() => setEditing(null)}
                onSaveEdit={(payload) => {
                  updatePayload(s.id, payload);
                  toast.success("Suggestion updated");
                }}
                onAcceptEdited={async (payload) => {
                  await updatePayload(s.id, payload);
                  // After saving edits, trigger accept
                  const updated = useSuggestionStore.getState().suggestions.find((x) => x.id === s.id);
                  if (updated) {
                    handleAccept(updated);
                  }
                }}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Confirmation dialog */}
      {confirmSuggestion && (
        <ConfirmDialog
          title={
            confirmSuggestion.proposed_action === "create_note"
              ? "Create note"
              : "Update note"
          }
          description={`${confirmSuggestion.proposed_action === "create_note" ? "Create" : "Update"} "${
            confirmSuggestion.proposed_payload.title || confirmSuggestion.title
          }" in ${getModuleName(confirmSuggestion.module_id)}`}
          details={getConfirmDetails(confirmSuggestion)}
          onConfirm={handleConfirmAccept}
          onCancel={() => setConfirmSuggestion(null)}
        />
      )}
    </>
  );
}

/* --- Suggestion Card --- */

interface SuggestionCardProps {
  suggestion: Suggestion;
  isEditing: boolean;
  onAccept: () => void;
  onReject: () => void;
  onSnooze: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (payload: Record<string, unknown>) => void;
  onAcceptEdited: (payload: Record<string, unknown>) => void;
}

function SuggestionCard({
  suggestion: s,
  isEditing,
  onAccept,
  onReject,
  onSnooze,
  onEdit,
  onCancelEdit,
  onAcceptEdited,
}: SuggestionCardProps) {
  const badgeClass = TYPE_BADGE_CLASSES[s.type] || "bg-muted text-muted-foreground border-border";
  const [editTitle, setEditTitle] = useState(
    (s.proposed_payload.title as string) || s.title
  );
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
    return {
      ...s.proposed_payload,
      title: editTitle,
      metadata,
    };
  };

  return (
    <div className="p-4 bg-muted rounded-lg mb-2">
      {/* Type badge + confidence */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-normal", badgeClass)}>
          {s.type.replace("_", " ")}
        </Badge>
        {s.confidence != null && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {s.confidence.toFixed(2)}
          </span>
        )}
      </div>

      {isEditing ? (
        /* Edit mode */
        <div className="flex flex-col gap-1.5">
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="h-8 text-sm font-medium"
          />
          <Textarea
            value={editSummary}
            onChange={(e) => setEditSummary(e.target.value)}
            rows={2}
            className="min-h-0 text-xs resize-y"
          />
          {Object.keys(editMeta).length > 0 && (
            <div className="bg-background rounded-md p-1.5">
              {Object.entries(editMeta).map(([key, val]) => (
                <div key={key} className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs text-muted-foreground min-w-[80px]">
                    {key}
                  </span>
                  <Input
                    value={val}
                    onChange={(e) =>
                      setEditMeta({ ...editMeta, [key]: e.target.value })
                    }
                    className="h-7 text-xs flex-1"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAcceptEdited(buildPayload())}
              className="h-7 px-2.5 text-xs bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700"
            >
              <Check className="h-3 w-3" />
              Accept edited
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onCancelEdit}
              className="h-7 px-2.5 text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        /* Display mode */
        <>
          <div className="text-sm font-medium text-foreground mb-1">
            {s.title}
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed mb-2.5">
            {s.summary}
          </div>

          {/* Actions: Accept / Edit / Snooze / Reject */}
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={onAccept}
              className="h-7 px-2.5 text-xs bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700"
            >
              <Check className="h-3 w-3" />
              Accept
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onEdit}
              className="h-7 px-2.5 text-xs"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onSnooze}
              className="h-7 px-2.5 text-xs text-muted-foreground"
            >
              <Clock className="h-3 w-3" />
              Snooze
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onReject}
              className="h-7 px-2.5 text-xs bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600"
            >
              <XCircle className="h-3 w-3" />
              Reject
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
