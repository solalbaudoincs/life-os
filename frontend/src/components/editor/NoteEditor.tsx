import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Module } from "../../types/module";
import { useNoteStore } from "../../stores/noteStore";
import { cn } from "@/lib/utils";
import { MetadataBar } from "./MetadataBar";
import { LiveEditor } from "./LiveEditor";
import { ConfirmDialog } from "../common/ConfirmDialog";

export function NoteEditor({
  noteId,
  module,
}: {
  noteId: string;
  module: Module;
}) {
  const { notes, update, remove, setActiveNote } = useNoteStore();
  const note = notes.find((n) => n.id === noteId);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [flushing, setFlushing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingFields = useRef<Record<string, unknown> | null>(null);
  const noteIdRef = useRef(noteId);
  noteIdRef.current = noteId;

  // Flush any pending save immediately (no debounce wait)
  const flushSave = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    const fields = pendingFields.current;
    if (!fields) return;
    pendingFields.current = null;
    setFlushing(true);
    try {
      await update(noteIdRef.current, fields);
    } finally {
      setFlushing(false);
    }
  }, [update]);

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content_md);
    }
  }, [noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush pending save on unmount or noteId change
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const fields = pendingFields.current;
      if (fields) {
        // Fire-and-forget: the API call completes even after unmount
        pendingFields.current = null;
        update(noteIdRef.current, fields);
      }
    };
  }, [noteId, update]);

  // Warn on browser close / refresh if there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pendingFields.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const save = (fields: { title?: string; content_md?: string; metadata?: Record<string, unknown> }) => {
    // Merge with any already-pending fields so nothing is lost
    pendingFields.current = { ...(pendingFields.current ?? {}), ...fields };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("Saving...");
    saveTimer.current = setTimeout(async () => {
      const toSave = pendingFields.current;
      pendingFields.current = null;
      if (toSave) await update(noteIdRef.current, toSave);
      setSaveStatus("Saved");
      setTimeout(() => setSaveStatus(""), 2000);
    }, 800);
  };

  const handleTitleChange = (v: string) => {
    setTitle(v);
    save({ title: v });
  };

  const handleContentChange = (v: string) => {
    setContent(v);
    save({ content_md: v });
  };

  const handleMetadataChange = (meta: Record<string, unknown>) => {
    save({ metadata: meta });
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    await remove(noteId);
    setActiveNote(null);
  };

  if (!note) return null;

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {/* Metadata */}
      <MetadataBar
        module={module}
        metadata={note.metadata}
        onChange={handleMetadataChange}
      />

      {/* Title + save status */}
      <div className="flex items-center gap-3 px-7 pt-5">
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Note title..."
          className="flex-1 bg-transparent border-none text-2xl font-semibold text-foreground p-0 tracking-tight outline-none placeholder:text-muted-foreground/50"
        />
        <span className="text-xs text-muted-foreground/70 shrink-0">
          {saveStatus}
        </span>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          title="Delete note"
          className="p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete note"
          description="This note will be archived and hidden from all views."
          details={{ Title: note.title }}
          destructive
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Live editor */}
      <div className="flex-1 overflow-auto px-7 pt-4 pb-20 text-base leading-relaxed text-foreground">
        <LiveEditor content={content} onChange={handleContentChange} />
      </div>

      {/* Saving overlay -- shown when flushing on navigation */}
      {flushing && (
        <div className="absolute inset-0 bg-black/35 flex items-center justify-center z-[100]">
          <div className="bg-card border border-border rounded-lg px-7 py-5 flex items-center gap-2.5 text-base text-foreground">
            <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
            Saving changes...
          </div>
        </div>
      )}
    </div>
  );
}
