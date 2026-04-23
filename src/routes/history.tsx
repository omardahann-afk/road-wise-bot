import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { History as HistoryIcon, Camera, ScanLine, Stethoscope } from "lucide-react";
import { severityClass } from "@/lib/severity";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

interface Row {
  id: string;
  mode: "camera" | "obd2" | "symptom" | "inspection";
  summary: string | null;
  severity: string | null;
  created_at: string;
}

function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("diagnostics")
        .select("id,mode,summary,severity,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      setRows((data as Row[] | null) ?? []);
      setLoading(false);
    })();
  }, [user, authLoading]);

  return (
    <AppShell title="History">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">History</h1>
      {!user && <p className="text-sm text-muted-foreground">Sign in to view your history.</p>}
      {user && loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {user && !loading && rows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <HistoryIcon className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No diagnostics yet — try the OBD2 lookup or symptom checker.
            </p>
          </CardContent>
        </Card>
      )}
      <ul className="space-y-2">
        {rows.map((r) => {
          const Icon = r.mode === "camera" ? Camera : r.mode === "obd2" ? ScanLine : Stethoscope;
          return (
            <li
              key={r.id}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {r.mode}
                  </p>
                  {r.severity && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${severityClass(r.severity)}`}
                    >
                      {r.severity}
                    </span>
                  )}
                </div>
                <p className="text-sm">{r.summary ?? "—"}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}
