import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, User, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [experience, setExperience] = useState<"beginner" | "intermediate" | "advanced">(
    "beginner",
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name,experience")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setDisplayName(data.display_name ?? "");
        setExperience((data.experience as typeof experience) ?? "beginner");
      }
      setLoading(false);
    })();
  }, [user, authLoading]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName, experience })
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    await signOut();
    navigate({ to: "/auth" });
  }

  return (
    <AppShell title="Profile">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Profile & Settings</h1>

      {!user && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <User className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">You're not signed in.</p>
            <Button asChild>
              <Link to="/auth">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {user && loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {user && !loading && (
        <>
          <Card className="mb-4">
            <CardContent className="p-4">
              <p className="text-xs uppercase text-muted-foreground">Signed in as</p>
              <p className="font-medium">{user.email}</p>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardContent className="p-4">
              <form onSubmit={save} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Display name</Label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Experience level</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["beginner", "intermediate", "advanced"] as const).map((lv) => (
                      <button
                        type="button"
                        key={lv}
                        onClick={() => setExperience(lv)}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors ${
                          experience === lv
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {lv}
                      </button>
                    ))}
                  </div>
                </div>
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Button variant="outline" onClick={onSignOut} className="w-full">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </>
      )}
    </AppShell>
  );
}
