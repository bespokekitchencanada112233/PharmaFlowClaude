// Electron-only replacement for dropdown-menu.tsx (aliased in
// electron.vite.config.ts). See dialog.electron.tsx for the root-cause
// writeup: ReactDOM.createPortal hangs this Electron build's renderer when
// triggered by a real mouse click. Same fix -- render inline, compute
// position manually with getBoundingClientRect + CSS position:fixed
// instead of Radix's Popper/Portal-based positioning.
import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

function useDropdownCtx(component: string) {
  const ctx = React.useContext(DropdownMenuContext);
  if (!ctx) throw new Error(`<${component}> must be used within <DropdownMenu>`);
  return ctx;
}

function DropdownMenu({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement>(null);
  const value = React.useMemo(() => ({ open, setOpen, triggerRef }), [open]);
  return <DropdownMenuContext.Provider value={value}>{children}</DropdownMenuContext.Provider>;
}

const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button"> & { asChild?: boolean }
>(({ asChild, onClick, children, ...props }, forwardedRef) => {
  const { open, setOpen, triggerRef } = useDropdownCtx("DropdownMenuTrigger");
  const setRefs = (node: HTMLButtonElement | null) => {
    (triggerRef as React.MutableRefObject<HTMLElement | null>).current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef)
      (forwardedRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
  };
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented) setOpen(!open);
  };
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(
      children as React.ReactElement<{
        onClick?: React.MouseEventHandler;
        ref?: React.Ref<unknown>;
      }>,
      { onClick: handleClick, ref: setRefs },
    );
  }
  return (
    <button ref={setRefs} onClick={handleClick} {...props}>
      {children}
    </button>
  );
});
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & {
    align?: "start" | "end" | "center";
    sideOffset?: number;
  }
>(({ className, align = "start", sideOffset = 4, children, ...props }, ref) => {
  const { open, setOpen, triggerRef } = useDropdownCtx("DropdownMenuContent");
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = contentRef.current?.offsetWidth ?? 200;
    let left = rect.left;
    if (align === "end") left = rect.right - width;
    else if (align === "center") left = rect.left + rect.width / 2 - width / 2;
    setPos({ top: rect.bottom + sideOffset, left });
  }, [open, align, sideOffset, triggerRef]);

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

  if (!open) return null;

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
        visibility: pos ? "visible" : "hidden",
      }}
      className={cn(
        "z-50 max-h-[80vh] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});
DropdownMenuContent.displayName = "DropdownMenuContent";

const DropdownMenuItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & { inset?: boolean }
>(({ className, inset, onClick, ...props }, ref) => {
  const { setOpen } = useDropdownCtx("DropdownMenuItem");
  return (
    <div
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
        inset && "pl-8",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(false);
      }}
      {...props}
    />
  );
});
DropdownMenuItem.displayName = "DropdownMenuItem";

const DropdownMenuLabel = ({
  className,
  inset,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }) => (
  <div className={cn("px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className)} {...props} />
);
DropdownMenuLabel.displayName = "DropdownMenuLabel";

const DropdownMenuSeparator = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
);
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

const DropdownMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("ml-auto text-xs tracking-widest opacity-60", className)} {...props} />
);
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

// Unused by this app but exported to match dialog.tsx's surface, in case
// something starts importing them.
const DropdownMenuGroup = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
const DropdownMenuPortal = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
const DropdownMenuSub = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
const DropdownMenuSubContent = DropdownMenuContent;
const DropdownMenuSubTrigger = DropdownMenuItem;
const DropdownMenuRadioGroup = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
const DropdownMenuRadioItem = DropdownMenuItem;
const DropdownMenuCheckboxItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & { checked?: boolean }
>(({ className, children, checked, onClick, ...props }, ref) => {
  const { setOpen } = useDropdownCtx("DropdownMenuCheckboxItem");
  return (
    <div
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(false);
      }}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {checked && <Check className="h-4 w-4" />}
      </span>
      {children}
    </div>
  );
});
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
