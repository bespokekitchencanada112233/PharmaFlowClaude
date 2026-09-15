-- Shared-business RLS: any authenticated user can read/write business data.
-- INSERT still requires user_id = auth.uid() so we keep an audit trail.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'customers','products','invoices','payments','last_prices',
    'suppliers','purchases','supplier_payments',
    'purchase_returns','sales_returns','company_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- drop all existing policies on the table
    EXECUTE format(
      'DO $inner$ DECLARE p record; BEGIN
         FOR p IN SELECT policyname FROM pg_policies WHERE schemaname=''public'' AND tablename=%L LOOP
           EXECUTE format(''DROP POLICY IF EXISTS %%I ON public.%I'', p.policyname);
         END LOOP;
       END $inner$;', t, t
    );

    EXECUTE format('CREATE POLICY "auth read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true);', t);
    EXECUTE format('CREATE POLICY "auth update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', t);
    EXECUTE format('CREATE POLICY "auth delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (true);', t);
    EXECUTE format('CREATE POLICY "auth insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);', t);
  END LOOP;
END $$;
