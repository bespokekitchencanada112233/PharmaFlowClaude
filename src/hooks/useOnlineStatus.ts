import { useEffect, useState } from "react";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);

    // Periodic verification - navigator.onLine can lie (esp. on Wi-Fi w/o internet)
    let cancelled = false;
    const ping = async () => {
      try {
        const url = import.meta.env.VITE_SUPABASE_URL;
        if (!url) return;
        // Any HTTP response (even 401/404) means the network reached the server.
        // Only a thrown error (DNS/offline/timeout) counts as offline.
        await fetch(`${url}/auth/v1/health`, {
          method: "GET",
          cache: "no-store",
          mode: "no-cors",
          signal: AbortSignal.timeout(5000),
        });
        if (!cancelled) setOnline(true);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    const interval = setInterval(ping, 20_000);
    ping();

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}
