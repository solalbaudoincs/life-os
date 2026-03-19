import { useEffect, useRef } from "react";
import { Mic, X } from "lucide-react";
import { useUIStore } from "../../stores/uiStore";
import { Button } from "@/components/ui/button";

export function VoiceOverlay() {
  const voiceState = useUIStore((s) => s.voiceState);
  const toggleVoice = useUIStore((s) => s.toggleVoice);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (voiceState !== "recording") {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    // Connect to the active mic stream for visualization
    let ctx: AudioContext | null = null;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

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

            canvasCtx.fillStyle = `rgba(212, 168, 83, ${0.4 + val * 0.6})`;
            canvasCtx.beginPath();
            canvasCtx.roundRect(x, y, barW, barH, 2);
            canvasCtx.fill();
          }
        };
        draw();
      } catch {
        // mic already in use by MediaRecorder -- that's fine, skip viz
      }
    })();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (ctx) ctx.close();
    };
  }, [voiceState]);

  if (voiceState !== "recording") return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] bg-card border border-border rounded-2xl px-6 py-4 flex items-center gap-4 shadow-lg animate-slide-up">
      <div className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center animate-gentle-pulse shrink-0">
        <Mic className="h-4 w-4 text-background" />
      </div>

      <canvas
        ref={canvasRef}
        width={200}
        height={40}
        className="block"
      />

      <Button
        variant="secondary"
        size="icon"
        onClick={toggleVoice}
        className="h-7 w-7 rounded-full shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
