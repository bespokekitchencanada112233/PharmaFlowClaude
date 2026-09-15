import { useCallback, useEffect, useRef, useState } from "react";

export function useResizableColumns<K extends string>(
  storageKey: string,
  defaults: Record<K, number>,
  minWidths?: Partial<Record<K, number>>,
) {
  const [widths, setWidths] = useState<Record<K, number>>(() => {
    if (typeof window === "undefined") return defaults;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...defaults, ...parsed };
      }
    } catch {
      /* ignore */
    }
    return defaults;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch {
      /* ignore */
    }
  }, [storageKey, widths]);

  const dragRef = useRef<{ key: K; startX: number; startW: number } | null>(null);

  const onMouseDown = useCallback(
    (key: K) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { key, startX: e.clientX, startW: widths[key] };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const move = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const min = minWidths?.[dragRef.current.key] ?? 40;
        const next = Math.max(min, dragRef.current.startW + (ev.clientX - dragRef.current.startX));
        setWidths((w) => ({ ...w, [dragRef.current!.key]: next }));
      };
      const up = () => {
        dragRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [widths, minWidths],
  );

  const reset = useCallback((key: K) => {
    setWidths((w) => ({ ...w, [key]: defaults[key] }));
  }, [defaults]);

  return { widths, onMouseDown, reset };
}

interface GripProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
}

export function ColResizeGrip({ onMouseDown, onDoubleClick }: GripProps) {
  return (
    <span
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-primary/40 active:bg-primary/60"
      aria-hidden="true"
    />
  );
}
