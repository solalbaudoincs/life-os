import { useState, useRef, useEffect } from "react";
import { ArrowUp, X, Loader2, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "../../stores/chatStore";
import { useModuleStore } from "../../stores/moduleStore";
import { useNoteStore } from "../../stores/noteStore";
import { useUIStore } from "../../stores/uiStore";
import { ChatMarkdown } from "../chat/ChatMarkdown";
import { ChatToolCall } from "../chat/ChatToolCall";

export function ChatOverlay() {
  const open = useUIStore((s) => s.chatOpen);
  const setOpen = useUIStore((s) => s.setChatOpen);
  const voiceState = useUIStore((s) => s.voiceState);
  const toggleVoice = useUIStore((s) => s.toggleVoice);
  const [input, setInput] = useState("");
  const { messages, loading, send, pendingConfirmation, confirmPendingAction, cancelPendingAction, streamingContent, streamingToolCalls, activeToolName, suggestedFollowups } = useChatStore();
  const fetchModules = useModuleStore((s) => s.fetch);
  const activeModuleId = useModuleStore((s) => s.activeModuleId);
  const fetchForModule = useNoteStore((s) => s.fetchForModule);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

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

          const barCount = 24;
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, streamingContent, streamingToolCalls]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setOpen(true);
    send(text).then(() => {
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

  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const breakpoint = useUIStore((s) => s.breakpoint);
  const sidebarOffset = breakpoint === "mobile" ? 0 : sidebarCollapsed ? 28 : 110;

  if (!activeModuleId) return null;

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-[52px] -translate-x-1/2 w-[480px] max-w-[calc(100vw-160px)] h-[440px] bg-[hsl(var(--popover))] border border-[hsl(var(--foreground)/0.06)] rounded-t-xl flex flex-col overflow-hidden z-[100] animate-slide-up"
          style={{ left: `calc(50% + ${sidebarOffset}px)`, boxShadow: "0 -8px 40px rgba(0,0,0,0.06), 0 -2px 12px rgba(0,0,0,0.03)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[hsl(var(--foreground)/0.04)] shrink-0">
            <span className="text-[12px] font-medium text-muted-foreground/60">Agent</span>
            <button
              onClick={() => setOpen(false)}
              className="p-1 text-muted-foreground/30 hover:text-muted-foreground rounded transition-colors"
            >
              <X size={13} />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-2.5"
          >
            {messages.length === 0 && !loading && (
              <div className="flex-1 flex items-center justify-center text-muted-foreground/35 text-[13px] text-center leading-relaxed">
                Ask anything about your vault
                <br />
                or tell me what to do.
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] px-3 py-2 text-[13px] leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
                      : "bg-[hsl(var(--foreground)/0.03)] text-foreground rounded-2xl rounded-bl-sm"
                  )}
                >
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div className="mb-1.5">
                      {msg.tool_calls.map((tc, j) => (
                        <ChatToolCall key={j} tc={tc} compact />
                      ))}
                    </div>
                  )}
                  {msg.role === "assistant" ? (
                    <ChatMarkdown content={msg.content} compact />
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {loading && !pendingConfirmation && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-sm bg-[hsl(var(--foreground)/0.03)] text-foreground text-[13px] leading-relaxed">
                  {streamingToolCalls.length > 0 && (
                    <div className="mb-1.5">
                      {streamingToolCalls.map((tc, j) => (
                        <ChatToolCall key={j} tc={tc} compact />
                      ))}
                    </div>
                  )}
                  {activeToolName && (
                    <div className="flex items-center gap-1.5 text-muted-foreground/50 text-[12px] mb-1">
                      <Loader2 size={10} className="animate-spin" />
                      Running {activeToolName}...
                    </div>
                  )}
                  {streamingContent ? (
                    <ChatMarkdown content={streamingContent} compact />
                  ) : !activeToolName && streamingToolCalls.length === 0 ? (
                    <div className="flex items-center gap-2 text-muted-foreground/50">
                      <Loader2 size={12} className="animate-spin" />
                      Thinking...
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {!loading && suggestedFollowups.length > 0 && (
              <div className="flex flex-wrap gap-1 px-1">
                {suggestedFollowups.map((followup, i) => (
                  <button
                    key={i}
                    onClick={() => { setOpen(true); send(followup); fetchModules(); }}
                    className="px-2.5 py-1 rounded-full text-[11px] text-muted-foreground/60 border border-[hsl(var(--foreground)/0.06)] hover:border-primary/30 hover:text-foreground transition-colors"
                  >
                    {followup}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Confirmation dialog for dangerous actions */}
          {pendingConfirmation && (
            <div className="shrink-0 px-3 pb-2">
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="text-[12px] font-medium text-foreground mb-1">
                  {pendingConfirmation.title}
                </div>
                <div className="text-[11px] text-muted-foreground mb-2">
                  {pendingConfirmation.description}
                </div>
                {Object.keys(pendingConfirmation.details).length > 0 && (
                  <div className="bg-muted rounded px-2.5 py-1.5 text-[11px] mb-2">
                    {Object.entries(pendingConfirmation.details).map(([key, value]) => (
                      <div key={key} className="flex justify-between py-0.5">
                        <span className="text-muted-foreground">{key}</span>
                        <span className="text-foreground">{String(value ?? "")}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-end gap-1.5">
                  <button
                    onClick={handleCancel}
                    disabled={loading}
                    className="px-2.5 py-1 text-[11px] rounded border border-border bg-background text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={loading}
                    className={cn(
                      "px-2.5 py-1 text-[11px] rounded text-white transition-colors",
                      pendingConfirmation.destructive
                        ? "bg-destructive hover:bg-destructive/90"
                        : "bg-green-600 hover:bg-green-700"
                    )}
                  >
                    {loading ? <Loader2 size={11} className="animate-spin" /> : pendingConfirmation.confirm_label}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom bar */}
      <div data-tour="chat-bar" className="fixed bottom-4 -translate-x-1/2 z-[101] w-[480px] max-w-[calc(100vw-160px)]" style={{ left: `calc(50% + ${sidebarOffset}px)` }}>
        <div
          className={cn(
            "flex items-center gap-2 bg-[hsl(var(--popover))] border border-[hsl(var(--foreground)/0.06)] px-3.5 py-1.5",
            open ? "rounded-b-2xl" : "rounded-full",
            voiceState === "recording" && "border-red-500/20"
          )}
          style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
        >
          {voiceState === "recording" ? (
            <>
              <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shrink-0 animate-gentle-pulse">
                <Mic size={10} className="text-white" />
              </div>
              <canvas
                ref={canvasRef}
                width={300}
                height={28}
                className="flex-1 block"
              />
              <button
                onClick={toggleVoice}
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                <Square size={10} />
              </button>
            </>
          ) : voiceState === "processing" ? (
            <>
              <Loader2 size={14} className="animate-spin text-muted-foreground/50 shrink-0" />
              <span className="flex-1 text-[13px] text-muted-foreground/50">Processing voice...</span>
            </>
          ) : (
            <>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Message the agent..."
                disabled={loading}
                className={cn(
                  "flex-1 bg-transparent border-none text-[13px] text-foreground py-1 outline-none placeholder:text-muted-foreground/35",
                  loading && "opacity-40"
                )}
              />
              <button
                onClick={toggleVoice}
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-muted-foreground/30 hover:text-muted-foreground hover:bg-[hsl(var(--foreground)/0.04)] transition-all duration-100"
              >
                <Mic size={13} />
              </button>
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-100",
                  loading || !input.trim()
                    ? "bg-[hsl(var(--foreground)/0.04)] text-muted-foreground/30"
                    : "bg-primary text-primary-foreground"
                )}
              >
                {loading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <ArrowUp size={13} />
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
