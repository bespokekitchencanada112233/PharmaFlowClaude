import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Cloud } from "lucide-react";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

const IS_ELECTRON = import.meta.env.VITE_IS_ELECTRON === "true";
const PUBLISHED_URL =
  (import.meta.env.VITE_PUBLISHED_URL as string | undefined) ||
  "https://umarmedicine.lovable.app";

function randomState() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return Math.random().toString(36).slice(2);
}

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return toast.error("Enter email and password");
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Welcome back");
    }
  }

  async function signInGoogle() {
    setBusy(true);
    try {
      if (IS_ELECTRON && window.electronAPI?.signInWithGoogle) {
        // Desktop flow: open the published-app broker in a separate Electron
        // window, capture access/refresh tokens from the redirect, then set
        // the Supabase session on the desktop window.
        const state = randomState();
        const redirectUri = PUBLISHED_URL;
        const params = new URLSearchParams({
          provider: "google",
          redirect_uri: redirectUri,
          state,
        });
        const brokerUrl = `${PUBLISHED_URL}/~oauth/initiate?${params.toString()}`;
        const result = await window.electronAPI.signInWithGoogle(
          brokerUrl,
          redirectUri,
        );
        if (!result.ok) {
          toast.error(result.error || "Google sign-in failed");
          return;
        }
        const { error } = await supabase.auth.setSession({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        });
        if (error) {
          toast.error(error.message || "Could not start session");
          return;
        }
        toast.success("Signed in with Google");
        return;
      }

      // Web flow (unchanged)
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message || "Google sign-in failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-secondary to-background p-6">
      <Card className="w-full max-w-sm p-6 space-y-5">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center size-12 rounded-xl bg-primary/10 text-primary">
            <Cloud className="size-6" />
          </div>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Staff access only. Contact your admin for an account.
          </p>
          {typeof navigator !== "undefined" && !navigator.onLine && (
            <p className="text-xs text-warning bg-warning/10 rounded-md px-2 py-1.5">
              You appear to be offline. Login requires an internet connection.
            </p>
          )}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-xs">Email</Label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Password</Label>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : "Sign in"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={signInGoogle}
        >
          Continue with Google
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          New signups are disabled.
        </p>
      </Card>
    </div>
  );
}
