ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_template_invoice text,
  ADD COLUMN IF NOT EXISTS sms_template_payment text;