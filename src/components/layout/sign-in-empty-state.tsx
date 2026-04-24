import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogIn, ArrowRight, ShieldCheck } from "lucide-react";

/**
 * Polished empty state shown when an unauthenticated user lands on a page
 * that needs an account to persist data (History, Saved Vehicles, etc.).
 */
export function SignInEmptyState({
  context,
  continueTo = "/",
}: {
  context: string;
  continueTo?: "/" | "/diagnose" | "/cleaning" | "/inspection";
}) {
  return (
    <Card className="border-primary/20 bg-gradient-card">
      <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Sign in to save your data
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to save {context}.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1">
            <Link to="/auth">
              <LogIn className="h-4 w-4" /> Sign in
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link to={continueTo}>
              Continue without saving <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
