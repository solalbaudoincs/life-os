import { useEffect, useState } from "react";
import { X, RefreshCw, Radar } from "lucide-react";
import { toast } from "sonner";
import { fetchBriefing, triggerProactiveScan, type BriefingSection } from "../../api/suggestions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const DOT_COLOR_CLASSES: Record<string, string> = {
  red: "bg-red-500",
  green: "bg-green-600",
  accent: "bg-primary",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
};

export function BriefingPanel({ onClose }: { onClose: () => void }) {
  const [sections, setSections] = useState<BriefingSection[]>([]);
  const [generatedAt, setGeneratedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await fetchBriefing();
      setSections(resp.sections);
      setGeneratedAt(resp.generated_at);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await triggerProactiveScan();
      toast.success("Proactive scan started");
      // Refresh briefing after a delay to let scan complete
      setTimeout(() => {
        load();
        setScanning(false);
      }, 3000);
    } catch {
      toast.error("Failed to start scan");
      setScanning(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="fixed top-12 right-4 w-[400px] max-h-[calc(100vh-100px)] bg-card border border-border rounded-lg z-[200] flex flex-col overflow-hidden animate-scale-in shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-sm font-semibold text-foreground">
          Briefing
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleScan}
            disabled={scanning}
            title="Run full scan"
            className={cn("h-6 w-6", scanning && "text-primary opacity-70")}
          >
            <Radar className={cn("h-3.5 w-3.5", scanning && "animate-gentle-pulse")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={load}
            disabled={loading}
            title="Refresh"
            className="h-6 w-6"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Scanning indicator */}
      {scanning && (
        <div className="px-3.5 py-2 bg-primary/10 text-xs text-primary flex items-center gap-2">
          <Radar className="h-3 w-3 animate-gentle-pulse" />
          Running proactive scan...
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 py-3.5">
          {loading && sections.length === 0 && (
            <div className="p-5 text-center text-muted-foreground text-xs">
              Generating briefing...
            </div>
          )}

          {sections.map((section) => {
            const dotClass = DOT_COLOR_CLASSES[section.color] || "bg-muted-foreground";
            return (
              <div key={section.name} className="mb-4">
                {/* Section header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", dotClass)} />
                  <span className="text-xs font-medium text-foreground uppercase tracking-wide">
                    {section.name}
                  </span>
                </div>

                {/* Items */}
                {section.items.map((item, i) => (
                  <div
                    key={i}
                    className="p-2.5 bg-muted rounded-md mb-1 ml-3.5"
                  >
                    <div className="text-sm text-foreground">
                      {item.title}
                    </div>
                    {item.summary && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {item.summary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {generatedAt && (
            <div className="text-center text-[10px] text-muted-foreground mt-2">
              Generated {new Date(generatedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
