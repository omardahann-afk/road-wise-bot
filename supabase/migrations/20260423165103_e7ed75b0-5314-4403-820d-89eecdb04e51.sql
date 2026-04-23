
-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.app_role AS ENUM ('admin', 'mechanic', 'user');
CREATE TYPE public.experience_level AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE public.diagnostic_mode AS ENUM ('camera', 'obd2', 'symptom', 'inspection');
CREATE TYPE public.severity_level AS ENUM ('info', 'low', 'medium', 'high', 'critical');
CREATE TYPE public.session_kind AS ENUM ('camera', 'repair', 'cleaning', 'inspection', 'beginner', 'valuation');

-- =========================
-- TIMESTAMP TRIGGER FUNCTION
-- =========================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  locale TEXT DEFAULT 'en',
  units TEXT DEFAULT 'imperial',
  experience experience_level DEFAULT 'beginner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

-- =========================
-- USER ROLES (separate table — never on profiles)
-- =========================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Trigger on auth.users (after roles function exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- VEHICLES
-- =========================
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT,
  year INT,
  make TEXT,
  model TEXT,
  trim TEXT,
  vin TEXT,
  mileage INT,
  fuel_type TEXT,
  transmission TEXT,
  image_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicles owner all" ON public.vehicles FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE TRIGGER trg_vehicles_updated BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_vehicles_user ON public.vehicles(user_id);

-- =========================
-- DIAGNOSTICS
-- =========================
CREATE TABLE public.diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  mode diagnostic_mode NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_output JSONB,
  severity severity_level,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.diagnostics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diagnostics owner all" ON public.diagnostics FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE TRIGGER trg_diagnostics_updated BEFORE UPDATE ON public.diagnostics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_diagnostics_user_created ON public.diagnostics(user_id, created_at DESC);

-- =========================
-- SESSIONS (generic activity log)
-- =========================
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  kind session_kind NOT NULL,
  title TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions owner all" ON public.sessions FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_sessions_user_kind ON public.sessions(user_id, kind, created_at DESC);

-- =========================
-- REPAIR GUIDES (generated, per user)
-- =========================
CREATE TABLE public.repair_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  diagnostic_id UUID REFERENCES public.diagnostics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  tools JSONB DEFAULT '[]'::jsonb,
  parts JSONB DEFAULT '[]'::jsonb,
  warnings JSONB DEFAULT '[]'::jsonb,
  estimated_cost JSONB,
  difficulty TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.repair_guides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "repair_guides owner all" ON public.repair_guides FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE TRIGGER trg_repair_guides_updated BEFORE UPDATE ON public.repair_guides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- REPAIR TEMPLATES (static / curated)
-- =========================
CREATE TABLE public.repair_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  tools JSONB DEFAULT '[]'::jsonb,
  warnings JSONB DEFAULT '[]'::jsonb,
  difficulty TEXT,
  estimated_cost JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.repair_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "repair_templates readable by all" ON public.repair_templates FOR SELECT USING (true);
CREATE POLICY "repair_templates admin write" ON public.repair_templates FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_repair_templates_updated BEFORE UPDATE ON public.repair_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- KNOWLEDGE SOURCES (OBD2 codes, parts, etc.)
-- =========================
CREATE TABLE public.knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,           -- 'obd2', 'part', 'symptom', etc.
  key TEXT NOT NULL,                   -- e.g. 'P0301'
  title TEXT NOT NULL,
  body JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, key)
);
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge readable by all" ON public.knowledge_sources FOR SELECT USING (true);
CREATE POLICY "knowledge admin write" ON public.knowledge_sources FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_knowledge_updated BEFORE UPDATE ON public.knowledge_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_knowledge_type_key ON public.knowledge_sources(source_type, key);

-- =========================
-- UNIVERSAL TASK TEMPLATES
-- =========================
CREATE TABLE public.universal_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,             -- cleaning, led, maintenance, interior_fix, exterior_detail
  title TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  tools JSONB DEFAULT '[]'::jsonb,
  warnings JSONB DEFAULT '[]'::jsonb,
  difficulty TEXT,
  duration_minutes INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.universal_task_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_templates readable by all" ON public.universal_task_templates FOR SELECT USING (true);
CREATE POLICY "task_templates admin write" ON public.universal_task_templates FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_task_templates_updated BEFORE UPDATE ON public.universal_task_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- PRODUCT RECOMMENDATION TEMPLATES
-- =========================
CREATE TABLE public.product_recommendation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_slug TEXT NOT NULL,
  product_name TEXT NOT NULL,
  description TEXT,
  url TEXT,
  price_estimate NUMERIC,
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.product_recommendation_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products readable by all" ON public.product_recommendation_templates FOR SELECT USING (true);
CREATE POLICY "products admin write" ON public.product_recommendation_templates FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_products_task ON public.product_recommendation_templates(task_slug);

-- =========================
-- INSPECTIONS
-- =========================
CREATE TABLE public.inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  asking_price NUMERIC,
  scores JSONB DEFAULT '{}'::jsonb,        -- {exterior, interior, engine, tires, overall}
  findings JSONB DEFAULT '[]'::jsonb,
  recommendation TEXT,                      -- BUY / NEGOTIATE / AVOID
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inspections owner all" ON public.inspections FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE TRIGGER trg_inspections_updated BEFORE UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- VALUATION REPORTS
-- =========================
CREATE TABLE public.valuation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inspection_id UUID REFERENCES public.inspections(id) ON DELETE SET NULL,
  vehicle_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  base_price NUMERIC,
  fair_value_low NUMERIC,
  fair_value_avg NUMERIC,
  fair_value_high NUMERIC,
  asking_price NUMERIC,
  decision TEXT,                             -- BUY / NEGOTIATE / AVOID
  negotiation_advice TEXT,
  ai_output JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.valuation_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "valuations owner all" ON public.valuation_reports FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE TRIGGER trg_valuations_updated BEFORE UPDATE ON public.valuation_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- USAGE LIMITS
-- =========================
CREATE TABLE public.usage_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL DEFAULT (date_trunc('month', now())::date),
  ai_requests INT NOT NULL DEFAULT 0,
  camera_minutes INT NOT NULL DEFAULT 0,
  diagnostics_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_start)
);
ALTER TABLE public.usage_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage owner read" ON public.usage_limits FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "usage owner write" ON public.usage_limits FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE TRIGGER trg_usage_updated BEFORE UPDATE ON public.usage_limits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
