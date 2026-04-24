// Loads the active vehicle's profile (year/make/model/mileage) from Supabase
// so result screens can pass real vehicle context into the knowledge layer.
import { useEffect, useState } from "react";
import { useActiveVehicleId } from "@/hooks/use-active-vehicle";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export interface ActiveVehicleProfile {
  year: number | null;
  make: string | null;
  model: string | null;
  mileage_km: number | null;
}

export function useActiveVehicleProfile(): ActiveVehicleProfile | null {
  const [activeId] = useActiveVehicleId();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ActiveVehicleProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) return setProfile(null);
      // Prefer the explicitly active vehicle; otherwise fall back to most-recent.
      const query = supabase
        .from("vehicles")
        .select("year, make, model, mileage")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1);
      const { data } = activeId
        ? await supabase
            .from("vehicles")
            .select("year, make, model, mileage")
            .eq("id", activeId)
            .maybeSingle()
        : await query.maybeSingle();
      if (cancelled) return;
      if (!data) return setProfile(null);
      setProfile({
        year: data.year ?? null,
        make: data.make ?? null,
        model: data.model ?? null,
        mileage_km: data.mileage ?? null,
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeId, user]);

  return profile;
}
