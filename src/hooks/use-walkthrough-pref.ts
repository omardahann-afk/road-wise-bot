// Persists "don't show inspection walkthrough again" preference.
import { useEffect, useState, useCallback } from "react";

const KEY = "autosage:show-inspection-walkthrough";

export function useWalkthroughPref(): {
  show: boolean;
  setShow: (v: boolean) => void;
} {
  const [show, setShowState] = useState<boolean>(true);

  useEffect(() => {
    try {
      const v = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
      setShowState(v === null ? true : v !== "false");
    } catch {
      setShowState(true);
    }
  }, []);

  const setShow = useCallback((v: boolean) => {
    setShowState(v);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(KEY, v ? "true" : "false");
      }
    } catch {
      /* ignore */
    }
  }, []);

  return { show, setShow };
}
