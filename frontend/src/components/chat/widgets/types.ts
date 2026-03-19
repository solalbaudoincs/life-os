import type { ToolCallInfo } from "../../../types/chat";

export interface WidgetProps {
  type: string;
  data: Record<string, unknown>;
  toolCall: ToolCallInfo;
}
