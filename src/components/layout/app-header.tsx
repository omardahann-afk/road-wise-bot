import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { AutoSageLogo } from "@/components/brand/logo";

export function AppHeader({
  title,
  action,
  showBack = true,
}: {
  title?: string;
  action?: ReactNode;
  showBack?: boolean;
}) {
  const router = useRouter();
  // Defer the back button to the client so SSR/CSR markup matches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const canGoBack =
    mounted && showBack && router.state.location.pathname !== "/";

  function handleBack() {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      window.history.back();
    } else {
      router.navigate({ to: "/" });
    }
  }


  return (
    <header className="sticky top-0 z-30 border-b border-border glass safe-top">
      <div className="mx-auto flex max-w-lg items-center gap-2 px-3 py-3">
        {canGoBack ? (
          <button
            type="button"
            onClick={handleBack}
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent active:scale-95"
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : (
          <Link
            to="/"
            className="flex shrink-0 items-center"
            aria-label="AutoSage AI home"
          >
            <AutoSageLogo className="h-9 w-9" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold tracking-tight">
            {title ?? (
              <>
                AutoSage<span className="text-primary"> AI</span>
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1">{action}</div>
      </div>
    </header>
  );
}
