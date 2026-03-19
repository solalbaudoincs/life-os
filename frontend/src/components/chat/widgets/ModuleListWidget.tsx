import { useModuleStore } from "../../../stores/moduleStore";
import { useUIStore } from "../../../stores/uiStore";
import type { WidgetProps } from "./types";

interface ModuleInfo {
  module_id: string;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  fields: string[];
  status_lifecycle: string[];
  note_count: number;
}

export function ModuleListWidget({ data }: WidgetProps) {
  const modules = (data.modules || []) as ModuleInfo[];
  const setActiveModule = useModuleStore((s) => s.setActiveModule);
  const setActiveView = useUIStore((s) => s.setActiveView);

  if (modules.length === 0) {
    return (
      <div className="my-1.5 text-[12px] text-muted-foreground/50 italic">
        No modules yet
      </div>
    );
  }

  return (
    <div className="my-2 grid gap-1.5 w-full max-w-md">
      {modules.map((mod) => (
        <button
          key={mod.module_id}
          onClick={() => {
            setActiveModule(mod.module_id);
            setActiveView("dashboard");
          }}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors cursor-pointer text-left w-full"
        >
          <span className="text-base shrink-0">{mod.icon || "📁"}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-foreground">{mod.display_name}</div>
            <div className="text-[11px] text-muted-foreground/50 flex items-center gap-2">
              <span>{mod.note_count} {mod.note_count === 1 ? "note" : "notes"}</span>
              {mod.fields.length > 0 && (
                <>
                  <span className="text-muted-foreground/20">·</span>
                  <span className="truncate">{mod.fields.join(", ")}</span>
                </>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
