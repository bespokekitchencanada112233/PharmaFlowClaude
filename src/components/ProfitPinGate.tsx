import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Lock, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { hashPin, PIN_SESSION_KEY } from "@/lib/profit";

type Mode = "loading" | "setup" | "enter";

export function ProfitPinGate({
  children,
  onUnlock,
}: {
  children: (api: { changePin: () => void }) => React.ReactNode;
  onUnlock?: () => void;
}) {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("loading");
  const [unlocked, setUnlocked] = useState<boolean>(
    () => sessionStorage.getItem(PIN_SESSION_KEY) === "1",
  );
  const [storedHash, setStoredHash] = useState<string | null>(null);
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);

  // load hash
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("profit_pin_hash")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error("Could not load PIN settings");
        return;
      }
      const h = (data as { profit_pin_hash: string | null } | null)?.profit_pin_hash ?? null;
      setStoredHash(h);
      setMode(h ? "enter" : "setup");
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const savePin = async (pin: string) => {
    if (!user) return;
    const hash = await hashPin(pin, user.id);
    const { error } = await supabase
      .from("company_settings")
      .update({ profit_pin_hash: hash })
      .eq("user_id", user.id);
    if (error) throw error;
    setStoredHash(hash);
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin1)) {
      toast.error("PIN must be 4–6 digits");
      return;
    }
    if (pin1 !== pin2) {
      toast.error("PINs do not match");
      return;
    }
    setBusy(true);
    try {
      await savePin(pin1);
      sessionStorage.setItem(PIN_SESSION_KEY, "1");
      setUnlocked(true);
      setMode("enter");
      setPin1("");
      setPin2("");
      toast.success("PIN set. Report unlocked.");
      onUnlock?.();
    } catch {
      toast.error("Could not save PIN");
    } finally {
      setBusy(false);
    }
  };

  const handleEnter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !storedHash) return;
    setBusy(true);
    try {
      const h = await hashPin(pin1, user.id);
      if (h !== storedHash) {
        toast.error("Wrong PIN");
        setPin1("");
        return;
      }
      sessionStorage.setItem(PIN_SESSION_KEY, "1");
      setUnlocked(true);
      setPin1("");
      onUnlock?.();
    } finally {
      setBusy(false);
    }
  };

  const requestChange = () => setChanging(true);

  if (mode === "loading") {
    return (
      <div className="p-8 text-sm text-muted-foreground">Loading…</div>
    );
  }

  if (unlocked && !changing) {
    return <>{children({ changePin: requestChange })}</>;
  }

  if (changing) {
    return (
      <ChangePinForm
        userId={user?.id ?? ""}
        storedHash={storedHash}
        onDone={(newHash) => {
          setStoredHash(newHash);
          setChanging(false);
          toast.success("PIN updated");
        }}
        onCancel={() => setChanging(false)}
      />
    );
  }

  return (
    <div className="p-4 sm:p-8 grid place-items-center min-h-[60vh]">
      <Card className="p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-md bg-secondary grid place-items-center text-primary">
            <Lock className="size-4" />
          </div>
          <div>
            <h2 className="font-semibold">
              {mode === "setup" ? "Set profit PIN" : "Enter profit PIN"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {mode === "setup"
                ? "Create a 4–6 digit PIN to protect the profit report."
                : "Required to view profitability."}
            </p>
          </div>
        </div>

        <form
          onSubmit={mode === "setup" ? handleSetup : handleEnter}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="pin1">PIN</Label>
            <Input
              id="pin1"
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={pin1}
              onChange={(e) => setPin1(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          {mode === "setup" && (
            <div className="space-y-1.5">
              <Label htmlFor="pin2">Confirm PIN</Label>
              <Input
                id="pin2"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {mode === "setup" ? "Save PIN & Unlock" : "Unlock"}
          </Button>
        </form>

        {mode === "enter" && (
          <ResetPinBlock
            email={user?.email ?? ""}
            userId={user?.id ?? ""}
            onReset={(h) => {
              setStoredHash(h);
              sessionStorage.setItem(PIN_SESSION_KEY, "1");
              setUnlocked(true);
              toast.success("PIN reset. Report unlocked.");
            }}
          />
        )}
      </Card>
    </div>
  );
}

function ChangePinForm({
  userId,
  storedHash,
  onDone,
  onCancel,
}: {
  userId: string;
  storedHash: string | null;
  onDone: (newHash: string) => void;
  onCancel: () => void;
}) {
  const [cur, setCur] = useState("");
  const [n1, setN1] = useState("");
  const [n2, setN2] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (!/^\d{4,6}$/.test(n1) || n1 !== n2) {
      toast.error("New PIN must be 4–6 digits and match");
      return;
    }
    setBusy(true);
    try {
      if (storedHash) {
        const h = await hashPin(cur, userId);
        if (h !== storedHash) {
          toast.error("Current PIN is wrong");
          return;
        }
      }
      const nh = await hashPin(n1, userId);
      const { error } = await supabase
        .from("company_settings")
        .update({ profit_pin_hash: nh })
        .eq("user_id", userId);
      if (error) throw error;
      onDone(nh);
    } catch {
      toast.error("Could not update PIN");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 grid place-items-center min-h-[60vh]">
      <Card className="p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          <h2 className="font-semibold">Change profit PIN</h2>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {storedHash && (
            <div className="space-y-1.5">
              <Label>Current PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={cur}
                onChange={(e) => setCur(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>New PIN</Label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={n1}
              onChange={(e) => setN1(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm new PIN</Label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={n2}
              onChange={(e) => setN2(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} className="flex-1">
              Save
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function ResetPinBlock({
  email,
  userId,
  onReset,
}: {
  email: string;
  userId: string;
  onReset: (newHash: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [n1, setN1] = useState("");
  const [n2, setN2] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <div className="text-center">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          onClick={() => setOpen(true)}
        >
          Forgot PIN? Reset with account password
        </button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !userId) return;
    if (!/^\d{4,6}$/.test(n1) || n1 !== n2) {
      toast.error("New PIN must be 4–6 digits and match");
      return;
    }
    setBusy(true);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authErr) {
        toast.error("Account password is wrong");
        return;
      }
      const nh = await hashPin(n1, userId);
      const { error } = await supabase
        .from("company_settings")
        .update({ profit_pin_hash: nh })
        .eq("user_id", userId);
      if (error) throw error;
      onReset(nh);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border pt-3">
      <div className="text-xs text-muted-foreground">
        Confirm your account password, then set a new PIN.
      </div>
      <Input
        type="password"
        placeholder="Account password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Input
        type="password"
        inputMode="numeric"
        maxLength={6}
        placeholder="New PIN"
        value={n1}
        onChange={(e) => setN1(e.target.value.replace(/\D/g, ""))}
      />
      <Input
        type="password"
        inputMode="numeric"
        maxLength={6}
        placeholder="Confirm new PIN"
        value={n2}
        onChange={(e) => setN2(e.target.value.replace(/\D/g, ""))}
      />
      <Button type="submit" disabled={busy} className="w-full" size="sm">
        Reset PIN
      </Button>
    </form>
  );
}
