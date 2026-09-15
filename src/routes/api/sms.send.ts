import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { normalizePhone } from "@/lib/whatsapp";

const bodySchema = z.object({
  phone: z.string().min(4).max(32),
  message: z.string().min(1).max(1600),
});

const SMS_URL = "https://api.sms-gate.app/3rdparty/v1/messages";

async function verifyUser(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const supa = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, supa, token };
}

export const Route = createFileRoute("/api/sms/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await verifyUser(request);
        if (!auth) {
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
        }
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
            { status: 400 },
          );
        }

        // Load default country code from company_settings (user-scoped)
        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const supaAsUser = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
          global: { headers: { Authorization: `Bearer ${auth.token}` } },
        });
        const { data: settings } = await supaAsUser
          .from("company_settings")
          .select("default_country_code")
          .eq("user_id", auth.user.id)
          .maybeSingle();
        const cc = (settings?.default_country_code as string | undefined) || "+92";

        const intl = normalizePhone(parsed.data.phone, cc);
        if (!intl) {
          return Response.json({ ok: false, error: "Invalid phone number" }, { status: 400 });
        }

        const username = process.env.SMS_GATEWAY_USERNAME;
        const password = process.env.SMS_GATEWAY_PASSWORD;
        if (!username || !password) {
          return Response.json(
            { ok: false, error: "SMS gateway credentials are not configured on the server." },
            { status: 500 },
          );
        }
        const basic = Buffer.from(`${username}:${password}`).toString("base64");

        let res: Response;
        try {
          res = await fetch(SMS_URL, {
            method: "POST",
            headers: {
              Authorization: `Basic ${basic}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              textMessage: { text: parsed.data.message },
              phoneNumbers: [intl],
            }),
          });
        } catch (e) {
          console.error("[sms.send] network error", e);
          return Response.json(
            { ok: false, error: `Network error contacting SMS gateway: ${(e as Error).message}` },
            { status: 502 },
          );
        }

        const rawText = await res.text();
        if (!res.ok) {
          console.error(
            `[sms.send] gateway ${res.status} ${res.statusText}: ${rawText.slice(0, 200)}`,
          );
          let hint = "";
          if (res.status === 401) {
            hint =
              " — credentials don't match the Cloud server credentials in the SMS Gateway app.";
          } else if (res.status === 404) {
            hint =
              " — endpoint not found. Confirm the account uses SMS Gateway Cloud (api.sms-gate.app).";
          }
          return Response.json(
            {
              ok: false,
              error: `SMS gateway error ${res.status} ${res.statusText}${hint}`,
            },
            { status: 502 },
          );
        }

        let json: unknown = null;
        try {
          json = JSON.parse(rawText);
        } catch {
          // ignore — gateway returned non-JSON on success (unlikely)
        }
        const id =
          (json && typeof json === "object" && "id" in json
            ? String((json as { id: unknown }).id ?? "")
            : "") || null;
        return Response.json({ ok: true, id });
      },
    },
  },
});
