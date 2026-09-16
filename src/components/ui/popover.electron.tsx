// Electron-only replacement for popover.tsx (aliased in
// electron.vite.config.ts). See dialog.electron.tsx for the root-cause
// writeup: ReactDOM.createPortal hangs this Electron build's renderer when
// triggered by a real mouse click. Same fix -- render inline, compute
// position manually with getBoundingClientRect + CSS position:fixed
// instead of Radix's Popper/Portal-based positioning.
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

interface PopoverContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

function usePopoverCtx(component: string) {
  const ctx = React.useContext(PopoverContext);
  if (!ctx) throw new Error(`<${component}> must be used within <Popover>`);
  return ctx;
}

function Popover({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const triggerRef = React.useRef<HTMLElement>(null);
  const value = React.useMemo(() => ({ open, onOpenChange, triggerRef }), [open, onOpenChange]);
  return <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>;
}

const PopoverAnchor = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

const PopoverTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button"> & { asChild?: boolean }
>(({ asChild, onClick, children, ...props }, forwardedRef) => {
  const { open, onOpenChange, triggerRef } = usePopoverCtx("PopoverTrigger");
  const setRefs = (node: HTMLElement | null) => {
    (triggerRef as React.MutableRefObject<HTMLElement | null>).current = node;
    if (typeof forwardedRef === "function") forwardedRef(node as HTMLButtonElement | null);
    else if (forwardedRef)
      (forwardedRef as React.MutableRefObject<HTMLElement | null>).current = node;
  };
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented) onOpenChange(!open);
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
PopoverTrigger.displayName = "PopoverTrigger";

const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & {
    align?: "start" | "end" | "center";
    sideOffset?: number;
  }
>(({ className, align = "center", sideOffset = 4, children, ...props }, ref) => {
  const { open, onOpenChange, triggerRef } = usePopoverCtx("PopoverContent");
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = contentRef.current?.offsetWidth ?? 0;
    let left = rect.left;
    if (align === "end") left = rect.right - width;
    else if (align === "center") left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - width - 4));
    setPos({ top: rect.bottom + sideOffset, left });
  }, [open, align, sideOffset, triggerRef]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (contentRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange, triggerRef]);

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
        "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
