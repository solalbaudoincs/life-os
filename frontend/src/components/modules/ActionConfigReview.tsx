import { useState, useEffect } from "react";
import { Plus, Trash2, Pencil, Plug } from "lucide-react";
import type { ActionConfig } from "../../types/module";
import { useMcpStore } from "../../stores/mcpStore";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

const TYPE_BADGE_CLASSES: Record<string, string> = {
  web_search: "bg-blue-50 text-blue-500 border-blue-200",
  internal_scan: "bg-purple-50 text-purple-500 border-purple-200",
  enrichment: "bg-green-50 text-green-600 border-green-200",
};

const FREQUENCY_OPTIONS = ["hourly", "daily", "weekly", "monthly"];
const TRIGGER_OPTIONS = ["scheduled", "on_demand", "on_event"];
const TYPE_OPTIONS = ["web_search", "internal_scan", "enrichment"];

interface ActionConfigReviewProps {
  actions: ActionConfig[];
  onSave: (actions: ActionConfig[]) => void;
  onClose: () => void;
}

export function ActionConfigReview({
  actions: initialActions,
  onSave,
  onClose,
}: ActionConfigReviewProps) {
  const [actions, setActions] = useState<ActionConfig[]>(initialActions);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ActionConfig | null>(null);
  const { servers: mcpServers, fetch: fetchMcp } = useMcpStore();

  useEffect(() => {
    fetchMcp();
  }, [fetchMcp]);

  const handleAdd = () => {
    const newAction: ActionConfig = {
      id: `action_${Date.now()}`,
      type: "web_search",
      name: "",
      description: "",
      trigger: "scheduled",
      frequency: "daily",
      config: {},
      mcp_servers: [],
    };
    setActions([...actions, newAction]);
    setEditingIdx(actions.length);
    setEditDraft(newAction);
  };

  const handleEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditDraft({ ...actions[idx] });
  };

  const handleDelete = (idx: number) => {
    setActions(actions.filter((_, i) => i !== idx));
    if (editingIdx === idx) {
      setEditingIdx(null);
      setEditDraft(null);
    }
  };

  const handleSaveEdit = () => {
    if (editingIdx !== null && editDraft) {
      const updated = [...actions];
      updated[editingIdx] = editDraft;
      setActions(updated);
      setEditingIdx(null);
      setEditDraft(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-base font-medium">Action Configuration</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-5">
          <div className="py-4 space-y-2">
            {/* Actions list */}
            {actions.map((action, idx) => {
              const badgeClass = TYPE_BADGE_CLASSES[action.type] || "bg-muted text-muted-foreground border-border";
              const isEditing = editingIdx === idx;

              return (
                <div
                  key={action.id}
                  className="bg-muted rounded-lg p-3"
                >
                  {isEditing && editDraft ? (
                    /* Edit form */
                    <div className="flex flex-col gap-2">
                      <Input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        placeholder="Action name"
                        className="h-8 text-xs"
                      />
                      <Input
                        value={editDraft.id}
                        onChange={(e) => setEditDraft({ ...editDraft, id: e.target.value })}
                        placeholder="Unique ID (e.g., job_scout)"
                        className="h-8 text-xs"
                      />
                      <Textarea
                        value={editDraft.description}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, description: e.target.value })
                        }
                        placeholder="Description"
                        rows={2}
                        className="min-h-0 text-xs resize-y"
                      />
                      <div className="flex gap-2">
                        <Select
                          value={editDraft.type}
                          onValueChange={(val) =>
                            setEditDraft({
                              ...editDraft,
                              type: val as ActionConfig["type"],
                            })
                          }
                        >
                          <SelectTrigger className="flex-1 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TYPE_OPTIONS.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={editDraft.trigger}
                          onValueChange={(val) =>
                            setEditDraft({
                              ...editDraft,
                              trigger: val as ActionConfig["trigger"],
                            })
                          }
                        >
                          <SelectTrigger className="flex-1 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TRIGGER_OPTIONS.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={editDraft.frequency || "__none__"}
                          onValueChange={(val) =>
                            setEditDraft({
                              ...editDraft,
                              frequency: val === "__none__" ? undefined : val,
                            })
                          }
                        >
                          <SelectTrigger className="flex-1 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No frequency</SelectItem>
                            {FREQUENCY_OPTIONS.map((f) => (
                              <SelectItem key={f} value={f}>
                                {f}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {/* MCP Server Grants */}
                      {mcpServers.filter((s) => s.enabled).length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                            <Plug size={10} />
                            MCP server access
                          </div>
                          <div className="flex gap-1.5 flex-wrap">
                            {mcpServers
                              .filter((s) => s.enabled)
                              .map((server) => {
                                const selected = (editDraft.mcp_servers ?? []).includes(server.name);
                                return (
                                  <button
                                    key={server.name}
                                    type="button"
                                    onClick={() => {
                                      const current = editDraft.mcp_servers ?? [];
                                      setEditDraft({
                                        ...editDraft,
                                        mcp_servers: selected
                                          ? current.filter((n) => n !== server.name)
                                          : [...current, server.name],
                                      });
                                    }}
                                    className={cn(
                                      "text-[10px] px-2 py-1 rounded-md border transition-colors cursor-pointer",
                                      selected
                                        ? "bg-orange-500/10 text-orange-600 border-orange-300"
                                        : "bg-transparent text-muted-foreground/50 border-border hover:text-muted-foreground hover:border-muted-foreground/30"
                                    )}
                                  >
                                    {server.display_name}
                                    <span className="ml-1 opacity-60">
                                      ({server.cached_tools?.length ?? 0})
                                    </span>
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-1.5 justify-end">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditingIdx(null);
                            setEditDraft(null);
                          }}
                          className="h-7 px-3 text-xs"
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleSaveEdit}
                          className="h-7 px-3 text-xs bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700"
                        >
                          Done
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Display card */
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-normal", badgeClass)}>
                          {action.type}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {action.trigger}
                          {action.frequency ? ` / ${action.frequency}` : ""}
                        </span>
                        <div className="ml-auto flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(idx)}
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(idx)}
                            className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="text-sm font-medium text-foreground">
                        {action.name || action.id}
                      </div>
                      {action.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {action.description}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Footer: Add + Save buttons */}
        <DialogFooter className="px-5 pb-5 pt-0 justify-between sm:justify-between">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAdd}
            className="text-xs"
          >
            <Plus className="h-3 w-3" />
            Add action
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => onSave(actions)}
            className="text-xs"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
