CREATE TABLE IF NOT EXISTS public.learning_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  vehicle_id UUID,
  step_id TEXT,
  paint_color TEXT,
  paint_tone TEXT,
  surface_visibility TEXT,
  detection_confidence NUMERIC,
  issue_detected TEXT,
  issue_confirmed_by_user BOOLEAN,
  source TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learning_events owner all"
ON public.learning_events
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS learning_events_user_created_idx
  ON public.learning_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS learning_events_paint_tone_idx
  ON public.learning_events (paint_tone);