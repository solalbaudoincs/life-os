import { useState, useEffect } from "react";
import type { Module, FieldDefinition } from "../../types/module";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const inputClasses =
  "text-sm px-2.5 py-1 bg-muted border border-border rounded-md text-foreground outline-none focus:ring-1 focus:ring-ring font-mono";

/**
 * Text-like field that keeps local state while typing
 * and only commits on blur or Enter.
 */
function TextMetaField({
  value,
  onCommit,
  type = "text",
  placeholder,
  width = 140,
}: {
  value: string;
  onCommit: (v: string) => void;
  type?: string;
  placeholder?: string;
  width?: number;
}) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = () => {
    if (local !== value) onCommit(local);
  };

  return (
    <input
      type={type}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      className={inputClasses}
      style={{ width }}
    />
  );
}

export function MetadataBar({
  module,
  metadata,
  onChange,
}: {
  module: Module;
  metadata: Record<string, unknown>;
  onChange: (meta: Record<string, unknown>) => void;
}) {
  const fields = module.fields_schema;

  if (fields.length === 0) return null;

  const update = (name: string, value: unknown) => {
    onChange({ ...metadata, [name]: value });
  };

  const renderField = (f: FieldDefinition) => {
    const val = metadata[f.name];

    if (f.type === "enum" && f.values) {
      return (
        <Select
          value={(val as string) || "__none__"}
          onValueChange={(v) => update(f.name, v === "__none__" ? null : v)}
        >
          <SelectTrigger className="h-7 w-auto min-w-[100px] text-sm bg-muted border-border">
            <SelectValue placeholder="--" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">--</SelectItem>
            {f.values.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (f.type === "boolean") {
      return (
        <input
          type="checkbox"
          checked={!!val}
          onChange={(e) => update(f.name, e.target.checked)}
          className="accent-primary"
        />
      );
    }

    if (f.type === "date") {
      return (
        <input
          type="date"
          value={(val as string) ?? ""}
          onChange={(e) => update(f.name, e.target.value || null)}
          className={inputClasses}
        />
      );
    }

    if (f.type === "tags") {
      return (
        <TextMetaField
          value={Array.isArray(val) ? (val as string[]).join(", ") : ""}
          onCommit={(v) =>
            update(f.name, v.split(",").map((s) => s.trim()).filter(Boolean))
          }
          placeholder="tag1, tag2"
          width={120}
        />
      );
    }

    if (f.type === "integer" || f.type === "float") {
      return (
        <TextMetaField
          value={val != null ? String(val) : ""}
          onCommit={(v) => update(f.name, v ? Number(v) : null)}
          type="number"
          width={80}
        />
      );
    }

    // string, text, url, email
    return (
      <TextMetaField
        value={(val as string) ?? ""}
        onCommit={(v) => update(f.name, v || null)}
        type={f.type === "url" ? "url" : f.type === "email" ? "email" : "text"}
        width={140}
      />
    );
  };

  return (
    <div className="flex flex-wrap gap-4 px-7 py-3.5 border-b border-border bg-background">
      {fields.map((f) => (
        <div key={f.name} className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-muted-foreground/70 capitalize">
            {f.name}
          </label>
          {renderField(f)}
        </div>
      ))}
    </div>
  );
}
