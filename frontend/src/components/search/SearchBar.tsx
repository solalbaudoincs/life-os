import { useState, useRef, useEffect } from "react";
import { Search } from "lucide-react";
import { searchNotes, type SearchResult } from "../../api/search";
import { useModuleStore } from "../../stores/moduleStore";
import { useNoteStore } from "../../stores/noteStore";
import { useUIStore } from "../../stores/uiStore";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/** Strip markdown syntax for a clean plain-text preview. */
function stripMd(s: string): string {
  return s
    .replace(/^#{1,6}\s+/gm, "")   // headings
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/\*(.+?)\*/g, "$1")     // italic
    .replace(/`(.+?)`/g, "$1")       // inline code
    .replace(/\[(.+?)\]\(.+?\)/g, "$1") // links
    .replace(/^[-*]\s+/gm, "")      // list markers
    .trim();
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const setActiveModule = useModuleStore((s) => s.setActiveModule);
  const fetchForModule = useNoteStore((s) => s.fetchForModule);
  const setActiveNote = useNoteStore((s) => s.setActiveNote);
  const openSearchView = useUIStore((s) => s.openSearch);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Listen for Cmd+K focus event
  useEffect(() => {
    const onFocus = () => inputRef.current?.focus();
    window.addEventListener("focus-search", onFocus);
    return () => window.removeEventListener("focus-search", onFocus);
  }, []);

  const doSearch = async (q: string, limit: number) => {
    setLoading(true);
    try {
      const resp = await searchNotes(q, undefined, limit);
      setResults(resp.results);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (val: string) => {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!val.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    timerRef.current = setTimeout(() => doSearch(val.trim(), 5), 300);
  };

  const handleViewAll = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(false);
    openSearchView(query.trim());
  };

  const handleSelect = (r: SearchResult) => {
    setActiveModule(r.module_id);
    fetchForModule(r.module_id);
    setTimeout(() => setActiveNote(r.note_id), 100);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      <div data-tour="header-search" className="flex items-center gap-1.5 bg-[hsl(var(--foreground)/0.025)] rounded-md px-2.5 py-[5px] w-48 transition-all focus-within:bg-[hsl(var(--foreground)/0.04)]">
        <Search size={13} className="text-muted-foreground/40 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) handleViewAll(); }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search..."
          className="bg-transparent border-none text-[12px] text-foreground w-full p-0 outline-none placeholder:text-muted-foreground/40"
        />
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute top-full right-0 mt-1 w-[380px] max-h-[400px] overflow-auto bg-[hsl(var(--popover))] border border-[hsl(var(--foreground)/0.06)] rounded-lg z-[200]"
          style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.03)" }}
        >
          <div className="px-3.5 py-2 text-[11px] text-muted-foreground/50 border-b border-[hsl(var(--foreground)/0.04)]">
            {loading
              ? "Searching..."
              : `${results.length} result${results.length !== 1 ? "s" : ""}`}
          </div>
          {results.map((r) => (
            <button
              key={r.note_id}
              onClick={() => handleSelect(r)}
              className="block w-full text-left px-3.5 py-2.5 border-b border-[hsl(var(--foreground)/0.03)] cursor-pointer transition-colors hover:bg-[hsl(var(--foreground)/0.02)]"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Badge variant="secondary" className="text-xs font-normal">
                  {r.module_icon} {r.module_display_name}
                </Badge>
              </div>
              <div className="text-sm font-medium text-foreground">
                {r.title}
              </div>
              {r.content_preview && (
                <div className="text-xs text-muted-foreground/70 mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">
                  {stripMd(r.content_preview)}
                </div>
              )}
            </button>
          ))}

          {/* View all results */}
          {results.length >= 5 && (
            <button
              onClick={handleViewAll}
              className="block w-full py-3 px-4 text-sm text-primary text-center cursor-pointer transition-colors hover:bg-muted"
            >
              View all results
            </button>
          )}
        </div>
      )}
    </div>
  );
}
