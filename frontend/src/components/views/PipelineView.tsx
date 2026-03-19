import { useMemo } from "react";
import type { Module } from "../../types/module";
import type { Note } from "../../types/note";
import { useNoteStore } from "../../stores/noteStore";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

function PipelineCard({
  note,
  onClick,
}: {
  note: Note;
  onClick: () => void;
}) {
  const meta = note.metadata || {};
  const tags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];

  return (
    <button
      onClick={onClick}
      className="block w-full text-left p-3.5 bg-muted border border-border rounded-lg cursor-pointer transition-all duration-200 shadow-sm hover:border-border hover:shadow-md hover:-translate-y-px"
    >
      <div className="text-sm font-medium text-foreground mb-1.5">
        {note.title}
      </div>
      {meta.company != null && (
        <div className="text-xs text-muted-foreground mb-2">
          {String(meta.company)}
        </div>
      )}
      {tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {tags.map((t) => (
            <Badge key={t} variant="secondary" className="font-medium">
              {t}
            </Badge>
          ))}
        </div>
      )}
    </button>
  );
}

export function PipelineView({ module }: { module: Module }) {
  const { notes: allNotes, loading, setActiveNote, update } = useNoteStore();
  const notes = useMemo(() => allNotes.filter((n) => n.module_id === module.id), [allNotes, module.id]);

  const stages = module.status_lifecycle;

  if (stages.length === 0) {
    return (
      <div className="p-7 text-muted-foreground/60 text-xs">
        This module has no status lifecycle. Switch to table view.
      </div>
    );
  }

  // Group notes by status
  const grouped: Record<string, Note[]> = {};
  for (const s of stages) grouped[s] = [];

  for (const note of notes) {
    const status = (note.metadata?.status as string) || stages[0];
    if (grouped[status]) {
      grouped[status].push(note);
    } else {
      // Unknown status, put in first column
      grouped[stages[0]]?.push(note);
    }
  }

  const handleDrop = async (noteId: string, newStatus: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    await update(noteId, {
      metadata: { ...note.metadata, status: newStatus },
    });
  };

  if (loading) {
    return <div className="p-7 text-muted-foreground/60">Loading...</div>;
  }

  return (
    <div className="flex gap-4 max-w-5xl mx-auto px-10 py-6 h-full overflow-auto">
      {stages.map((stage) => (
        <div
          key={stage}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const noteId = e.dataTransfer.getData("noteId");
            if (noteId) handleDrop(noteId, stage);
          }}
          className="flex-1 min-w-[200px] flex flex-col gap-2"
        >
          {/* Column header */}
          <div className="flex items-center justify-between px-2.5 py-2 mb-1">
            <span className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
              {stage}
            </span>
            <span className="text-xs text-muted-foreground/60 bg-secondary px-2 py-px rounded-full font-mono">
              {grouped[stage].length}
            </span>
          </div>

          {/* Cards */}
          {grouped[stage].map((note) => (
            <div
              key={note.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("noteId", note.id)}
            >
              <PipelineCard
                note={note}
                onClick={() => setActiveNote(note.id)}
              />
            </div>
          ))}

          {grouped[stage].length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground/60 opacity-50 border border-dashed border-border rounded-lg">
              Drop here
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
