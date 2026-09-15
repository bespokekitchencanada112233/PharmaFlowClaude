import { useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type SmsKind = "invoice" | "payment";

export const SMS_DEFAULTS: Record<SmsKind, string> = {
  invoice:
    "Dear {customer}, invoice {number} dated {date}: total Rs {total}, due Rs {due}. Thank you — {company}.",
  payment:
    "Dear {customer}, we received Rs {amount} on {date}. Balance: Rs {balance}. Thank you — {company}.",
};

export const SMS_TEMPLATE_VARS = [
  "customer",
  "number",
  "date",
  "total",
  "due",
  "amount",
  "balance",
  "company",
] as const;

export function buildSmsMessage(
  kind: SmsKind,
  templates: { invoice?: string | null; payment?: string | null },
  companyName: string,
  vars: Record<string, string | number | undefined>,
): string {
  const tpl =
    (kind === "invoice" ? templates.invoice : templates.payment) ||
    SMS_DEFAULTS[kind];
  const merged: Record<string, string | number> = { company: companyName };
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined && v !== null) merged[k] = v;
  }
  return tpl.replace(/\{(\w+)\}/g, (_, k) => {
    const v = merged[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

export type SendSmsResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

export function useSendSms() {
  const [pending, setPending] = useState(false);

  const send = useCallback(
    async (
      phone: string,
      message: string,
      opts?: { silent?: boolean },
    ): Promise<SendSmsResult> => {
      setPending(true);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
          const error = "Not signed in";
          if (!opts?.silent) toast.error(error);
          return { ok: false, error };
        }
        let res: Response;
        try {
          res = await fetch("/api/sms/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ phone, message }),
          });
        } catch (e) {
          const error = `Network error: ${(e as Error).message}`;
          if (!opts?.silent) toast.error(error);
          return { ok: false, error };
        }
        let json: { ok?: boolean; id?: string | null; error?: string } = {};
        try {
          json = await res.json();
        } catch {
          // fall through
        }
        if (!res.ok || !json.ok) {
          const error = json.error || `SMS send failed (HTTP ${res.status})`;
          if (!opts?.silent) toast.error(error);
          return { ok: false, error };
        }
        return { ok: true, id: json.id ?? null };
      } finally {
        setPending(false);
      }
    },
    [],
  );

  return { send, pending };
}

export async function checkSmsConnection(): Promise<{
  ok: boolean;
  status: number;
  message: string;
  diagnostic: string;
}> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) {
    return {
      ok: false,
      status: 401,
      message: "Not signed in",
      diagnostic: "No session token",
    };
  }
  const res = await fetch("/api/sms/check", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  try {
    return await res.json();
  } catch {
    return {
      ok: false,
      status: res.status,
      message: `Unexpected response (HTTP ${res.status})`,
      diagnostic: await res.text().catch(() => ""),
    };
  }
}
