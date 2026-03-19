import { useState, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Module } from "../../types/module";
import type { Note } from "../../types/note";
import { useNoteStore } from "../../stores/noteStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  let startDay = first.getDay() - 1;
  if (startDay < 0) startDay = 6;

  const cells: { date: Date; currentMonth: boolean }[] = [];

  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    cells.push({ date: d, currentMonth: false });
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

export function CalendarView({ module }: { module: Module }) {
  const { notes: allNotes, setActiveNote, update } = useNoteStore();
  const notes = useMemo(() => allNotes.filter((n) => n.module_id === module.id), [allNotes, module.id]);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const todayKey = toDateKey(new Date());

  const dateField = useMemo(() => {
    return module.fields_schema.find(
      (f) => f.type === "date" || f.type === "datetime"
    );
  }, [module.fields_schema]);

  const canDrag = !!dateField;

  const notesByDate = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const note of notes) {
      let dateStr: string | null = null;

      if (dateField && note.metadata?.[dateField.name]) {
        const val = String(note.metadata[dateField.name]);
        dateStr = val.slice(0, 10);
      } else {
        dateStr = note.created_at.slice(0, 10);
      }

      if (dateStr) {
        const existing = map.get(dateStr) || [];
        existing.push(note);
        map.set(dateStr, existing);
      }
    }
    return map;
  }, [notes, dateField]);

  const cells = useMemo(() => getMonthGrid(year, month), [year, month]);

  const navigate = (delta: number) => {
    setCurrentDate(new Date(year, month + delta, 1));
    setSelectedDate(null);
  };

  const monthLabel = currentDate.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const selectedNotes = selectedDate ? notesByDate.get(selectedDate) || [] : [];

  // --- Drag handlers ---
  const handleDragStart = useCallback(
    (e: React.DragEvent, noteId: string) => {
      e.stopPropagation();
      setDraggingNoteId(noteId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", noteId);
      if (e.currentTarget instanceof HTMLElement) {
        e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
      }
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, dateKey: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverDate(dateKey);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOverDate(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetDateKey: string) => {
      e.preventDefault();
      setDragOverDate(null);
      setDraggingNoteId(null);

      const noteId = e.dataTransfer.getData("text/plain");
      if (!noteId || !dateField) return;

      const note = notes.find((n) => n.id === noteId);
      if (!note) return;

      const currentVal = note.metadata?.[dateField.name];
      const currentDateKey = currentVal ? String(currentVal).slice(0, 10) : null;

      if (currentDateKey === targetDateKey) return;

      let newDateVal: string = targetDateKey;
      if (dateField.type === "datetime") {
        const oldVal = currentVal ? String(currentVal) : "";
        const timePart = oldVal.includes("T") ? oldVal.slice(10) : "T12:00:00";
        newDateVal = targetDateKey + timePart;
      }

      await update(noteId, {
        metadata: { ...note.metadata, [dateField.name]: newDateVal },
      });
    },
    [dateField, notes, update]
  );

  return (
    <div className="px-10 py-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3.5 mb-5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={18} />
        </Button>
        <span className="text-lg font-semibold text-foreground min-w-[180px] text-center tracking-tight">
          {monthLabel}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(1)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ChevronRight size={18} />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setCurrentDate(new Date());
            setSelectedDate(null);
          }}
        >
          Today
        </Button>
        {dateField && (
          <span className="ml-auto text-xs text-muted-foreground/60">
            by {dateField.name} -- drag to reschedule
          </span>
        )}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-dotted border-[hsl(var(--foreground)/0.05)]">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="p-2 text-xs font-semibold text-muted-foreground/60 text-center uppercase tracking-wider"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="flex-1 grid grid-cols-7 grid-rows-6">
          {cells.map((cell, i) => {
            const key = toDateKey(cell.date);
            const dayNotes = notesByDate.get(key) || [];
            const isToday = key === todayKey;
            const isSelected = key === selectedDate;
            const isDragOver = key === dragOverDate;

            return (
              <div
                key={i}
                onClick={() => setSelectedDate(isSelected ? null : key)}
                onDragOver={canDrag ? (e) => handleDragOver(e, key) : undefined}
                onDragLeave={canDrag ? handleDragLeave : undefined}
                onDrop={canDrag ? (e) => handleDrop(e, key) : undefined}
                className={cn(
                  "border border-dotted border-[hsl(var(--foreground)/0.05)] p-1.5 min-h-0 overflow-hidden transition-colors duration-100",
                  dayNotes.length > 0 ? "cursor-pointer" : "cursor-default",
                  isDragOver && "bg-secondary border-primary",
                  isSelected && !isDragOver && "bg-muted",
                )}
              >
                <div className="text-xs mb-0.5 flex justify-start">
                  {isToday ? (
                    <span className="bg-primary text-primary-foreground w-5.5 h-5.5 rounded-full inline-flex items-center justify-center text-xs font-semibold font-mono">
                      {cell.date.getDate()}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "font-mono",
                        !cell.currentMonth
                          ? "text-muted-foreground/60"
                          : "text-muted-foreground"
                      )}
                    >
                      {cell.date.getDate()}
                    </span>
                  )}
                </div>
                {dayNotes.slice(0, 5).map((n) => (
                  <div
                    key={n.id}
                    draggable={canDrag}
                    onDragStart={canDrag ? (e) => handleDragStart(e, n.id) : undefined}
                    onDragEnd={() => {
                      setDraggingNoteId(null);
                      setDragOverDate(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveNote(n.id);
                    }}
                    className={cn(
                      "block w-full text-left px-1.5 py-0.5 mb-0.5 rounded-sm text-xs overflow-hidden text-ellipsis whitespace-nowrap border-none transition-opacity duration-100",
                      draggingNoteId === n.id
                        ? "bg-primary text-primary-foreground opacity-60"
                        : "bg-secondary text-muted-foreground",
                      canDrag ? "cursor-grab" : "cursor-pointer"
                    )}
                  >
                    {n.title}
                  </div>
                ))}
                {dayNotes.length > 5 && (
                  <div className="text-[10px] text-primary pl-1">
                    +{dayNotes.length - 5} more
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected date panel */}
      {selectedDate && selectedNotes.length > 0 && (
        <div className="shrink-0 border-t border-border py-4 max-h-[200px] overflow-auto">
          <div className="text-sm text-muted-foreground mb-2.5 font-medium">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("default", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            {" "}
            -- {selectedNotes.length} note{selectedNotes.length !== 1 ? "s" : ""}
          </div>
          {selectedNotes.map((n) => (
            <div
              key={n.id}
              draggable={canDrag}
              onDragStart={canDrag ? (e) => handleDragStart(e, n.id) : undefined}
              onDragEnd={() => {
                setDraggingNoteId(null);
                setDragOverDate(null);
              }}
              onClick={() => setActiveNote(n.id)}
              className={cn(
                "flex items-center gap-2.5 w-full text-left py-2 px-2.5 rounded-md text-sm text-foreground border-none bg-transparent transition-colors duration-100 hover:bg-muted",
                canDrag ? "cursor-grab" : "cursor-pointer"
              )}
            >
              <span className="font-medium">{n.title}</span>
              {dateField && n.metadata?.[dateField.name] != null && (
                <span className="text-xs text-muted-foreground/60 ml-auto">
                  {String(n.metadata[dateField.name])}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
