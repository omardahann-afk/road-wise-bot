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
        content: "Diagnose car issues with AI using camera diagnostics, OBD2 lookup, symptom checks, repair guides, and used-car valuation.",
      },
      { property: "og:title", content: "AutoSage AI — Your AI Mechanic" },
      {
        property: "og:description",
        content: "AI-powered car inspections, diagnostics, repair guidance, and valuation in one app.",
      },
      { property: "og:type", content: "website" },
      {
        property: "og:image",
        content: "https://storage.googleapis.com/gpt-engineer-file-uploads/qFznNXPQdhc7R5zU5PF6Mbf7FqC2/social-images/social-1776971165939-autosage.webp",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "AutoSage AI — Your AI Mechanic" },
      {
        name: "twitter:description",
        content: "Inspect cars, spot problems fast, understand repair costs, and make smarter buy-or-skip decisions.",
      },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/qFznNXPQdhc7R5zU5PF6Mbf7FqC2/social-images/social-1776971165939-autosage.webp" },
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
