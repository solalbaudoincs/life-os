import { useRef, useEffect, useState } from "react";
import { ArrowUp, Loader2, Plus, MessageSquare, ArrowLeft, Search, RefreshCw, Mic, Square, HelpCircle } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { useModuleStore } from "../../stores/moduleStore";
import { useNoteStore } from "../../stores/noteStore";
import { useUIStore } from "../../stores/uiStore";
import { useBriefingStore } from "../../stores/briefingStore";
import { searchNotes, type SearchResult } from "../../api/search";

import { ChatMarkdown, chatMarkdownStyles } from "../chat/ChatMarkdown";
import { ChatToolCall } from "../chat/ChatToolCall";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PixelGrid } from "@/components/ui/pixel-grid";
import { startTour } from "../../hooks/useTour";

const QUICK_ACTIONS = [
  "Summarize recent activity",
  "What notes need attention?",
  "Show pipeline status",
  "Create a new module",
  "Find duplicates across modules",
  "What's overdue?",
  "Draft a follow-up email",
  "Suggest next steps",
  "List untagged notes",
  "Compare this week vs last",
  "What did I add today?",
  "Search for internships",
  "Enrich incomplete notes",
  "Show upcoming deadlines",
  "Run a full scan",
];

function useAutoScroll(speed = 0.5) {
  const ref = useRef<HTMLDivElement>(null);
  const hovering = useRef(false);
  const rafId = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let last = 0;
    const tick = (ts: number) => {
      if (last) {
        const dt = ts - last;
        if (!hovering.current) {
          el.scrollLeft += speed * (dt / 16);
          // Snap back when we've scrolled past the first copy
          const half = el.scrollWidth / 2;
          if (el.scrollLeft >= half) {
            el.scrollLeft -= half;
          }
        }
      }
      last = ts;
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [speed]);

  const onMouseEnter = () => { hovering.current = true; };
  const onMouseLeave = () => { hovering.current = false; };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.currentTarget.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };

  return { ref, onMouseEnter, onMouseLeave, onWheel };
}

function useScrollFades() {
  const ref = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 2);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, []);

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.currentTarget.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };

  return { ref, showLeft, showRight, onWheel };
}

export function FullScreenChatView() {
  const [input, setInput] = useState("");
  const {
    messages,
    loading,
    send,
    conversationsLoaded,
    fetchConversations,
    startNewConversation,
    pendingConfirmation,
    confirmPendingAction,
    cancelPendingAction,
    streamingContent,
    streamingToolCalls,
    activeToolName,
    suggestedFollowups,
  } = useChatStore();
  const fetchModules = useModuleStore((s) => s.fetch);
  const modules = useModuleStore((s) => s.modules);
  const activeModuleId = useModuleStore((s) => s.activeModuleId);
  const setActiveModule = useModuleStore((s) => s.setActiveModule);
  const fetchForModule = useNoteStore((s) => s.fetchForModule);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const { sections: briefingSections, cachedAt: briefingCachedAt, loading: briefingLoading, load: loadBriefing, regenerate: regenerateBriefing, isStale: isBriefingStale } = useBriefingStore();
  const voiceState = useUIStore((s) => s.voiceState);
  const toggleVoice = useUIStore((s) => s.toggleVoice);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const setActiveNote = useNoteStore((s) => s.setActiveNote);
  const openSearchView = useUIStore((s) => s.openSearch);
  const setShowSuggestionsView = useUIStore((s) => s.setShowSuggestionsView);
  const setSuggestionModuleFilter = useUIStore((s) => s.setSuggestionModuleFilter);
  const setHighlightSuggestionId = useUIStore((s) => s.setHighlightSuggestionId);

  const modulesScroll = useScrollFades();
  const actionsScroll = useAutoScroll(0.4);

  // Home search
  const [homeSearch, setHomeSearch] = useState("");
  const [homeSearchResults, setHomeSearchResults] = useState<SearchResult[]>([]);
  const [homeSearching, setHomeSearching] = useState(false);
  const homeSearchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleHomeSearch = (val: string) => {
    setHomeSearch(val);
    clearTimeout(homeSearchTimer.current);
    if (!val.trim()) {
      setHomeSearchResults([]);
      return;
    }
    homeSearchTimer.current = setTimeout(async () => {
      setHomeSearching(true);
      try {
        const resp = await searchNotes(val.trim(), undefined, 5);
        setHomeSearchResults(resp.results);
      } catch {
        setHomeSearchResults([]);
      } finally {
        setHomeSearching(false);
      }
    }, 250);
  };

  const handleSearchSelect = (r: SearchResult) => {
    setActiveModule(r.module_id);
    fetchForModule(r.module_id);
    setTimeout(() => setActiveNote(r.note_id), 100);
    setHomeSearch("");
    setHomeSearchResults([]);
  };

  // Load conversations + suggestions on mount
  useEffect(() => {
    if (!conversationsLoaded) {
      fetchConversations();
    }
  }, [conversationsLoaded, fetchConversations]);

  useEffect(() => {
    loadBriefing();
  }, [loadBriefing]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, streamingContent, streamingToolCalls]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  // Audio visualizer for recording state
  useEffect(() => {
    if (voiceState !== "recording") {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    let ctx: AudioContext | null = null;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const canvasCtx = canvas.getContext("2d");
        if (!canvasCtx) return;

        const bufLen = analyser.frequencyBinCount;
        const data = new Uint8Array(bufLen);

        const draw = () => {
          animRef.current = requestAnimationFrame(draw);
          analyser.getByteFrequencyData(data);

          const w = canvas.width;
          const h = canvas.height;
          canvasCtx.clearRect(0, 0, w, h);

          const barCount = 32;
          const barW = w / barCount - 2;
          for (let i = 0; i < barCount; i++) {
            const idx = Math.floor((i / barCount) * bufLen);
            const val = data[idx] / 255;
            const barH = Math.max(2, val * h * 0.8);
            const x = i * (barW + 2) + 1;
            const y = (h - barH) / 2;

            canvasCtx.fillStyle = `rgba(239, 68, 68, ${0.4 + val * 0.6})`;
            canvasCtx.beginPath();
            canvasCtx.roundRect(x, y, barW, barH, 2);
            canvasCtx.fill();
          }
        };
        draw();
      } catch {
        // mic already in use by MediaRecorder — skip viz
      }
    })();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (ctx) ctx.close();
    };
  }, [voiceState]);

  const handleSend = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    send(msg).then(() => {
      fetchModules();
      if (activeModuleId) fetchForModule(activeModuleId);
    });
  };

  const handleConfirm = async () => {
    await confirmPendingAction();
    fetchModules();
    if (activeModuleId) fetchForModule(activeModuleId);
  };

  const handleCancel = async () => {
    await cancelPendingAction();
  };

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div className="flex flex-col h-full relative">
      {/* Pixel grid background on home */}
      {isEmpty && (
        <PixelGrid
          pixelColor="#ffaf00"
          pixelSize={6}
          pixelSpacing={7}
          noiseScale={0.075}
          speed={0.58}
          cutoff={0.39}
          maxAlpha={1}
          contained
          className="pointer-events-none z-0"
        />
      )}
      {/* Header with back + new chat buttons when in a conversation */}
      {!isEmpty && (
        <div className="shrink-0 px-7 py-3.5 flex justify-between border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={startNewConversation}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} />
            All chats
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={startNewConversation}
            className="gap-1.5 hover:border-primary hover:text-primary"
          >
            <Plus size={14} />
            New chat
          </Button>
        </div>
      )}

      {/* Scrollable messages area */}
      <div
        ref={scrollRef}
        className={cn(
          "flex-1 overflow-auto flex flex-col",
          isEmpty ? "p-0" : "pt-9 pb-7"
        )}
      >
        {isEmpty ? (
          /* Empty state - centered dashboard — never scrolls as a whole */
          <div className="flex-1 flex flex-col overflow-hidden relative z-10">
            {/* Fixed top: hero + search + modules */}
            <div className="shrink-0 max-w-[960px] w-full mx-auto px-7 pt-2">
              {/* Hero — pixelated logo */}
              <div className="text-center mb-4">
                <div
                  className="text-[40px] leading-none font-bold tracking-[0.08em] uppercase select-none mb-1.5"
                  style={{
                    fontFamily: "var(--font-pixel)",
                    color: "hsl(30 72% 46%)",
                    textShadow: "2px 2px 0 hsl(30 72% 46% / 0.15)",
                    imageRendering: "pixelated",
                  }}
                >
                  life os
                </div>
                <div className="text-[12px] text-muted-foreground/50 font-mono">
                  Ask anything about your vault or tell me what to do.
                </div>
              </div>

              {/* Search bar */}
              <div data-tour="home-search" className="relative max-w-md mx-auto mb-5">
                <div className="flex items-center gap-2 bg-[hsl(var(--foreground)/0.025)] rounded-lg px-3.5 py-2 transition-all focus-within:bg-[hsl(var(--foreground)/0.04)] focus-within:ring-1 focus-within:ring-[hsl(var(--foreground)/0.06)]">
                  <Search size={14} className="text-muted-foreground/40 shrink-0" />
                  <input
                    type="text"
                    value={homeSearch}
                    onChange={(e) => handleHomeSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && homeSearch.trim()) {
                        openSearchView(homeSearch.trim());
                        setHomeSearch("");
                        setHomeSearchResults([]);
                      }
                    }}
                    placeholder="Search notes..."
                    className="bg-transparent border-none text-[13px] text-foreground w-full p-0 outline-none placeholder:text-muted-foreground/40 font-mono"
                  />
                  {homeSearching && <Loader2 size={13} className="animate-spin text-muted-foreground/40" />}
                </div>
                {homeSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[hsl(var(--popover))] border border-[hsl(var(--foreground)/0.06)] rounded-lg overflow-hidden z-20" style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
                    {homeSearchResults.map((r) => (
                      <button
                        key={r.note_id}
                        onClick={() => handleSearchSelect(r)}
                        className="flex items-center gap-2 w-full text-left px-3.5 py-2 text-[13px] hover:bg-[hsl(var(--foreground)/0.02)] transition-colors border-b border-[hsl(var(--foreground)/0.03)] last:border-0"
                      >
                        <span className="text-muted-foreground/40 font-mono text-[11px]">{r.module_icon}</span>
                        <span className="text-foreground truncate flex-1">{r.title}</span>
                        <span className="text-[10px] font-mono text-muted-foreground/30 shrink-0">{r.module_display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Modules — horizontal scroll with blur fade */}
              {modules.length > 0 && (
                <div data-tour="module-cards" className="relative mb-4">
                  <div
                    ref={modulesScroll.ref}
                    className="flex gap-2 overflow-x-auto overflow-y-hidden"
                    style={{ scrollbarWidth: "none" }}
                    onWheel={modulesScroll.onWheel}
                  >
                    {modules.map((mod) => (
                      <button
                        key={mod.id}
                        onClick={() => {
                          setActiveModule(mod.id);
                          setActiveView("dashboard");
                        }}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-card/90 backdrop-blur-sm border border-border cursor-pointer transition-colors text-left font-[inherit] hover:shadow-sm hover:border-primary/20 shrink-0"
                      >
                        <span className="text-base shrink-0">{mod.icon || "\uD83D\uDCC1"}</span>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-foreground whitespace-nowrap">
                            {mod.display_name}
                          </div>
                          <div className="text-[11px] text-muted-foreground/50 whitespace-nowrap">
                            {mod.note_count} {mod.note_count === 1 ? "note" : "notes"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {modulesScroll.showLeft && <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent" />}
                  {modulesScroll.showRight && <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent" />}
                </div>
              )}

              {/* Briefing header + Recent chats button */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-muted-foreground/50">Briefing</span>
                  {briefingCachedAt && (
                    <span className="text-[11px] font-mono text-muted-foreground/40">
                      {isBriefingStale() && <span className="text-primary/60">stale · </span>}
                      {new Date(briefingCachedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  <button
                    onClick={regenerateBriefing}
                    disabled={briefingLoading}
                    className={cn(
                      "flex items-center gap-1 text-[11px] bg-transparent border-none cursor-pointer font-mono transition-colors",
                      isBriefingStale() ? "text-primary hover:text-primary/80" : "text-muted-foreground/30 hover:text-muted-foreground/60"
                    )}
                    title="Refresh briefing"
                  >
                    <RefreshCw size={11} className={briefingLoading ? "animate-spin" : ""} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={startTour}
                    className="flex items-center gap-1.5 text-[12px] text-muted-foreground/50 hover:text-foreground px-2.5 py-1 rounded-lg border border-[hsl(var(--foreground)/0.08)] hover:border-[hsl(var(--foreground)/0.15)] bg-transparent cursor-pointer font-mono transition-all"
                  >
                    <HelpCircle size={12} />
                    Tour
                  </button>
                  <button
                    onClick={() => setCommandPaletteOpen(true, "chats")}
                    className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-lg border border-[hsl(var(--foreground)/0.08)] hover:border-[hsl(var(--foreground)/0.15)] bg-transparent cursor-pointer font-mono transition-all"
                  >
                    <MessageSquare size={12} />
                    Recent chats
                    <kbd className="ml-1 text-[10px] text-muted-foreground/40 bg-[hsl(var(--foreground)/0.04)] rounded px-1.5 py-0.5 leading-none">⌘K</kbd>
                  </button>
                </div>
              </div>
            </div>

            {/* Briefing grid — each section is individually scrollable, 2 cols, 2 rows */}
            <div data-tour="briefing" className="flex-1 min-h-0 max-w-[960px] w-full mx-auto px-7 pb-2">
              {briefingSections.length > 0 ? (
                (() => {
                  const dotColors: Record<string, string> = {
                    red: "bg-red-500", green: "bg-green-600", accent: "bg-primary",
                    blue: "bg-blue-500", purple: "bg-purple-500",
                  };
                  // Split into two columns, filling top-to-bottom then wrapping
                  const mid = Math.ceil(briefingSections.length / 2);
                  const leftSections = briefingSections.slice(0, mid);
                  const rightSections = briefingSections.slice(mid);

                  const renderSection = (section: typeof briefingSections[0]) => {
                    const dotClass = dotColors[section.color] || "bg-muted-foreground";
                    return (
                      <div key={section.name} className="flex flex-col min-h-0 flex-1 rounded-md border border-[hsl(var(--foreground)/0.04)] bg-[hsl(var(--foreground)/0.01)] backdrop-blur-md overflow-hidden">
                        {/* Section header */}
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0 border-b border-[hsl(var(--foreground)/0.04)]">
                          <span className={cn("w-1 h-1 rounded-full shrink-0", dotClass)} />
                          <span className="text-[9px] font-mono uppercase tracking-[0.08em] text-muted-foreground/50">
                            {section.name}
                          </span>
                          <span className="text-[9px] font-mono text-muted-foreground/30 ml-auto">
                            {section.items.length}
                          </span>
                        </div>
                        {/* Scrollable items */}
                        <div className="flex-1 min-h-0 overflow-y-auto relative px-0.5 py-0.5" style={{ scrollbarWidth: "none" }}>
                          {section.items.map((item, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                if (!item.id) return;
                                if (item.module_id) {
                                  setSuggestionModuleFilter(item.module_id);
                                }
                                setHighlightSuggestionId(item.id);
                                setShowSuggestionsView(true);
                              }}
                              className={cn(
                                "w-full text-left py-1 px-2 rounded-sm transition-colors",
                                item.id ? "hover:bg-[hsl(var(--foreground)/0.03)] cursor-pointer" : "cursor-default"
                              )}
                            >
                              <div className="text-[11px] text-foreground leading-snug">{item.title}</div>
                              {item.summary && (
                                <div className="text-[10px] text-muted-foreground/50 leading-tight line-clamp-1">{item.summary}</div>
                              )}
                            </button>
                          ))}
                        </div>
                        {/* Bottom fade */}
                        <div className="pointer-events-none h-4 shrink-0 -mt-4 relative z-10 bg-gradient-to-t from-[hsl(var(--background))] to-transparent" />
                      </div>
                    );
                  };

                  return (
                    <div className="flex gap-3 h-full">
                      <div className="flex-1 flex flex-col gap-2 min-w-0 min-h-0">
                        {leftSections.map(renderSection)}
                      </div>
                      <div className="flex-1 flex flex-col gap-2 min-w-0 min-h-0">
                        {rightSections.map(renderSection)}
                      </div>
                    </div>
                  );
                })()
              ) : briefingLoading ? (
                <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground/40">
                  <Loader2 size={13} className="animate-spin" />
                  <span className="text-[11px] font-mono">Loading briefing...</span>
                </div>
              ) : (
                <div className="text-center py-8 text-[12px] text-muted-foreground/40 font-mono">
                  No briefing data yet
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="max-w-[720px] w-full mx-auto px-7 flex flex-col gap-7">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex flex-col",
                  msg.role === "user" ? "items-end" : "items-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] text-sm leading-7 tracking-tight",
                    msg.role === "user"
                      ? "px-4 py-3 rounded-xl bg-muted border border-border text-foreground"
                      : "text-foreground"
                  )}
                >
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div className="mb-2.5">
                      {msg.tool_calls.map((tc, j) => (
                        <ChatToolCall key={j} tc={tc} />
                      ))}
                    </div>
                  )}
                  {msg.role === "assistant" ? (
                    <ChatMarkdown content={msg.content} />
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {loading && !pendingConfirmation && (
              <div className="flex items-start">
                <div className="max-w-[80%] text-sm leading-7 tracking-tight text-foreground">
                  {streamingToolCalls.length > 0 && (
                    <div className="mb-2.5">
                      {streamingToolCalls.map((tc, j) => (
                        <ChatToolCall key={j} tc={tc} />
                      ))}
                    </div>
                  )}
                  {activeToolName && (
                    <div className="flex items-center gap-2 text-muted-foreground/60 text-sm mb-2">
                      <Loader2 size={12} className="animate-spin" />
                      Running {activeToolName}...
                    </div>
                  )}
                  {streamingContent ? (
                    <ChatMarkdown content={streamingContent} />
                  ) : !activeToolName && streamingToolCalls.length === 0 ? (
                    <div className="flex items-center gap-2 text-muted-foreground/60">
                      <Loader2 size={14} className="animate-spin shrink-0" />
                      Thinking...
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {!loading && suggestedFollowups.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestedFollowups.map((followup, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(followup)}
                    className="px-3 py-1 rounded-full text-[12px] text-muted-foreground/60 border border-[hsl(var(--foreground)/0.06)] hover:border-primary/30 hover:text-foreground transition-colors"
                  >
                    {followup}
                  </button>
                ))}
              </div>
            )}

            {pendingConfirmation && (
              <div className="flex items-start">
                <div className="max-w-[80%] rounded-xl border border-border bg-card p-4">
                  <div className="text-sm font-medium text-foreground mb-1">
                    {pendingConfirmation.title}
                  </div>
                  <div className="text-sm text-muted-foreground mb-3 leading-relaxed">
                    {pendingConfirmation.description}
                  </div>
                  {Object.keys(pendingConfirmation.details).length > 0 && (
                    <div className="bg-muted rounded-md px-3.5 py-2.5 text-xs mb-3">
                      {Object.entries(pendingConfirmation.details).map(([key, value]) => (
                        <div key={key} className="flex justify-between py-0.5">
                          <span className="text-muted-foreground">{key}</span>
                          <span className="text-foreground">{String(value ?? "")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancel}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleConfirm}
                      disabled={loading}
                      className={pendingConfirmation.destructive
                        ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        : "bg-green-600 text-white hover:bg-green-700"
                      }
                    >
                      {loading ? <Loader2 size={13} className="animate-spin" /> : pendingConfirmation.confirm_label}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input bar - pinned to bottom, centered */}
      <div className="shrink-0 px-7 pb-7 flex flex-col items-center relative z-10">
        {/* Quick actions — only on empty home, horizontal scroll */}
        {isEmpty && (
          <div
            data-tour="quick-actions"
            className="relative w-full max-w-[720px] mb-3"
            onMouseEnter={actionsScroll.onMouseEnter}
            onMouseLeave={actionsScroll.onMouseLeave}
          >
            <div
              ref={actionsScroll.ref}
              className="flex gap-2 overflow-x-auto overflow-y-hidden"
              style={{ scrollbarWidth: "none" }}
              onWheel={actionsScroll.onWheel}
            >
              {/* Render twice for seamless infinite scroll */}
              {[...QUICK_ACTIONS, ...QUICK_ACTIONS].map((s, i) => (
                <button
                  key={`${s}-${i}`}
                  onClick={() => handleSend(s)}
                  className="px-3 py-1 rounded-full text-[12px] text-muted-foreground/60 border border-[hsl(var(--foreground)/0.06)] bg-background/80 backdrop-blur-sm cursor-pointer transition-colors hover:border-primary/30 hover:text-foreground font-[inherit] shrink-0 whitespace-nowrap"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
          </div>
        )}
        <div data-tour="input-bar" className={cn(
          "w-full max-w-[720px] bg-muted/90 backdrop-blur-sm border rounded-2xl px-4 pt-3.5 pb-3 flex flex-col gap-2.5 shadow-lg",
          voiceState === "recording" ? "border-red-500/20" : "border-border"
        )}>
          {voiceState === "recording" ? (
            <div className="flex items-center gap-3 py-1">
              <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shrink-0 animate-gentle-pulse">
                <Mic size={12} className="text-white" />
              </div>
              <canvas
                ref={canvasRef}
                width={400}
                height={32}
                className="flex-1 block"
              />
              <button
                onClick={toggleVoice}
                className="w-[34px] h-[34px] rounded-full flex items-center justify-center shrink-0 bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer"
              >
                <Square size={12} />
              </button>
            </div>
          ) : voiceState === "processing" ? (
            <div className="flex items-center gap-3 py-2">
              <Loader2 size={14} className="animate-spin text-muted-foreground/50 shrink-0" />
              <span className="text-sm text-muted-foreground/50">Processing voice...</span>
            </div>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Message the agent..."
                disabled={loading}
                rows={1}
                className={cn(
                  "bg-transparent border-none outline-none resize-none text-sm font-[inherit] text-foreground leading-relaxed w-full tracking-tight",
                  loading && "opacity-50"
                )}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={toggleVoice}
                  className="w-[34px] h-[34px] rounded-full flex items-center justify-center border-none shrink-0 transition-all text-muted-foreground/40 hover:text-muted-foreground hover:bg-[hsl(var(--foreground)/0.04)] cursor-pointer"
                >
                  <Mic size={15} />
                </button>
                <button
                  onClick={() => handleSend()}
                  disabled={loading || !input.trim()}
                  className={cn(
                    "w-[34px] h-[34px] rounded-full flex items-center justify-center border-none shrink-0 transition-all",
                    loading || !input.trim()
                      ? "bg-secondary text-muted-foreground/60 cursor-default"
                      : "bg-primary text-primary-foreground cursor-pointer"
                  )}
                >
                  {loading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ArrowUp size={15} />
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        ${chatMarkdownStyles}
      `}</style>
    </div>
  );
}
