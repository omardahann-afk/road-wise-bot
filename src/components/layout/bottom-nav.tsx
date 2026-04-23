import { Link, useLocation } from "@tanstack/react-router";
import { Camera, Wrench, History, User, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/diagnose", label: "Diagnose", icon: Camera },
  { to: "/repair", label: "Repair", icon: Wrench },
  { to: "/history", label: "History", icon: History },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const loc = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border glass safe-bottom">
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            item.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(item.to);
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_6px_var(--primary)]")} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
