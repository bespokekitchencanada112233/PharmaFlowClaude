import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { BarChart3, TrendingUp, Boxes, Receipt, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/roles";

export const Route = createFileRoute("/reports")({
  component: ReportsLayout,
});

type Tab = {
  to: string;
  label: string;
  icon: typeof BarChart3;
  adminOnly?: boolean;
  exact?: boolean;
};

const TABS: Tab[] = [
  { to: "/reports", label: "Overview", icon: BarChart3, exact: true },
  { to: "/reports/sales", label: "Sales Summary", icon: Receipt },
  { to: "/reports/collections", label: "Collections", icon: Wallet },
  { to: "/reports/profitability", label: "Profitability", icon: TrendingUp, adminOnly: true },
  { to: "/reports/stock", label: "Stock", icon: Boxes },
];

function ReportsLayout() {
  const loc = useLocation();
  const { isAdmin } = useRole();
  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  const isActive = (t: Tab) =>
    t.exact ? loc.pathname === t.to : loc.pathname === t.to || loc.pathname.startsWith(t.to + "/");

  return (
    <>
      <div className="no-print sticky top-0 z-20 bg-card border-b border-border">
        <div className="px-4 sm:px-8 flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = isActive(t);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}
              >
                <t.icon className="size-4" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      <Outlet />
    </>
  );
}
