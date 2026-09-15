ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS sms_invoice_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_payment_enabled boolean NOT NULL DEFAULT true;