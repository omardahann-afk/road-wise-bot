import { useState } from "react";
import { Plus, ScanEye } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Finding } from "@/lib/valuation";

const MANUAL_OPTIONS: { label: string; severity: Finding["severity"] }[] = [
  { label: "Dent (manual)", severity: "low" },
  { label: "Scratch (manual)", severity: "low" },
  { label: "Rust spot (manual)", severity: "medium" },
  { label: "Paint mismatch (manual)", severity: "low" },
];

/**
 * Rendered under the live detection chips. Lets the user mark damage the
 * camera missed — improves learning signal AND keeps the inspection honest
 * when surface visibility is low.
 */
export function ManualDamageMark({
  onMark,
  hint,
}: {
  onMark: (label: string, severity: Finding["severity"]) => void;
  hint?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3 rounded-2xl border border-dashed border-warning/40 bg-warning/5 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
          <ScanEye className="h-4 w-4" />
        </span>
        <span className="flex-1 text-xs">
          <span className="block font-bold">Did the camera miss damage?</span>
          <span className="block text-[10px] text-muted-foreground">
            {hint ?? "Tap to mark a dent, scratch, or rust spot the system didn't catch."}
          </span>
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-warning">
          {open ? "Hide" : "Mark"}
        </span>
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {MANUAL_OPTIONS.map((opt) => (
            <Button
              key={opt.label}
              size="sm"
              variant="outline"
              className="h-9 justify-start gap-1 border-warning/40 text-warning hover:bg-warning/10"
              onClick={() => onMark(opt.label, opt.severity)}
            >
              <Plus className="h-3 w-3" /> {opt.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
