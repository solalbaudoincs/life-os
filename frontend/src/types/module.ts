export type FieldType =
  | "string"
  | "text"
  | "integer"
  | "float"
  | "boolean"
  | "date"
  | "datetime"
  | "url"
  | "email"
  | "enum"
  | "tags";

export interface FieldDefinition {
  name: string;
  type: FieldType;
  required?: boolean;
  default?: string | number | boolean | null;
  values?: string[];
  description?: string;
}

export interface ViewConfig {
  name: string;
  type: "list" | "grouped" | "kanban" | "table" | "calendar";
  group_by?: string;
  sort_by?: string;
  filters?: Record<string, unknown>;
}

export interface ActionConfig {
  id: string;
  type: "web_search" | "internal_scan" | "enrichment";
  name: string;
  description: string;
  trigger: "scheduled" | "on_demand" | "on_event";
  frequency?: string;
  config: Record<string, unknown>;
  mcp_servers?: string[];
}

export interface Module {
  id: string;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  fields_schema: FieldDefinition[];
  status_lifecycle: string[];
  alerts_config: unknown[];
  actions_config: ActionConfig[];
  views_config: ViewConfig[];
  is_system: boolean;
  sort_order: number;
  last_action_runs: Record<string, string>;
  created_at: string;
  updated_at: string;
  note_count: number;
}
