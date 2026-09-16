// Electron-only replacement for select.tsx (aliased in
// electron.vite.config.ts). See dialog.electron.tsx for the root-cause
// writeup: ReactDOM.createPortal hangs this Electron build's renderer when
// triggered by a real mouse click. Same fix -- render inline, compute
// position manually with getBoundingClientRect + CSS position:fixed
// instead of Radix's Popper/Portal-based positioning.
//
// SelectContent stays mounted at all times (hidden via CSS when closed,
// not unmounted) so its SelectItem children can register their
// value->label into context on mount -- that's what lets SelectValue show
// the right label even before the dropdown has ever been opened.
import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface SelectContextValue {
  value: string | undefined;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  disabled?: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  labels: Map<string, React.ReactNode>;
  registerLabel: (value: string, label: React.ReactNode) => void;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectCtx(component: string) {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error(`<${component}> must be used within <Select>`);
  return ctx;
}

function Select({
  value,
  onValueChange,
  disabled,
  children,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement>(null);
  const labelsRef = React.useRef(new Map<string, React.ReactNode>());
  // Bumped whenever a label registers, so the memo below picks up a new
  // object reference and React's context subscription actually notifies
  // consumers like SelectValue -- mutating labelsRef.current in place
  // isn't enough on its own, since useMemo would otherwise keep returning
  // the same ctxValue reference and SelectValue would never re-render.
  const [labelsVersion, setLabelsVersion] = React.useState(0);

  const registerLabel = React.useCallback((val: string, label: React.ReactNode) => {
    if (labelsRef.current.get(val) === label) return;
    labelsRef.current.set(val, label);
    setLabelsVersion((n) => n + 1);
  }, []);

  const ctxValue = React.useMemo<SelectContextValue>(
    () => ({
      value,
      onValueChange: onValueChange ?? (() => {}),
      open,
      setOpen,
      disabled,
      triggerRef,
      labels: labelsRef.current,
      registerLabel,
    }),
    [value, onValueChange, open, disabled, registerLabel, labelsVersion],
  );

  return <SelectContext.Provider value={ctxValue}>{children}</SelectContext.Provider>;
}

const SelectGroup = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value, labels } = useSelectCtx("SelectValue");
  const label = value !== undefined ? labels.get(value) : undefined;
  if (label !== undefined) return <span>{label}</span>;
  return <span className="text-muted-foreground">{placeholder}</span>;
}

const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<"button">>(
  ({ className, children, onClick, ...props }, forwardedRef) => {
    const { open, setOpen, disabled, triggerRef } = useSelectCtx("SelectTrigger");
    const setRefs = (node: HTMLButtonElement | null) => {
      (triggerRef as React.MutableRefObject<HTMLElement | null>).current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef)
        (forwardedRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
    };
    return (
      <button
        ref={setRefs}
        type="button"
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
          className,
        )}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) setOpen(!open);
        }}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
    );
  },
);
SelectTrigger.displayName = "SelectTrigger";

const SelectContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen, triggerRef } = useSelectCtx("SelectContent");
    const contentRef = React.useRef<HTMLDivElement>(null);
    const [pos, setPos] = React.useState<{ top: number; left: number; width: number } | null>(null);

    React.useLayoutEffect(() => {
      if (!open || !triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }, [open, triggerRef]);

    React.useEffect(() => {
      if (!open) return;
      const onPointerDown = (event: MouseEvent) => {
        const target = event.target as Node;
        if (contentRef.current?.contains(target)) return;
        if (triggerRef.current?.contains(target)) return;
        setOpen(false);
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") setOpen(false);
      };
      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("mousedown", onPointerDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }, [open, setOpen, triggerRef]);

    // Always mounted (so SelectItem children register their labels even
    // while closed) -- just hidden via CSS instead of unmounted.
    return (
      <div
        ref={(node) => {
          (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        style={{
          position: "fixed",
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          minWidth: pos?.width,
          display: open ? undefined : "none",
        }}
        className={cn(
          "z-50 max-h-[min(24rem,80vh)] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
SelectContent.displayName = "SelectContent";

const SelectLabel = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-2 py-1.5 text-sm font-semibold", className)} {...props} />
);
SelectLabel.displayName = "SelectLabel";

const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & { value: string }
>(({ className, children, value, onClick, ...props }, ref) => {
  const { value: selected, onValueChange, setOpen, registerLabel } = useSelectCtx("SelectItem");

  React.useEffect(() => {
    registerLabel(value, children);
  }, [value, children, registerLabel]);

  const isSelected = selected === value;

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={isSelected}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          onValueChange(value);
          setOpen(false);
        }
      }}
      {...props}
    >
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        {isSelected && <Check className="h-4 w-4" />}
      </span>
      {children}
    </div>
  );
});
SelectItem.displayName = "SelectItem";

const SelectSeparator = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
);
SelectSeparator.displayName = "SelectSeparator";

// Unused by this app (Content scrolls natively via overflow-y-auto) but
// exported to match select.tsx's surface.
const SelectScrollUpButton = () => null;
const SelectScrollDownButton = () => null;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
