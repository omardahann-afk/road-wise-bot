import type { ReactNode } from "react";
import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";

export function AppShell({
  children,
  title,
  headerAction,
  hideNav,
  showBack,
}: {
  children: ReactNode;
  title?: string;
  headerAction?: ReactNode;
  hideNav?: boolean;
  showBack?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader title={title} action={headerAction} showBack={showBack} />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-4">{children}</main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
