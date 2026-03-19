import { useState, useRef, useEffect, useMemo } from "react";
import { Trash2 } from "lucide-react";
import type { Module, FieldDefinition } from "../../types/module";
import { useNoteStore } from "../../stores/noteStore";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

function InlineEditor({
  field,
  value,
  onCommit,
  onCancel,
}: {
  field: FieldDefinition | "title";
  value: unknown;
  onCommit: (val: unknown) => void;
  onCancel: () => void;
}) {
  const isTitle = field === "title";
  const type = isTitle ? "string" : (field as FieldDefinition).type;
  const [text, setText] = useState(value != null ? String(value) : "");
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (inputRef.current && "select" in inputRef.current) {
      (inputRef.current as HTMLInputElement).select();
    }
  }, []);

  const commit = () => {
    let parsed: unknown = text;
    if (type === "integer") parsed = parseInt(text) || 0;
    else if (type === "float") parsed = parseFloat(text) || 0;
    else if (type === "boolean") parsed = text === "true";
    onCommit(parsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const baseClasses = "w-full px-2 py-1 text-sm text-foreground bg-white border border-primary/40 rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary/20";

  if (type === "enum" && !isTitle) {
    const values = (field as FieldDefinition).values || [];
    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onCommit(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={baseClasses}
      >
        <option value="">--</option>
        {values.map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    );
  }

  if (type === "boolean") {
    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onCommit(e.target.value === "true");
        }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={baseClasses}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  const inputType =
    type === "integer" || type === "float"
      ? "number"
      : type === "date"
        ? "date"
        : type === "datetime"
          ? "datetime-local"
          : "text";

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type={inputType}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      className={baseClasses}
    />
  );
}

export function TableView({ module }: { module: Module }) {
  const { notes: allNotes, loading, setActiveNote, update, remove } = useNoteStore();
  const notes = useMemo(() => allNotes.filter((n) => n.module_id === module.id), [allNotes, module.id]);
  const [editingCell, setEditingCell] = useState<{
    noteId: string;
    fieldName: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fields = module.fields_schema;

  const handleRowClick = (noteId: string) => {
    clickTimer.current = setTimeout(() => {
      setActiveNote(noteId);
    }, 250);
  };

  const handleCellDoubleClick = (
    e: React.MouseEvent,
    noteId: string,
    fieldName: string
  ) => {
    e.stopPropagation();
    clearTimeout(clickTimer.current);
    setEditingCell({ noteId, fieldName });
  };

  const handleCommit = async (
    noteId: string,
    fieldName: string,
    value: unknown
  ) => {
    setEditingCell(null);
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    if (fieldName === "title") {
      if (value !== note.title) {
        await update(noteId, { title: String(value) });
      }
    } else {
      const currentVal = note.metadata?.[fieldName];
      if (value !== currentVal) {
        await update(noteId, {
          metadata: { ...note.metadata, [fieldName]: value },
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="p-7 text-muted-foreground">Loading...</div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center pb-20">
        <div className="text-center">
          <div className="text-4xl mb-4 opacity-15">
            {module.icon}
          </div>
          <div className="text-sm text-muted-foreground">
            No notes in {module.display_name} yet
          </div>
          <div className="text-xs text-muted-foreground/60 mt-1.5">
            Create one with the + button or via the agent.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-10 pt-4">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border/50">
            <TableHead className="sticky top-0 bg-background text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider h-9">
              Title
            </TableHead>
            {fields.map((f) => (
              <TableHead
                key={f.name}
                className="sticky top-0 bg-background text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider whitespace-nowrap h-9"
              >
                {f.name}
              </TableHead>
            ))}
            <TableHead className="sticky top-0 bg-background w-10 h-9" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {notes.map((note) => {
            const isEditing = editingCell?.noteId === note.id;
            return (
              <TableRow
                key={note.id}
                onClick={() => handleRowClick(note.id)}
                className="cursor-pointer group"
              >
                <TableCell
                  onDoubleClick={(e) =>
                    handleCellDoubleClick(e, note.id, "title")
                  }
                  className="text-foreground font-medium text-[13px]"
                >
                  {isEditing && editingCell.fieldName === "title" ? (
                    <InlineEditor
                      field="title"
                      value={note.title}
                      onCommit={(v) => handleCommit(note.id, "title", v)}
                      onCancel={() => setEditingCell(null)}
                    />
                  ) : (
                    note.title
                  )}
                </TableCell>
                {fields.map((f) => {
                  const val = note.metadata?.[f.name];
                  const editing =
                    isEditing && editingCell.fieldName === f.name;
                  return (
                    <TableCell
                      key={f.name}
                      onDoubleClick={(e) =>
                        handleCellDoubleClick(e, note.id, f.name)
                      }
                      className="text-muted-foreground whitespace-nowrap text-[13px] font-mono"
                    >
                      {editing ? (
                        <InlineEditor
                          field={f}
                          value={val}
                          onCommit={(v) => handleCommit(note.id, f.name, v)}
                          onCancel={() => setEditingCell(null)}
                        />
                      ) : f.type === "tags" && Array.isArray(val) ? (
                        <div className="flex gap-1 flex-wrap">
                          {val.map((t: string) => (
                            <span
                              key={t}
                              className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium font-mono rounded-full border border-primary/30 text-primary bg-primary/[0.04]"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : val != null ? (
                        String(val)
                      ) : (
                        <span className="text-muted-foreground/30">--</span>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell className="w-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      clearTimeout(clickTimer.current);
                      setDeleteTarget({ id: note.id, title: note.title });
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete note"
          description="This note will be archived and hidden from all views."
          details={{ Title: deleteTarget.title }}
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
