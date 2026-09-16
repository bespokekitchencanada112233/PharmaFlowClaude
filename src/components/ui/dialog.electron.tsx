// Electron-only replacement for dialog.tsx (aliased in electron.vite.config.ts).
//
// Root cause, fully isolated: ReactDOM.createPortal(..., document.body),
// when the state update that mounts it is triggered by a REAL/trusted
// native click (reproduced with webContents.sendInputEvent -- never with a
// synthetic element.click(), which is why this was missed for a long time),
// permanently hangs this Electron/Chromium build's renderer thread. This is
// true regardless of the portaled content: reproduced down to a single
// hidden, empty <span>. A plain inline state update (no portal) on the same
// click works fine, and so does @radix-ui/react-dialog's own machinery
// (FocusScope, DismissableLayer, focus guards) when portaling is removed --
// none of those were the actual trigger, despite substantial earlier
// investigation pointing at focus() and FocusScope. See electron/main.cjs
// for the full trail.
//
// The fix: never call createPortal here. Render the overlay/content inline,
// in their normal position in the React tree, and rely on CSS
// `position: fixed` to visually escape into a full-screen overlay -- fixed
// positioning works regardless of DOM position, as long as no ancestor has
// a `transform`/`filter`/`perspective` establishing a containing block
// (none of this app's layout does).
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogCtx(component: string) {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error(`<${component}> must be used within <Dialog>`);
  return ctx;
}

function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ open, onOpenChange }), [open, onOpenChange]);
  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button"> & { asChild?: boolean }
>(({ asChild, onClick, ...props }, ref) => {
  const { onOpenChange } = useDialogCtx("DialogTrigger");
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) onOpenChange(true);
      }}
      {...props}
    />
  );
});
DialogTrigger.displayName = "DialogTrigger";

const DialogClose = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button"> & { asChild?: boolean }
>(({ asChild, onClick, ...props }, ref) => {
  const { onOpenChange } = useDialogCtx("DialogClose");
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) onOpenChange(false);
      }}
      {...props}
    />
  );
});
DialogClose.displayName = "DialogClose";

const DialogPortal = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

const DialogOverlay = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("fixed inset-0 z-50 bg-black/80", className)} {...props} />
  ),
);
DialogOverlay.displayName = "DialogOverlay";

const DialogContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, children, onClick, ...props }, ref) => {
    const { open, onOpenChange } = useDialogCtx("DialogContent");

    React.useEffect(() => {
      if (!open) return;
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") onOpenChange(false);
      };
      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    }, [open, onOpenChange]);

    if (!open) return null;

    // Rendered inline (NOT via createPortal) -- see file header. Fixed
    // positioning still makes this visually full-screen/centered.
    return (
      <>
        <DialogOverlay onClick={() => onOpenChange(false)} />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg",
            className,
          )}
          onClick={(event) => {
            onClick?.(event);
            event.stopPropagation();
          }}
          {...props}
        >
          {children}
          <button
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
      </>
    );
  },
);
DialogContent.displayName = "DialogContent";

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<"h2">>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  ),
);
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<"p">
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
