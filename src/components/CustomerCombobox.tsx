import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import type { Customer } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  customers: Customer[];
  value: string;
  onChange: (customerId: string) => void;
  placeholder?: string;
  className?: string;
  getSuffix?: (customer: Customer) => string;
}

export const CustomerCombobox = forwardRef<HTMLInputElement, Props>(function CustomerCombobox({
  customers,
  value,
  onChange,
  placeholder,
  className,
  getSuffix,
}, forwardedRef) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement, []);
  const justCommittedRef = useRef(false);
  const selected = customers.find((c) => c.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    bottom: number;
  } | null>(null);

  // Keep input text in sync with the externally selected customer when closed
  useEffect(() => {
    if (!open) setQuery(selected ? selected.name : "");
  }, [selected, open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 20);
    // Google-like: split into tokens, every token must appear somewhere
    const tokens = q.split(/\s+/);
    return customers
      .filter((c) => {
        const hay = `${c.name} ${c.area ?? ""} ${c.phone ?? ""} ${c.company ?? ""}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 20);
  }, [query, customers]);

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

  function commit(c?: Customer) {
    const pick =
      c ??
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
            const current = customers.find((c) => c.id === value);
            if (current && query !== current.name) setQuery(current.name);
            if (!current) setQuery("");
          }, 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? "Search customer…"}
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
                No customers found
              </div>
            ) : (
              matches.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    commit(c);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm flex justify-between gap-3 items-center",
                    i === active
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  <span className="truncate font-medium">{c.name}</span>
                  {(() => {
                    const suffix = getSuffix ? getSuffix(c) : c.phone ?? "";
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
});
