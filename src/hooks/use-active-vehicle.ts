// Lightweight active-vehicle persistence (client-only). Stores the active
// vehicle id in localStorage so the dashboard, valuation, and diagnose flows
// can prefill context. Falls back to first saved vehicle when not set.
import { useEffect, useState, useCallback } from "react";

const KEY = "autosage:active-vehicle-id";

export function useActiveVehicleId(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
      setId(v);
    } catch {
      setId(null);
    }
  }, []);

  const update = useCallback((next: string | null) => {
    setId(next);
    try {
      if (typeof window !== "undefined") {
        if (next) window.localStorage.setItem(KEY, next);
        else window.localStorage.removeItem(KEY);
      }
    } catch {
      /* ignore quota / privacy errors */
    }
  }, []);

  return [id, update];
}
