import { FileText } from "lucide-react";
import { useModuleStore } from "../../../stores/moduleStore";
import { useNoteStore } from "../../../stores/noteStore";
import { useUIStore } from "../../../stores/uiStore";
import type { WidgetProps } from "./types";

export function NoteCardWidget({ data }: WidgetProps) {
  const setActiveModule = useModuleStore((s) => s.setActiveModule);
  const setActiveNote = useNoteStore((s) => s.setActiveNote);
  const fetchForModule = useNoteStore((s) => s.fetchForModule);
  const setActiveView = useUIStore((s) => s.setActiveView);

  const title = data.title as string;
  const contentMd = data.content_md as string;
  const metadata = data.metadata as Record<string, unknown> | undefined;
  const noteId = data.note_id as string;
  const moduleId = data.module_id as string | undefined;

  const preview = contentMd
    ? contentMd.slice(0, 200) + (contentMd.length > 200 ? "..." : "")
    : "";

  const metaEntries = metadata
    ? Object.entries(metadata).filter(([, v]) => v != null && v !== "")
    : [];

  const handleClick = () => {
    if (moduleId) {
      setActiveModule(moduleId);
      fetchForModule(moduleId);
      setActiveView("dashboard");
      setTimeout(() => setActiveNote(noteId), 100);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="w-full text-left my-1.5 p-3 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors cursor-pointer block"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <FileText size={13} className="text-primary/60 shrink-0" />
        <span className="text-[13px] font-medium text-foreground truncate">
          {title}
        </span>
      </div>
      {preview && (
        <div className="text-[12px] text-muted-foreground/60 leading-relaxed line-clamp-3 mb-1.5">
          {preview}
        </div>
      )}
      {metaEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {metaEntries.slice(0, 4).map(([key, value]) => (
            <span
              key={key}
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
            >
              {key}: {String(value)}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
