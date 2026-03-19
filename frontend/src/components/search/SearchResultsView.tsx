import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { searchNotes, type SearchResult } from "../../api/search";
import { useUIStore } from "../../stores/uiStore";
import { useModuleStore } from "../../stores/moduleStore";
import { useNoteStore } from "../../stores/noteStore";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function stripMd(s: string): string {
  return s
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .trim();
}

export function SearchResultsView({ query }: { query: string }) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const closeSearch = useUIStore((s) => s.closeSearch);
  const setActiveModule = useModuleStore((s) => s.setActiveModule);
  const fetchForModule = useNoteStore((s) => s.fetchForModule);
  const setActiveNote = useNoteStore((s) => s.setActiveNote);

  useEffect(() => {
    setLoading(true);
    searchNotes(query, undefined, 20).then((resp) => {
      setResults(resp.results);
      setLoading(false);
    });
  }, [query]);

  const handleSelect = (r: SearchResult) => {
    closeSearch();
    setActiveModule(r.module_id);
    fetchForModule(r.module_id);
    setTimeout(() => setActiveNote(r.note_id), 100);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={closeSearch}
          className="text-muted-foreground gap-1"
        >
          <ArrowLeft size={14} />
          Back
        </Button>
        <h2 className="text-lg font-medium text-foreground">
          Results for "{query}"
        </h2>
        <span className="text-sm text-muted-foreground/70">
          {loading ? "Searching..." : `${results.length} found`}
        </span>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto px-6 pt-4 pb-20 flex flex-col gap-2">
        {results.map((r) => (
          <button
            key={r.note_id}
            onClick={() => handleSelect(r)}
            className="block w-full text-left p-4 bg-card border border-border rounded-lg cursor-pointer transition-colors hover:border-primary"
          >
            {/* Module badge */}
            <div className="mb-2">
              <Badge variant="secondary" className="text-xs font-normal">
                {r.module_icon} {r.module_display_name}
              </Badge>
            </div>

            {/* Title */}
            <div className="text-base font-medium text-foreground mb-1.5">
              {r.title}
            </div>

            {/* Content preview */}
            {r.content_preview && (
              <div className="text-sm text-muted-foreground leading-relaxed">
                {stripMd(r.content_preview)}
              </div>
            )}

            {/* Metadata tags */}
            {r.metadata && Object.keys(r.metadata).length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2.5">
                {Object.entries(r.metadata).map(([k, v]) => {
                  if (v == null || k === "tags") return null;
                  return (
                    <Badge
                      key={k}
                      variant="secondary"
                      className="text-xs font-normal"
                    >
                      {k}: {String(v)}
                    </Badge>
                  );
                })}
                {Array.isArray(r.metadata.tags) &&
                  (r.metadata.tags as string[]).map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="text-xs font-normal text-primary"
                    >
                      {t}
                    </Badge>
                  ))}
              </div>
            )}
          </button>
        ))}

        {!loading && results.length === 0 && (
          <div className="text-center py-16 text-muted-foreground/70">
            <div className="text-base">
              No results for "{query}"
            </div>
            <div className="text-sm mt-1.5">
              Try broader terms or search across all modules.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
