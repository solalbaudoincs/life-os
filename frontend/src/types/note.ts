export interface Note {
  id: string;
  module_id: string;
  title: string;
  content_md: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  archived: boolean;
}
