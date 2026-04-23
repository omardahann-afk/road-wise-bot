import type { ReactNode } from "react";
import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";

export function AppShell({
  children,
  title,
  headerAction,
  hideNav,
}: {
  children: ReactNode;
  title?: string;
  headerAction?: ReactNode;
  hideNav?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader title={title} action={headerAction} />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-4">{children}</main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
