import { Boxes, ArrowRight, Bell, Zap, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WidgetProps } from "./types";

interface FieldDef {
  name: string;
  type: string;
  required?: boolean;
  values?: string[];
  description?: string;
}

interface AlertDef {
  type: string;
  field?: string;
  days_before?: number;
  days_inactive?: number;
}

interface ActionDef {
  id: string;
  type: string;
  name: string;
  description?: string;
  trigger: string;
  frequency?: string;
  config?: Record<string, unknown>;
}

const FIELD_TYPE_COLORS: Record<string, string> = {
  string: "text-blue-500",
  text: "text-blue-500",
  integer: "text-purple-500",
  float: "text-purple-500",
  boolean: "text-amber-600",
  date: "text-green-600",
  datetime: "text-green-600",
  url: "text-cyan-600",
  email: "text-cyan-600",
  enum: "text-orange-500",
  tags: "text-pink-500",
};

export function ModuleCardWidget({ data }: WidgetProps) {
  const icon = data.icon as string;
  const displayName = data.display_name as string;
  const name = data.name as string;
  const description = data.description as string;
  const fields = (data.fields || []) as FieldDef[];
  const lifecycle = (data.status_lifecycle || []) as string[];
  const alerts = (data.alerts || []) as AlertDef[];
  const actions = (data.actions || []) as ActionDef[];
  const updatedFields = data.updated_fields as string[] | undefined;
  const isPreview = data.preview as boolean | undefined;

  return (
    <div className={cn(
      "my-2 rounded-xl border bg-card overflow-hidden w-full max-w-md",
      isPreview ? "border-primary/30 border-dashed" : "border-border"
    )}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/30">
        <span className="text-lg">{icon || "📁"}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">{displayName}</div>
          <div className="text-[11px] font-mono text-muted-foreground/50">{name}</div>
        </div>
        {isPreview && (
          <span className="text-[10px] font-mono text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
            preview
          </span>
        )}
        {updatedFields && (
          <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            updated
          </span>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Description */}
        {description && (
          <p className="text-[12px] text-muted-foreground leading-relaxed">{description}</p>
        )}

        {/* Fields */}
        {fields.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Tag size={11} className="text-muted-foreground/50" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50">
                Fields
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {fields.map((f) => (
                <span
                  key={f.name}
                  className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-muted"
                >
                  <span className="text-foreground">{f.name}</span>
                  <span className={cn("font-mono text-[10px]", FIELD_TYPE_COLORS[f.type] || "text-muted-foreground")}>
                    {f.type}
                  </span>
                  {f.required && <span className="text-red-400 text-[9px]">*</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Lifecycle */}
        {lifecycle.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Boxes size={11} className="text-muted-foreground/50" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50">
                Lifecycle
              </span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {lifecycle.map((stage, i) => (
                <span key={stage} className="inline-flex items-center gap-1">
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-foreground">
                    {stage}
                  </span>
                  {i < lifecycle.length - 1 && (
                    <ArrowRight size={10} className="text-muted-foreground/30" />
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Alerts */}
        {alerts.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Bell size={11} className="text-muted-foreground/50" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50">
                Alerts ({alerts.length})
              </span>
            </div>
            <div className="space-y-1">
              {alerts.map((a, i) => (
                <div key={i} className="text-[11px] text-muted-foreground bg-muted rounded px-2 py-1">
                  <span className="text-foreground font-medium">{a.type}</span>
                  {a.field && <span className="ml-1">on {a.field}</span>}
                  {a.days_before != null && <span className="ml-1">({a.days_before}d before)</span>}
                  {a.days_inactive != null && <span className="ml-1">({a.days_inactive}d inactive)</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {actions.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Zap size={11} className="text-muted-foreground/50" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50">
                Proactive Actions ({actions.length})
              </span>
            </div>
            <div className="space-y-1">
              {actions.map((a) => (
                <div key={a.id} className="text-[11px] bg-muted rounded px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-foreground font-medium">{a.name}</span>
                    <span className="text-[10px] font-mono text-primary/60 bg-primary/10 px-1 rounded">
                      {a.type}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground/50">
                      {a.trigger}{a.frequency ? ` · ${a.frequency}` : ""}
                    </span>
                  </div>
                  {a.description && (
                    <div className="text-muted-foreground mt-0.5 leading-snug">{a.description}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
