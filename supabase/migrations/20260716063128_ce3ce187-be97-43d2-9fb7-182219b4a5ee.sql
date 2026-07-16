
-- 1. Application stage history
CREATE TABLE public.application_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  from_stage public.application_stage,
  to_stage public.application_stage NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.application_stage_history TO authenticated;
GRANT ALL ON public.application_stage_history TO service_role;

ALTER TABLE public.application_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own stage history"
  ON public.application_stage_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own stage history"
  ON public.application_stage_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX application_stage_history_app_idx
  ON public.application_stage_history(application_id, changed_at DESC);

-- Trigger: log every stage change (including the initial insert)
CREATE OR REPLACE FUNCTION public.log_application_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.application_stage_history (application_id, user_id, from_stage, to_stage)
    VALUES (NEW.id, NEW.user_id, NULL, NEW.stage);
  ELSIF (TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage) THEN
    INSERT INTO public.application_stage_history (application_id, user_id, from_stage, to_stage)
    VALUES (NEW.id, NEW.user_id, OLD.stage, NEW.stage);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_application_stage_change
AFTER INSERT OR UPDATE OF stage ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.log_application_stage_change();

-- Backfill: seed history for existing applications with their current stage
INSERT INTO public.application_stage_history (application_id, user_id, from_stage, to_stage, changed_at)
SELECT id, user_id, NULL, stage, created_at
FROM public.applications;

-- 2. Interviews: add Google Calendar event id
ALTER TABLE public.interviews
  ADD COLUMN google_event_id text;

-- 3. Per-user encrypted App User Connector connection keys (server-only)
CREATE TABLE public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;

-- Allow the signed-in user to check whether they have connected (existence only, no ciphertext use in browser)
CREATE POLICY "Users view own connection existence"
  ON public.app_user_connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
GRANT SELECT ON public.app_user_connections TO authenticated;

CREATE TRIGGER update_app_user_connections_updated_at
BEFORE UPDATE ON public.app_user_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
