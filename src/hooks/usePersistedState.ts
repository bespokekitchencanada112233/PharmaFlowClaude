import { useEffect, useRef, useState } from "react";

/**
 * useState backed by sessionStorage. Survives back-navigation within the tab
 * so list filters (search text, date preset, customer filter, etc.) are
 * restored when the user returns from a detail page.
 *
 * Keys should be unique per page+field, e.g. "invoices:q".
 */
export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw == null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(keyRef.current, JSON.stringify(value));
    } catch {
      // ignore quota / serialization errors
    }
  }, [value]);

  return [value, setValue] as const;
}
