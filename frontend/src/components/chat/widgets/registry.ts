import type { ComponentType } from "react";
import type { WidgetProps } from "./types";
import { NoteCardWidget } from "./NoteCardWidget";
import { ModuleCardWidget } from "./ModuleCardWidget";
import { ModuleListWidget } from "./ModuleListWidget";

/**
 * Widget registry — maps widget type strings to React components.
 *
 * To add a new widget:
 * 1. Create a component implementing WidgetProps
 * 2. Add it to this registry
 * 3. Have the backend tool executor add `_widget: {type: "your_type"}` to the tool result
 */
const WIDGET_REGISTRY: Record<string, ComponentType<WidgetProps>> = {
  note_card: NoteCardWidget,
  module_card: ModuleCardWidget,
  module_list: ModuleListWidget,
};

export function getWidget(type: string): ComponentType<WidgetProps> | null {
  return WIDGET_REGISTRY[type] ?? null;
}
