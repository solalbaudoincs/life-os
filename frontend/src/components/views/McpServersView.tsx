import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  Plug,
  Radio,
  Terminal,
  ChevronDown,
  Loader,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { ConfirmDialog } from "../common/ConfirmDialog";
import { useMcpStore } from "../../stores/mcpStore";
import type { McpServer } from "../../types/mcp";

interface ServerForm {
  name: string;
  display_name: string;
  description: string;
  transport: "sse" | "stdio";
  config: Record<string, unknown>;
}

const EMPTY_FORM: ServerForm = {
  name: "",
  display_name: "",
  description: "",
  transport: "stdio",
  config: {},
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/* ---- Server Card ---- */

function ServerCard({
  server,
  onEdit,
  onDelete,
  onRefresh,
  onToggle,
}: {
  server: McpServer;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isConnected = !!server.last_connected_at;
  const toolCount = server.cached_tools?.length ?? 0;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      onRefresh();
    } finally {
      setTimeout(() => setRefreshing(false), 1000);
    }
  };

  return (
    <div className="bg-muted rounded-lg overflow-hidden">
      <div className="p-5 flex items-start gap-4">
        {/* Icon */}
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
            server.transport === "sse"
              ? "bg-blue-500/10"
              : "bg-purple-500/10"
          )}
        >
          {server.transport === "sse" ? (
            <Radio size={18} className="text-blue-500" />
          ) : (
            <Terminal size={18} className="text-purple-500" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-foreground">
              {server.display_name}
            </span>
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                server.enabled && isConnected
                  ? "bg-green-500"
                  : server.enabled
                  ? "bg-yellow-500"
                  : "bg-muted-foreground/30"
              )}
              title={
                server.enabled && isConnected
                  ? "Connected"
                  : server.enabled
                  ? "Enabled but not connected"
                  : "Disabled"
              }
            />
          </div>

          {server.description && (
            <div className="text-xs text-muted-foreground/60 mb-2">
              {server.description}
            </div>
          )}

          <div className="flex gap-1.5 flex-wrap items-center">
            <Badge
              variant="secondary"
              className={cn(
                "text-[10px] gap-1",
                server.transport === "sse"
                  ? "bg-blue-500/10 text-blue-500"
                  : "bg-purple-500/10 text-purple-500"
              )}
            >
              {server.transport === "sse" ? (
                <Radio size={9} />
              ) : (
                <Terminal size={9} />
              )}
              {server.transport.toUpperCase()}
            </Badge>
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Plug size={9} />
              {toolCount} tool{toolCount !== 1 ? "s" : ""}
            </Badge>
            <span className="text-[10px] text-muted-foreground/40 font-mono">
              {server.name}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            checked={server.enabled}
            onCheckedChange={onToggle}
            className="scale-75"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Refresh connection"
          >
            <RefreshCw
              size={13}
              className={cn(refreshing && "animate-spin")}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <Pencil size={13} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {/* Expand: tool list */}
      {toolCount > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-5 py-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground border-t border-border/50 bg-transparent cursor-pointer"
          >
            <ChevronDown
              size={11}
              className={cn(
                "transition-transform duration-150",
                expanded && "rotate-180"
              )}
            />
            {expanded ? "Hide" : "Show"} tools
          </button>
          {expanded && (
            <div className="px-5 pb-4 space-y-1">
              {server.cached_tools.map((tool) => (
                <div
                  key={tool.name}
                  className="text-xs text-muted-foreground flex gap-2"
                >
                  <span className="font-mono text-foreground/70 shrink-0">
                    {tool.name}
                  </span>
                  {tool.description && (
                    <span className="text-muted-foreground/50 truncate">
                      {tool.description}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---- Add/Edit Dialog ---- */

function ServerFormDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: ServerForm;
  onSave: (data: ServerForm) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ServerForm>(initial);
  const [sseUrl, setSseUrl] = useState(
    (initial.config?.url as string) ?? ""
  );
  const [sseHeaders, setSseHeaders] = useState(
    JSON.stringify(initial.config?.headers ?? {}, null, 2)
  );
  const initCommand = initial.config?.command as string ?? "";
  const initArgs = (initial.config?.args as string[]) ?? [];
  const [stdioFull, setStdioFull] = useState(
    initCommand ? [initCommand, ...initArgs].join(" ") : ""
  );
  const [stdioEnv, setStdioEnv] = useState(
    JSON.stringify(initial.config?.env ?? {}, null, 2)
  );

  const handleSave = () => {
    let config: Record<string, unknown>;
    if (form.transport === "sse") {
      let headers = {};
      try {
        headers = JSON.parse(sseHeaders);
      } catch {
        /* ignore */
      }
      config = { url: sseUrl, headers };
    } else {
      let env: Record<string, string> | undefined;
      try {
        const parsed = JSON.parse(stdioEnv);
        if (Object.keys(parsed).length > 0) env = parsed;
      } catch {
        /* ignore */
      }
      // Parse "npx -y @foo/bar /path" into command + args
      const parts = stdioFull.trim().split(/\s+/);
      config = {
        command: parts[0] || "",
        args: parts.slice(1),
        ...(env ? { env } : {}),
      };
    }
    onSave({ ...form, config });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">
            {initial.name ? "Edit MCP Server" : "Add MCP Server"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={form.display_name}
            onChange={(e) => {
              const display = e.target.value;
              setForm({
                ...form,
                display_name: display,
                ...(initial.name ? {} : { name: slugify(display) }),
              });
            }}
            placeholder="Display name (e.g., GitHub)"
            className="h-8 text-xs"
          />
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Unique ID (snake_case)"
            className="h-8 text-xs font-mono"
            disabled={!!initial.name}
          />
          <Textarea
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            placeholder="Description (optional)"
            rows={2}
            className="min-h-0 text-xs resize-y"
          />

          <Select
            value={form.transport}
            onValueChange={(v) =>
              setForm({ ...form, transport: v as "sse" | "stdio" })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio">STDIO (local process)</SelectItem>
              <SelectItem value="sse">SSE (remote URL)</SelectItem>
            </SelectContent>
          </Select>

          {/* Transport-specific fields */}
          {form.transport === "sse" ? (
            <>
              <Input
                value={sseUrl}
                onChange={(e) => setSseUrl(e.target.value)}
                placeholder="Server URL (e.g., https://mcp.example.com/sse)"
                className="h-8 text-xs font-mono"
              />
              <Textarea
                value={sseHeaders}
                onChange={(e) => setSseHeaders(e.target.value)}
                placeholder='Headers JSON (e.g., {"Authorization": "Bearer ..."})'
                rows={3}
                className="min-h-0 text-xs font-mono resize-y"
              />
            </>
          ) : (
            <>
              <Input
                value={stdioFull}
                onChange={(e) => setStdioFull(e.target.value)}
                placeholder="npx -y @modelcontextprotocol/server-filesystem /path"
                className="h-8 text-xs font-mono"
              />
              <Textarea
                value={stdioEnv}
                onChange={(e) => setStdioEnv(e.target.value)}
                placeholder='Env JSON (e.g., {"GITHUB_TOKEN": "ghp_..."})'
                rows={3}
                className="min-h-0 text-xs font-mono resize-y"
              />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!form.name || !form.display_name}
            className="text-xs"
          >
            {initial.name ? "Save" : "Add Server"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---- Main View ---- */

export function McpServersView() {
  const { servers, loading, fetch, create, update, remove, refresh } =
    useMcpStore();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<McpServer | null>(null);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const handleCreate = async (form: ServerForm) => {
    await create(form);
    setShowAddDialog(false);
  };

  const handleUpdate = async (form: ServerForm) => {
    if (!editingServer) return;
    await update(editingServer.id, form);
    setEditingServer(null);
  };

  const handleToggle = async (server: McpServer, enabled: boolean) => {
    await update(server.id, { enabled });
  };

  return (
    <div className="py-7 px-9 max-w-[900px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2
            className="text-[14px] font-[550] text-foreground"
            style={{ letterSpacing: "-0.02em" }}
          >
            MCP Integrations
          </h2>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Connect external tools via the Model Context Protocol
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAddDialog(true)}
          className="gap-1.5 text-xs"
        >
          <Plus size={13} />
          Add Server
        </Button>
      </div>

      {loading && servers.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground/60">
          <Loader size={20} className="animate-spin mx-auto mb-2 opacity-50" />
          <div className="text-xs">Loading servers...</div>
        </div>
      ) : servers.length === 0 ? (
        <div className="py-16 px-5 text-center bg-muted rounded-lg border border-dashed border-border">
          <Plug
            size={24}
            className="mx-auto mb-3 text-muted-foreground/30"
          />
          <div className="text-sm text-muted-foreground/60 mb-1">
            No MCP servers configured
          </div>
          <div className="text-xs text-muted-foreground/40 mb-4">
            Add an MCP server to give your agents external tool access
          </div>
          <Button
            size="sm"
            onClick={() => setShowAddDialog(true)}
            className="gap-1.5"
          >
            <Plus size={13} />
            Add Server
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onEdit={() => setEditingServer(server)}
              onDelete={() => setDeleteTarget(server)}
              onRefresh={() => refresh(server.id)}
              onToggle={(enabled) => handleToggle(server, enabled)}
            />
          ))}
        </div>
      )}

      {/* Add dialog */}
      {showAddDialog && (
        <ServerFormDialog
          initial={EMPTY_FORM}
          onSave={handleCreate}
          onClose={() => setShowAddDialog(false)}
        />
      )}

      {/* Edit dialog */}
      {editingServer && (
        <ServerFormDialog
          initial={{
            name: editingServer.name,
            display_name: editingServer.display_name,
            description: editingServer.description,
            transport: editingServer.transport,
            config: editingServer.config,
          }}
          onSave={handleUpdate}
          onClose={() => setEditingServer(null)}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete MCP Server"
          description={`This will disconnect and remove "${deleteTarget.display_name}". Any proactive actions using this server will lose access to its tools.`}
          details={{
            Server: deleteTarget.display_name,
            Transport: deleteTarget.transport.toUpperCase(),
            Tools: deleteTarget.cached_tools?.length ?? 0,
          }}
          destructive
          onConfirm={async () => {
            await remove(deleteTarget.id);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
