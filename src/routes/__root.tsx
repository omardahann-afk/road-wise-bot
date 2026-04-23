import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#1a1f2e" },
      { title: "AutoSage AI — Your AI Mechanic" },
      {
        name: "description",
        content:
          "Diagnose car issues with AI. Live camera diagnostics, OBD2 code lookup, symptom checker, repair guides, and used-car valuation.",
      },
      { property: "og:title", content: "AutoSage AI — Your AI Mechanic" },
      {
        property: "og:description",
        content: "AI-powered diagnostics, repairs, and used-car inspection — in your pocket.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "AutoSage AI — Your AI Mechanic" },
      { name: "description", content: "**AutoSage AI — Know Before You Buy. Fix What Matters.**

AutoSage AI is your all-in-one automotive intelligence platform built to help you **inspect, diagnose," },
      { property: "og:description", content: "**AutoSage AI — Know Before You Buy. Fix What Matters.**

AutoSage AI is your all-in-one automotive intelligence platform built to help you **inspect, diagnose," },
      { name: "twitter:description", content: "**AutoSage AI — Know Before You Buy. Fix What Matters.**

AutoSage AI is your all-in-one automotive intelligence platform built to help you **inspect, diagnose," },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/91b6b232-b3b4-4546-8701-74ad7ec0ff61/id-preview-b3ffd2af--9b07d72d-6f11-45f7-b991-8e31df39d837.lovable.app-1776969919841.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/91b6b232-b3b4-4546-8701-74ad7ec0ff61/id-preview-b3ffd2af--9b07d72d-6f11-45f7-b991-8e31df39d837.lovable.app-1776969919841.png" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster richColors theme="dark" position="top-center" />
    </AuthProvider>
  );
}
