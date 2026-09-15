import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  Settings,
  Pill,
  Wallet,
  Truck,
  ShoppingCart,
  HandCoins,
  Undo2,
  UserCog,
  BarChart3,
  ScrollText,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/roles";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { PendingSyncBanner } from "@/components/PendingSyncBanner";

type NavLeaf = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

const nav: NavLeaf[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/products", label: "Products", icon: Package },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/payments", label: "Payments", icon: Wallet, adminOnly: true },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/purchases", label: "Purchases", icon: ShoppingCart },
  { to: "/supplier-payments", label: "Supplier Pay", icon: HandCoins },
  { to: "/returns", label: "Returns", icon: Undo2 },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/audit-log", label: "Audit Log", icon: ScrollText, adminOnly: true },
  { to: "/users", label: "Users", icon: UserCog, adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

function SidebarContent({
  onNavigate,
  collapsed,
  onToggleCollapsed,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const loc = useLocation();
  const { isAdmin } = useRole();

  const visible = nav.filter((n) => !n.adminOnly || isAdmin);

  const isPathActive = (to: string) =>
    to === "/"
      ? loc.pathname === "/"
      : loc.pathname === to || loc.pathname.startsWith(to + "/");

  // Best-match length across all leaf paths to dedupe overlapping prefixes
  const bestLen = visible
    .map((n) => n.to)
    .filter((p) => isPathActive(p))
    .reduce((m, p) => Math.max(m, p.length), 0);

  const leafActive = (to: string) => isPathActive(to) && to.length === bestLen;

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          "py-5 flex items-center gap-2 border-b border-sidebar-border",
          collapsed ? "px-2 justify-center" : "px-5",
        )}
      >
        <div className="size-9 rounded-md bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center shrink-0">
          <Pill className="size-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">Umar Medicine</div>
            <div className="text-[11px] text-sidebar-foreground/60">ERP Lite</div>
          </div>
        )}
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {visible.map((n) => {
          const active = leafActive(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              title={collapsed ? n.label : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                collapsed && "justify-center px-2",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <n.icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{n.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div
        className={cn(
          "p-3 border-t border-sidebar-border flex items-center gap-2",
          collapsed ? "flex-col" : "justify-between",
        )}
      >
        {!collapsed && (
          <span className="text-[11px] text-sidebar-foreground/50">v1 · local data</span>
        )}
        <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
          <ThemeToggle />
          {onToggleCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapsed}
              className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground size-8"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar:collapsed") === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sidebar:collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "no-print hidden md:flex shrink-0 border-r border-sidebar-border sticky top-0 h-screen transition-[width] duration-200",
          collapsed ? "w-14" : "w-60",
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
        />
      </aside>

      {/* Mobile top bar */}
      <div className="no-print md:hidden fixed top-0 inset-x-0 z-40 flex items-center gap-2 h-12 px-3 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border">
            <SidebarContent onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center">
            <Pill className="size-4" />
          </div>
          <div className="text-sm font-semibold">Umar Medicine</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ConnectionStatus />
          <ThemeToggle />
        </div>
      </div>

      <main className="flex-1 min-w-0 pt-12 md:pt-0">
        <PendingSyncBanner />
        <div className="hidden md:flex items-center justify-end gap-2 px-4 py-1.5 border-b border-border bg-card">
          <ConnectionStatus />
        </div>
        <Outlet />
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border bg-card px-4 sm:px-8 py-4 sm:py-5">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}
