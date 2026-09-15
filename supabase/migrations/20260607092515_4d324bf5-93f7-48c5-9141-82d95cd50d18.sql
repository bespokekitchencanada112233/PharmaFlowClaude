
CREATE TABLE public.print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('invoice','invoice_list','test')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','printing','printed','failed','cancelled')),
  requested_by uuid,
  requested_by_name text,
  error text,
  printed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.print_jobs TO authenticated;
GRANT ALL ON public.print_jobs TO service_role;

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read print_jobs" ON public.print_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert print_jobs" ON public.print_jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "auth update print_jobs" ON public.print_jobs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete print_jobs" ON public.print_jobs FOR DELETE TO authenticated USING (true);

CREATE INDEX print_jobs_status_created_idx ON public.print_jobs (status, created_at);

CREATE TRIGGER print_jobs_touch_updated_at
  BEFORE UPDATE ON public.print_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_invoice_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
ALTER TABLE public.print_jobs REPLICA IDENTITY FULL;
