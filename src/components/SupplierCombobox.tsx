import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import type { Supplier } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  suppliers: Supplier[];
  value: string;
  onChange: (supplierId: string) => void;
  placeholder?: string;
  className?: string;
  getSuffix?: (supplier: Supplier) => string;
}

export function SupplierCombobox({
  suppliers,
  value,
  onChange,
  placeholder,
  className,
  getSuffix,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const justCommittedRef = useRef(false);
  const selected = suppliers.find((s) => s.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    bottom: number;
  } | null>(null);

  useEffect(() => {
    if (!open) setQuery(selected ? selected.name : "");
  }, [selected, open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 20);
    const tokens = q.split(/\s+/);
    return suppliers
      .filter((s) => {
        const hay = `${s.name} ${s.area ?? ""} ${s.phone ?? ""} ${s.company ?? ""}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 20);
  }, [query, suppliers]);

  useEffect(() => {
    setActive(query.trim() && matches.length > 0 ? 0 : -1);
  }, [query, matches]);

  function updateRect() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, bottom: r.bottom });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updateRect();
    const handler = () => updateRect();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open]);

  function commit(s?: Supplier) {
    const pick =
      s ??
      (active >= 0 ? matches[active] : matches[0]);
    if (!pick) return;
    justCommittedRef.current = true;
    onChange(pick.id);
    setQuery(pick.name);
    setOpen(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (active >= 0 && matches[active]) {
        e.preventDefault();
        commit();
      } else if (matches[0] && query.trim()) {
        e.preventDefault();
        commit(matches[0]);
      }
    } else if (e.key === "Tab") {
      if (matches.length > 0 && (query.trim() || active >= 0)) {
        const pick = active >= 0 ? matches[active] : matches[0];
        if (pick) commit(pick);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const DROPDOWN_MAX = 288;
  const dropUp =
    rect != null &&
    typeof window !== "undefined" &&
    window.innerHeight - rect.bottom < DROPDOWN_MAX &&
    rect.top > DROPDOWN_MAX;

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          updateRect();
          e.target.select();
        }}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false);
            if (justCommittedRef.current) {
              justCommittedRef.current = false;
              return;
            }
            const current = suppliers.find((s) => s.id === value);
            if (current && query !== current.name) setQuery(current.name);
            if (!current) setQuery("");
          }, 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? "Search supplier…"}
        autoComplete="off"
      />
      {open &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: rect.left,
              width: rect.width,
              ...(dropUp
                ? { bottom: window.innerHeight - rect.top + 4 }
                : { top: rect.bottom + 4 }),
              zIndex: 1000,
              pointerEvents: "auto",
            }}
            className="max-h-72 overflow-auto rounded-md border bg-popover shadow-md"
          >
            {matches.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No suppliers found
              </div>
            ) : (
              matches.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => {
                    // keep input focused so onBlur doesn't race the click
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    commit(s);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm flex justify-between gap-3 items-center",
                    i === active
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  <span className="truncate font-medium">{s.name}</span>
                  {(() => {
                    const suffix = getSuffix ? getSuffix(s) : s.phone ?? "";
                    return suffix ? (
                      <span
                        className={cn(
                          "shrink-0 text-xs",
                          i === active ? "opacity-80" : "text-muted-foreground",
                        )}
                      >
                        {suffix}
                      </span>
                    ) : null;
                  })()}
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
