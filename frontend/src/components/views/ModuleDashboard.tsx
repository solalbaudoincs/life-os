import { useMemo, useEffect } from "react";
import { ChevronRight, Lightbulb, AlertTriangle, Link2, Sparkles, TrendingUp, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Module } from "../../types/module";
import type { Note } from "../../types/note";
import type { Suggestion } from "../../types/suggestion";
import { useNoteStore } from "../../stores/noteStore";
import { useUIStore } from "../../stores/uiStore";
import { useSuggestionStore } from "../../stores/suggestionStore";
import { getModuleColor } from "../layout/Sidebar";
import { useModuleStore } from "../../stores/moduleStore";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  let startDay = first.getDay() - 1;
  if (startDay < 0) startDay = 6;
  const cells: { date: Date; currentMonth: boolean }[] = [];
  for (let i = startDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month, -i), currentMonth: false });
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ date: new Date(year, month, i), currentMonth: true });
  }
  while (cells.length < 42) {
    const d = new Date(year, month + 1, cells.length - startDay - daysInMonth + 1);
    cells.push({ date: d, currentMonth: false });
  }
  return cells;
}

function SectionHeader({ label, onViewAll }: { label: string; onViewAll?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-muted-foreground/50">
        {label}
      </span>
      {onViewAll && (
        <button
          onClick={onViewAll}
          className="text-[11px] font-mono text-muted-foreground/40 hover:text-primary flex items-center gap-0.5 transition-colors"
        >
          View all <ChevronRight size={11} />
        </button>
      )}
    </div>
  );
}

/* ─── Column 1: Pipeline + Recent Notes ─── */

function PipelineSummary({
  module,
  notes,
  moduleColor,
  onViewAll,
}: {
  module: Module;
  notes: Note[];
  moduleColor: string;
  onViewAll: () => void;
}) {
  const stages = module.status_lifecycle;
  const grouped = useMemo(() => {
    const g: Record<string, number> = {};
    for (const s of stages) g[s] = 0;
    for (const note of notes) {
      const status = (note.metadata?.status as string) || stages[0];
      if (g[status] !== undefined) g[status]++;
      else if (stages[0]) g[stages[0]]++;
    }
    return g;
  }, [stages, notes]);

  const total = notes.length || 1;

  return (
    <div>
      <SectionHeader label="Pipeline" onViewAll={onViewAll} />
      <div className="flex gap-1.5">
        {stages.map((stage) => {
          const count = grouped[stage] || 0;
          const pct = Math.max((count / total) * 100, 8);
          return (
            <button
              key={stage}
              onClick={onViewAll}
              className="flex-1 min-w-0 group"
              style={{ flexBasis: `${pct}%` }}
            >
              <div
                className="h-1.5 rounded-sm mb-1.5 transition-opacity group-hover:opacity-80"
                style={{ backgroundColor: `hsl(${moduleColor} / ${count > 0 ? 0.3 : 0.08})` }}
              />
              <div className="text-[10px] font-mono text-muted-foreground/50 truncate">
                {stage}
              </div>
              <div
                className="text-[13px] font-mono font-medium"
                style={{ color: count > 0 ? `hsl(${moduleColor})` : undefined }}
              >
                {count}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RecentNotes({
  notes,
  fields,
  onSelectNote,
  onViewAll,
}: {
  notes: Note[];
  fields: Module["fields_schema"];
  onSelectNote: (id: string) => void;
  onViewAll: () => void;
}) {
  const recent = useMemo(
    () => [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 10),
    [notes]
  );
  const previewField = fields[0];

  return (
    <div>
      <SectionHeader label="Recent notes" onViewAll={onViewAll} />
      {recent.length === 0 ? (
        <div className="text-[12px] text-muted-foreground/40 font-mono py-4">No notes yet</div>
      ) : (
        <div>
          {recent.map((note, i) => (
            <button
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              className={cn(
                "flex items-center gap-2 w-full text-left py-1.5 transition-colors hover:bg-[hsl(var(--foreground)/0.02)] rounded-sm",
                i < recent.length - 1 && "border-b border-dotted border-[hsl(var(--foreground)/0.04)]"
              )}
            >
              <span className="text-[12px] text-foreground flex-1 truncate">
                {note.title}
              </span>
              {previewField && note.metadata?.[previewField.name] != null && (
                <span className="text-[10px] font-mono text-muted-foreground/40 shrink-0">
                  {String(note.metadata[previewField.name])}
                </span>
              )}
              <span className="text-[10px] font-mono text-muted-foreground/25 shrink-0">
                {note.updated_at.slice(5, 10)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Column 2: Suggestions + Agents ─── */

const SUGGESTION_ICONS: Record<string, React.ReactNode> = {
  alert: <AlertTriangle size={12} />,
  follow_up: <TrendingUp size={12} />,
  new_opportunity: <Sparkles size={12} />,
  connection: <Link2 size={12} />,
  insight: <Lightbulb size={12} />,
  enrichment: <Layers size={12} />,
};

function SuggestionsSection({
  suggestions,
  moduleColor,
  onNavigate,
  onClickSuggestion,
}: {
  suggestions: Suggestion[];
  moduleColor: string;
  onNavigate: () => void;
  onClickSuggestion: (id: string) => void;
}) {
  if (suggestions.length === 0) {
    return (
      <div>
        <SectionHeader label="Suggestions" onViewAll={onNavigate} />
        <div className="text-[12px] text-muted-foreground/40 font-mono py-4">No pending suggestions</div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader label={`Suggestions · ${suggestions.length}`} onViewAll={onNavigate} />
      <div className="space-y-1.5">
        {suggestions.slice(0, 8).map((s) => (
          <button
            key={s.id}
            onClick={() => onClickSuggestion(s.id)}
            className="flex items-start gap-2 py-1.5 w-full text-left border-b border-dotted border-[hsl(var(--foreground)/0.04)] last:border-0 hover:bg-[hsl(var(--foreground)/0.02)] rounded-sm transition-colors cursor-pointer"
          >
            <span
              className="mt-0.5 shrink-0"
              style={{ color: `hsl(${moduleColor})` }}
            >
              {SUGGESTION_ICONS[s.type] || <Lightbulb size={12} />}
            </span>
            <div className="min-w-0">
              <div className="text-[12px] text-foreground truncate">{s.title}</div>
              <div className="text-[10px] font-mono text-muted-foreground/40 truncate">{s.summary}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentsSection({ module, onNavigate }: { module: Module; onNavigate: () => void }) {
  const actions = module.actions_config || [];
  if (actions.length === 0) return null;

  return (
    <div>
      <SectionHeader label="Agents" onViewAll={onNavigate} />
      <div className="space-y-1">
        {actions.map((a) => (
          <button
            key={a.id}
            onClick={onNavigate}
            className="flex items-center gap-2 py-1.5 w-full text-left border-b border-dotted border-[hsl(var(--foreground)/0.04)] last:border-0 hover:bg-[hsl(var(--foreground)/0.02)] rounded-sm transition-colors cursor-pointer"
          >
            <span className="w-1.5 h-1.5 bg-muted-foreground/20 shrink-0" />
            <span className="text-[12px] text-foreground truncate flex-1">{a.name}</span>
            <span className="text-[10px] font-mono text-muted-foreground/30 shrink-0">
              {a.frequency || a.trigger}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Column 3: Calendar ─── */

function CalendarPreview({
  notes,
  dateFieldName,
  onViewAll,
}: {
  notes: Note[];
  dateFieldName: string | null;
  onViewAll: () => void;
}) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayKey = toDateKey(now);
  const cells = useMemo(() => getMonthGrid(year, month), [year, month]);

  const datesWithNotes = useMemo(() => {
    const s = new Set<string>();
    for (const note of notes) {
      let dateStr: string | null = null;
      if (dateFieldName && note.metadata?.[dateFieldName]) {
        dateStr = String(note.metadata[dateFieldName]).slice(0, 10);
      } else {
        dateStr = note.created_at.slice(0, 10);
      }
      if (dateStr) s.add(dateStr);
    }
    return s;
  }, [notes, dateFieldName]);

  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div>
      <SectionHeader label={`Calendar · ${monthLabel}`} onViewAll={onViewAll} />
      <div className="grid grid-cols-7 gap-0">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-mono text-muted-foreground/50 pb-1.5">
            {d}
          </div>
        ))}
        {cells.map((cell, i) => {
          const key = toDateKey(cell.date);
          const hasNotes = datesWithNotes.has(key);
          const isToday = key === todayKey;
          return (
            <button
              key={i}
              onClick={onViewAll}
              className={cn(
                "aspect-square flex items-center justify-center text-[11px] font-mono relative",
                !cell.currentMonth && "text-muted-foreground/20",
                cell.currentMonth && !isToday && !hasNotes && "text-foreground/50",
                cell.currentMonth && hasNotes && !isToday && "text-foreground font-medium",
                isToday && "text-primary font-semibold"
              )}
            >
              {cell.date.getDate()}
              {hasNotes && (
                <span className={cn(
                  "absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1",
                  isToday ? "bg-primary" : "bg-foreground/40"
                )} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main Dashboard ─── */

export function ModuleDashboard({ module }: { module: Module }) {
  const { notes: allNotes, setActiveNote } = useNoteStore();
  const notes = useMemo(() => allNotes.filter((n) => n.module_id === module.id), [allNotes, module.id]);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const modules = useModuleStore((s) => s.modules);
  const { suggestions, fetch: fetchSuggestions } = useSuggestionStore();
  const moduleIdx = modules.findIndex((m) => m.id === module.id);
  const moduleColor = getModuleColor(moduleIdx >= 0 ? moduleIdx : 0);

  const hasLifecycle = module.status_lifecycle.length > 0;

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const moduleSuggestions = useMemo(
    () => suggestions.filter((s) => s.module_id === module.id && s.status === "pending"),
    [suggestions, module.id]
  );

  const dateField = useMemo(
    () => module.fields_schema.find((f) => f.type === "date" || f.type === "datetime"),
    [module.fields_schema]
  );

  const setShowSuggestionsView = useUIStore((s) => s.setShowSuggestionsView);
  const setSuggestionModuleFilter = useUIStore((s) => s.setSuggestionModuleFilter);
  const setHighlightSuggestionId = useUIStore((s) => s.setHighlightSuggestionId);

  const todayKey = toDateKey(new Date());
  const todayNotes = useMemo(() => {
    return notes.filter((n) => {
      if (dateField && n.metadata?.[dateField.name]) {
        return String(n.metadata[dateField.name]).slice(0, 10) === todayKey;
      }
      return n.created_at.slice(0, 10) === todayKey;
    });
  }, [notes, dateField, todayKey]);

  return (
    <div className="px-10 py-8 h-full overflow-auto">
      <div className="grid grid-cols-3 gap-10 max-w-[1200px] mx-auto">
        {/* Column 1: Pipeline + Recent Notes */}
        <div className="space-y-8">
          {hasLifecycle && (
            <PipelineSummary
              module={module}
              notes={notes}
              moduleColor={moduleColor}
              onViewAll={() => setActiveView("pipeline")}
            />
          )}
          <RecentNotes
            notes={notes}
            fields={module.fields_schema}
            onSelectNote={(id) => setActiveNote(id)}
            onViewAll={() => setActiveView("table")}
          />
        </div>

        {/* Column 2: Suggestions + Agents */}
        <div className="space-y-8">
          <SuggestionsSection
            suggestions={moduleSuggestions}
            moduleColor={moduleColor}
            onNavigate={() => {
              setSuggestionModuleFilter(module.id);
              setShowSuggestionsView(true);
            }}
            onClickSuggestion={(id) => {
              setSuggestionModuleFilter(module.id);
              setHighlightSuggestionId(id);
              setShowSuggestionsView(true);
            }}
          />
          <AgentsSection module={module} onNavigate={() => setActiveView("agents")} />
        </div>

        {/* Column 3: Calendar + Today's Notes */}
        <div className="space-y-8">
          <CalendarPreview
            notes={notes}
            dateFieldName={dateField?.name ?? null}
            onViewAll={() => setActiveView("calendar")}
          />

          {/* Today's notes */}
          <div>
            <SectionHeader label={`Today · ${todayNotes.length}`} />
            {todayNotes.length === 0 ? (
              <div className="text-[12px] text-muted-foreground/40 font-mono py-2">Nothing for today</div>
            ) : (
              <div>
                {todayNotes.map((note, i) => (
                  <button
                    key={note.id}
                    onClick={() => setActiveNote(note.id)}
                    className={cn(
                      "flex items-center gap-2 w-full text-left py-1.5 hover:bg-[hsl(var(--foreground)/0.02)] rounded-sm transition-colors",
                      i < todayNotes.length - 1 && "border-b border-dotted border-[hsl(var(--foreground)/0.04)]"
                    )}
                  >
                    <span className="text-[12px] text-foreground truncate">{note.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
