ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS wa_invoice_template TEXT,
  ADD COLUMN IF NOT EXISTS wa_statement_template TEXT,
  ADD COLUMN IF NOT EXISTS default_country_code TEXT NOT NULL DEFAULT '+92';