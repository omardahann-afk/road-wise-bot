import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Sparkles } from "lucide-react";

export function StubScreen({
  title,
  description,
  bullets,
}: {
  title: string;
  description: string;
  bullets: string[];
}): ReactNode {
  return (
    <AppShell title={title}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <span className="text-sm font-semibold">Coming next</span>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            The schema and architecture for this mode is already wired up. The full UI ships in the
            next iteration.
          </p>
          <ul className="space-y-2">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
