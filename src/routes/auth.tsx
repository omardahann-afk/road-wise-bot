import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AutoSageLockup, AutoSageLogo } from "@/components/brand/logo";
import { ScanSearch, ShieldCheck, Gauge } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

const HIGHLIGHTS = [
  { icon: ScanSearch, label: "AI inspection", desc: "7-step guided checkup" },
  { icon: Gauge, label: "OBD2 fluent", desc: "Decode every fault code" },
  { icon: ShieldCheck, label: "Buy with confidence", desc: "Deal verdict in seconds" },
] as const;

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Account created! You're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/`,
      });
      if (result.error) throw result.error;
      // If redirected, browser will navigate away. If tokens returned, session is set.
      if (!result.redirected) navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Ambient brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[55vh] bg-[radial-gradient(ellipse_at_top,oklch(0.34_0.14_245/0.32),transparent_65%)]"
      />
      <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 -z-0 opacity-40" />

      <header className="safe-top relative z-10 mx-auto w-full max-w-lg px-5 py-4">
        <Link to="/" className="inline-flex">
          <AutoSageLockup size="sm" />
        </Link>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pb-10 pt-2">
        {/* Hero */}
        <section className="mb-8">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
            Automotive Intelligence
          </div>
          <h1 className="text-[2.1rem] font-bold leading-[1.05] tracking-tight">
            Diagnose, inspect, and{" "}
            <span className="text-gradient">value any car</span>{" "}
            in your pocket.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            AutoSage AI turns your phone into a master mechanic — live-camera
            diagnostics, OBD2 lookup, used-car inspection and a deterministic
            BUY / NEGOTIATE / AVOID verdict.
          </p>

          <ul className="mt-6 grid grid-cols-3 gap-2">
            {HIGHLIGHTS.map((h) => {
              const Icon = h.icon;
              return (
                <li
                  key={h.label}
                  className="rounded-xl border border-border bg-gradient-card p-3 shadow-card"
                >
                  <Icon className="h-4 w-4 text-primary" strokeWidth={1.8} />
                  <p className="mt-2 text-[11px] font-semibold leading-tight">
                    {h.label}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                    {h.desc}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Auth card */}
        <section
          className="rounded-2xl border border-border bg-gradient-elevated p-6 shadow-elegant"
          aria-labelledby="auth-heading"
        >
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 id="auth-heading" className="text-lg font-bold tracking-tight">
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {mode === "signin"
                  ? "Sign in to access your garage and history."
                  : "Two seconds. No credit card."}
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-card text-primary shadow-card">
              <AutoSageLogo className="h-5 w-5" />
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="mb-4 h-11 w-full border-border bg-card font-semibold hover:bg-accent"
            onClick={onGoogle}
          >
            <GoogleMark className="mr-2 h-4 w-4" />
            Continue with Google
          </Button>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-[0.18em]">
              <span className="bg-card px-3 text-muted-foreground">or with email</span>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                className="h-11 bg-card"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder="••••••••"
                className="h-11 bg-card"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="h-11 w-full bg-gradient-to-r from-primary to-primary-glow font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.01]"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to AutoSage?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
              className="font-semibold text-primary hover:underline"
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </section>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Built for drivers · Trusted diagnostics
        </p>
      </main>
    </div>
  );
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.6 6.1 29 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.7 1.1 7.8 3l5.7-5.7C33.6 6.1 29 4 24 4 16.3 4 9.7 8.4 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5 0 9.5-1.9 12.9-5l-6-5c-2 1.4-4.4 2.2-6.9 2.2-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.5 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6 5C40.6 35 44 30 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
