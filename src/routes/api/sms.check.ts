import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const SMS_URL = "https://api.sms-gate.app/3rdparty/v1/messages?limit=1";

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
  return { user: data.user };
}

export const Route = createFileRoute("/api/sms/check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await verifyUser(request);
        if (!auth) {
          return Response.json(
            {
              ok: false,
              status: 401,
              message: "Unauthorized",
              diagnostic: "No valid session on this request.",
            },
            { status: 401 },
          );
        }

        const username = process.env.SMS_GATEWAY_USERNAME;
        const password = process.env.SMS_GATEWAY_PASSWORD;
        if (!username || !password) {
          return Response.json({
            ok: false,
            status: 0,
            message:
              "SMS gateway credentials are not configured on the server (SMS_GATEWAY_USERNAME / SMS_GATEWAY_PASSWORD).",
            diagnostic: "Missing server-side secrets.",
          });
        }

        const basic = Buffer.from(`${username}:${password}`).toString("base64");

        let res: Response;
        try {
          res = await fetch(SMS_URL, {
            method: "GET",
            headers: { Authorization: `Basic ${basic}` },
          });
        } catch (e) {
          const err = e as Error;
          return Response.json({
            ok: false,
            status: 0,
            message: `Network error: ${err.message}`,
            diagnostic: err.message,
          });
        }

        const bodyText = await res.text();
        const snippet = bodyText.slice(0, 200);
        const diagnostic = `${res.status} ${res.statusText} — ${snippet}`;

        if (res.ok) {
          return Response.json({
            ok: true,
            status: res.status,
            message: `Connected to SMS gateway (HTTP ${res.status}).`,
            diagnostic,
          });
        }

        let message = `SMS gateway returned ${res.status} ${res.statusText}.`;
        if (res.status === 401) {
          message +=
            " Credentials don't match the Cloud server credentials shown inside the SMS Gateway Android app.";
        } else if (res.status === 404) {
          message +=
            " Endpoint not found — confirm you're using SMS Gateway Cloud (api.sms-gate.app).";
        }

        return Response.json({
          ok: false,
          status: res.status,
          message,
          diagnostic,
        });
      },
    },
  },
});
