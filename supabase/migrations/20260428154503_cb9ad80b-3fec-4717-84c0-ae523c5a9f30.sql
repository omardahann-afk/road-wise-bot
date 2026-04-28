-- V4 foundation: vehicle profiles, OBD2 lookups, symptom mappings, repair pricing, diagnosis events/feedback, recall cache.

CREATE TABLE IF NOT EXISTS public.vehicle_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vin text,
  year integer,
  make text,
  model text,
  trim text,
  engine text,
  mileage integer,
  region text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vehicle_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicle_profiles owner all" ON public.vehicle_profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_profiles_user ON public.vehicle_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_profiles_vin ON public.vehicle_profiles(vin);
CREATE TRIGGER vehicle_profiles_updated_at BEFORE UPDATE ON public.vehicle_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.obd2_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  likely_causes jsonb NOT NULL DEFAULT '[]'::jsonb,
  severity text,
  safe_to_drive text,
  estimated_cost_low numeric,
  estimated_cost_high numeric,
  next_step text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.obd2_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obd2_codes readable by all" ON public.obd2_codes FOR SELECT USING (true);
CREATE POLICY "obd2_codes admin write" ON public.obd2_codes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.symptom_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symptom text NOT NULL,
  issue text NOT NULL,
  confidence numeric,
  severity text,
  safe_to_drive text,
  estimated_cost_low numeric,
  estimated_cost_high numeric,
  next_step text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.symptom_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "symptom_mappings readable by all" ON public.symptom_mappings FOR SELECT USING (true);
CREATE POLICY "symptom_mappings admin write" ON public.symptom_mappings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.repair_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_type text NOT NULL,
  category text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year_min integer,
  vehicle_year_max integer,
  region text,
  part_cost_low numeric,
  part_cost_high numeric,
  labor_hours_low numeric,
  labor_hours_high numeric,
  labor_rate numeric,
  total_low numeric,
  total_high numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.repair_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "repair_pricing readable by all" ON public.repair_pricing FOR SELECT USING (true);
CREATE POLICY "repair_pricing admin write" ON public.repair_pricing FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_repair_pricing_type ON public.repair_pricing(repair_type);

CREATE TABLE IF NOT EXISTS public.diagnosis_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vehicle_id uuid,
  input_type text NOT NULL,
  user_input jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_used boolean NOT NULL DEFAULT false,
  fallback_used boolean NOT NULL DEFAULT false,
  predicted_issue text,
  severity text,
  safe_to_drive text,
  estimated_cost_low numeric,
  estimated_cost_high numeric,
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.diagnosis_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diagnosis_events owner all" ON public.diagnosis_events FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_diagnosis_events_user ON public.diagnosis_events(user_id);

CREATE TABLE IF NOT EXISTS public.diagnosis_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  diagnosis_id uuid,
  was_helpful boolean,
  actual_fix text,
  actual_cost numeric,
  mechanic_quote numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.diagnosis_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diagnosis_feedback owner all" ON public.diagnosis_feedback FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.recall_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vin text,
  make text,
  model text,
  year integer,
  recall_title text,
  recall_summary text,
  consequence text,
  remedy text,
  source text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.recall_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recall_cache readable by all" ON public.recall_cache FOR SELECT USING (true);
CREATE POLICY "recall_cache admin write" ON public.recall_cache FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_recall_cache_lookup ON public.recall_cache(make, model, year);
CREATE INDEX IF NOT EXISTS idx_recall_cache_vin ON public.recall_cache(vin);
