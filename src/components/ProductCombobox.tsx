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
import { Input } from "@/components/ui/input";
import { ConditionalPortal } from "@/components/ConditionalPortal";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ProductComboboxHandle {
  focus: () => void;
  clear: () => void;
}

interface Props {
  products: Product[];
  excludeIds?: string[];
  onSelect: (product: Product) => void;
  onTabAfterSelect?: () => void;
  onCancel?: () => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  initialQuery?: string;
}

export const ProductCombobox = forwardRef<ProductComboboxHandle, Props>(function ProductCombobox(
  {
    products,
    excludeIds = [],
    onSelect,
    onCancel,
    placeholder,
    className,
    autoFocus,
    initialQuery,
  },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    bottom: number;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
    clear: () => {
      setQuery("");
      setActive(-1);
    },
  }));

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = products.filter((p) => !excludeIds.includes(p.id));
    if (!q) return pool.slice(0, 8);
    return pool
      .filter(
        (p) => p.name.toLowerCase().includes(q) || (p.company ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, products, excludeIds]);

  useEffect(() => {
    setActive(query.trim() ? 0 : -1);
  }, [query]);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      inputRef.current?.select();
      setOpen(true);
      updateRect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function commit(p?: Product) {
    const pick = p ?? (active >= 0 ? matches[active] : undefined);
    if (!pick) return false;
    onSelect(pick);
    setQuery("");
    setActive(-1);
    setOpen(false);
    return true;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (active >= 0 && matches[active] && (open || query.trim())) {
        e.preventDefault();
        commit();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      onCancel?.();
    }
  }

  // Decide whether to drop above or below
  const DROPDOWN_MAX = 288; // ~max-h-72
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
        onFocus={() => {
          setOpen(true);
          updateRect();
        }}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            onCancel?.();
          }, 150)
        }
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? "Type to search products…"}
        autoComplete="off"
      />
      {open && matches.length > 0 && rect && typeof document !== "undefined" && (
        <ConditionalPortal>
          <div
            style={{
              position: "fixed",
              left: rect.left,
              width: rect.width,
              ...(dropUp
                ? { bottom: window.innerHeight - rect.top + 4 }
                : { top: rect.bottom + 4 }),
              zIndex: 1000,
            }}
            className="max-h-72 overflow-auto rounded-md border bg-popover shadow-md"
          >
            {matches.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(p);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm",
                  i === active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                )}
              >
                <span className="font-medium truncate block">{p.name}</span>
              </button>
            ))}
          </div>
        </ConditionalPortal>
      )}
    </div>
  );
});
