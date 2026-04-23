import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AutoSageLogo } from "@/components/brand/logo";

export function AppHeader({ title, action }: { title?: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border glass safe-top">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-primary/40 bg-card text-primary shadow-card">
            <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/15 to-transparent" />
            <AutoSageLogo className="relative h-5 w-5" />
          </div>
          <span className="text-sm font-bold tracking-tight">
            {title ?? (
              <>
                AutoSage<span className="text-primary"> AI</span>
              </>
            )}
          </span>
        </Link>
        <div className="flex items-center gap-2">{action}</div>
      </div>
    </header>
  );
}
