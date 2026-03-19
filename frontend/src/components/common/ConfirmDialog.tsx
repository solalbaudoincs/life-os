import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface ConfirmDialogProps {
  title: string;
  description: string;
  details?: Record<string, unknown>;
  destructive?: boolean;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  description,
  details,
  destructive,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  // Auto-focus cancel button
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const container = document.getElementById("main-pane");

  const dialog = (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 animate-in fade-in-0 duration-150" />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-sm mx-4 bg-background border border-border rounded-lg shadow-lg p-6 animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="space-y-1.5 mb-4">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>

        {details && Object.keys(details).length > 0 && (
          <div className="bg-muted rounded-md px-4 py-3 text-xs mb-4">
            {Object.entries(details).map(([key, value]) => (
              <div key={key} className="flex justify-between py-0.5">
                <span className="text-muted-foreground">{key}</span>
                <span className="text-foreground max-w-[60%] text-right overflow-hidden text-ellipsis whitespace-nowrap">
                  {String(value ?? "")}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              buttonVariants({ size: "sm" }),
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-green-600 text-white hover:bg-green-700"
            )}
          >
            {confirmLabel ?? (destructive ? "Delete" : "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );

  // Portal into main content pane so it centers there, fallback to inline
  return container ? createPortal(dialog, container) : dialog;
}
