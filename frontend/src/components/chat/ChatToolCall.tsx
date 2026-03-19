import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { getWidget } from "./widgets/registry";
import type { ToolCallInfo } from "../../types/chat";

function ToolBadge({ tc }: { tc: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <span>
      <Badge
        variant="outline"
        className="cursor-pointer mr-1.5 mb-1.5 text-primary text-[10px] hover:border-primary transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {tc.name}
      </Badge>
      {expanded && (
        <pre className="text-[10px] text-muted-foreground/60 bg-card p-2 rounded-md mb-2 overflow-auto max-h-[140px]">
          {JSON.stringify(tc.arguments, null, 2)}
        </pre>
      )}
    </span>
  );
}

function ToolBadgeCompact({ tc }: { tc: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <span>
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-block px-1.5 py-px text-[10px] font-medium text-primary/70 bg-primary/[0.05] rounded mr-1 mb-1 cursor-pointer hover:bg-primary/[0.08] transition-colors"
      >
        {tc.name}
      </button>
      {expanded && (
        <pre className="text-[10px] text-muted-foreground bg-[hsl(var(--foreground)/0.02)] rounded p-2 mb-2 overflow-auto max-h-[140px]">
          {JSON.stringify(tc.arguments, null, 2)}
        </pre>
      )}
    </span>
  );
}

export function ChatToolCall({ tc, compact }: { tc: ToolCallInfo; compact?: boolean }) {
  const widgetHint = tc.result?._widget as { type: string } | undefined;
  const WidgetComponent = widgetHint ? getWidget(widgetHint.type) : null;

  if (WidgetComponent) {
    return <WidgetComponent type={widgetHint!.type} data={tc.result} toolCall={tc} />;
  }

  return compact ? <ToolBadgeCompact tc={tc} /> : <ToolBadge tc={tc} />;
}
