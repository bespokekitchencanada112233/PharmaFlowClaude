import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useStore, fmt, fmtDate } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import {
  Wallet,
  Package,
  AlertTriangle,
  Plus,
  Boxes,
  HandCoins,
  Eye,
  EyeOff,
  MapPin,
  CalendarIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRole } from "@/lib/roles";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";

type RangeKey = "today" | "week" | "month" | "custom";

type Search = {
  range: RangeKey;
  from?: string;
  to?: string;
};

export const Route = createFileRoute("/")({
  validateSearch: (raw: Record<string, unknown>): Search => {
    const r = raw.range;
    const range: RangeKey =
      r === "week" || r === "month" || r === "custom" || r === "today"
        ? r
        : "today";
    const from = typeof raw.from === "string" ? raw.from : undefined;
    const to = typeof raw.to === "string" ? raw.to : undefined;
    return { range, from, to };
  },
  component: Dashboard,
});

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function computeRange(s: Search): { from: Date; to: Date; label: string } {
  const now = new Date();
  if (s.range === "today") {
    return { from: startOfDay(now), to: endOfDay(now), label: "today" };
  }
  if (s.range === "week") {
    const day = now.getDay(); // 0 = Sun
    const diff = (day + 6) % 7; // start Monday
    const start = startOfDay(new Date(now));
    start.setDate(start.getDate() - diff);
    return { from: start, to: endOfDay(now), label: "this week" };
  }
  if (s.range === "month") {
    const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    return { from: start, to: endOfDay(now), label: "this month" };
  }
  const from = s.from ? startOfDay(new Date(s.from)) : startOfDay(now);
  const to = s.to ? endOfDay(new Date(s.to)) : endOfDay(now);
  return { from, to, label: "custom" };
}

function Dashboard() {
  const { db, customerBalance } = useStore();
  const { isAdmin, loading: roleLoading } = useRole();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const [showProducts, setShowProducts] = useState(true);
  const mask = "••••••";

  const { from, to, label } = useMemo(() => computeRange(search), [search]);

  const setRange = (range: RangeKey) =>
    navigate({ search: { range } as Search });

  const customerArea = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of db.customers) m.set(c.id, c.area?.trim() || "Unassigned");
    return m;
  }, [db.customers]);

  // In-range invoices & payments
  const inRange = (iso: string) => {
    const t = +new Date(iso);
    return t >= +from && t <= +to;
  };

  const rangedInvoices = db.invoices.filter((i) => inRange(i.date));
  const rangedPayments = db.payments.filter((p) => inRange(p.date));

  const rangedSales = rangedInvoices.reduce((s, i) => s + i.total, 0);
  const rangedCollection =
    rangedPayments.reduce((s, p) => s + p.amount, 0) +
    rangedInvoices.reduce((s, i) => s + (Number(i.paid) || 0), 0);

  const totalSales = db.invoices.reduce((s, i) => s + i.total, 0);
  const receivables = db.invoices.reduce((s, i) => s + (i.total - i.paid), 0);
  const lowStock = db.products.filter((p) => p.stock <= p.lowStockThreshold);
  const inventoryValue = db.products.reduce(
    (s, p) => s + (Number(p.stock) || 0) * (Number(p.purchasePrice) || 0),
    0,
  );

  const stats = [
    { label: `Sales (${label})`, value: fmt(rangedSales), icon: Wallet, tone: "text-accent" },
    { label: `Collection (${label})`, value: fmt(rangedCollection), icon: HandCoins, tone: "text-success" },
    { label: "Total sales", value: fmt(totalSales), icon: Wallet, tone: "text-accent" },
    { label: "Receivables", value: fmt(receivables), icon: Wallet, tone: "text-warning" },
    { label: "Inventory value", value: showProducts ? fmt(inventoryValue) : mask, icon: Boxes, tone: "text-primary" },
    { label: "Products", value: showProducts ? db.products.length.toString() : mask, icon: Package, tone: "text-primary" },
    { label: "Low stock", value: showProducts ? lowStock.length.toString() : mask, icon: AlertTriangle, tone: "text-destructive" },
  ];

  // Collection by area (range)
  const collectionByArea = useMemo(() => {
    const map = new Map<string, { amount: number; customers: Set<string> }>();
    const add = (cid: string, amount: number) => {
      if (!amount) return;
      const area = customerArea.get(cid) || "Unassigned";
      const e = map.get(area) || { amount: 0, customers: new Set<string>() };
      e.amount += amount;
      e.customers.add(cid);
      map.set(area, e);
    };
    for (const p of rangedPayments) add(p.customerId, p.amount);
    for (const i of rangedInvoices) add(i.customerId, Number(i.paid) || 0);
    return [...map.entries()]
      .map(([area, v]) => ({ area, amount: v.amount, customers: v.customers.size }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [rangedPayments, rangedInvoices, customerArea]);
  const totalCollectionAreas = collectionByArea.reduce((s, r) => s + r.amount, 0);

  // Receivables by area (full book) — uses true customer balance
  const receivablesByArea = useMemo(() => {
    const map = new Map<string, { amount: number; customers: Set<string> }>();
    for (const c of db.customers) {
      const bal = customerBalance(c.id);
      if (bal <= 0.001) continue;
      const area = (c.area || "").trim() || "Unassigned";
      const e = map.get(area) || { amount: 0, customers: new Set<string>() };
      e.amount += bal;
      e.customers.add(c.id);
      map.set(area, e);
    }
    return [...map.entries()]
      .map(([area, v]) => ({ area, amount: v.amount, customers: v.customers.size }))
      .sort((a, b) => b.amount - a.amount);
  }, [db.customers, db.invoices, db.payments, db.salesReturns, customerBalance]);
  const totalReceivablesAreas = receivablesByArea.reduce((s, r) => s + r.amount, 0);

  // Sales — last 30 days
  const sales30 = useMemo(() => {
    const days: { date: string; label: string; sales: number }[] = [];
    const today0 = startOfDay(new Date());
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today0);
      d.setDate(d.getDate() - i);
      days.push({
        date: d.toDateString(),
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        sales: 0,
      });
    }
    const idx = new Map(days.map((d, i) => [d.date, i]));
    for (const inv of db.invoices) {
      const k = new Date(inv.date).toDateString();
      const i = idx.get(k);
      if (i != null) days[i].sales += inv.total;
    }
    return days;
  }, [db.invoices]);

  // Sales vs Collection — last 6 months
  const monthly6 = useMemo(() => {
    const months: { key: string; label: string; sales: number; collection: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleString(undefined, { month: "short" }),
        sales: 0,
        collection: 0,
      });
    }
    const idx = new Map(months.map((m, i) => [m.key, i]));
    const k = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${d.getMonth()}`;
    };
    for (const inv of db.invoices) {
      const i = idx.get(k(inv.date));
      if (i != null) {
        months[i].sales += inv.total;
        months[i].collection += Number(inv.paid) || 0;
      }
    }
    for (const p of db.payments) {
      const i = idx.get(k(p.date));
      if (i != null) months[i].collection += p.amount;
    }
    return months;
  }, [db.invoices, db.payments]);

  // Collection by area — last 6 months, top 8
  const areaCollection6mo = useMemo(() => {
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    const map = new Map<string, number>();
    for (const p of db.payments) {
      if (+new Date(p.date) < +since) continue;
      const a = customerArea.get(p.customerId) || "Unassigned";
      map.set(a, (map.get(a) || 0) + p.amount);
    }
    for (const inv of db.invoices) {
      if (+new Date(inv.date) < +since) continue;
      const paid = Number(inv.paid) || 0;
      if (!paid) continue;
      const a = customerArea.get(inv.customerId) || "Unassigned";
      map.set(a, (map.get(a) || 0) + paid);
    }
    return [...map.entries()]
      .map(([area, amount]) => ({ area, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [db.payments, db.invoices, customerArea]);

  if (roleLoading) return null;
  if (!isAdmin) return <Navigate to="/invoices" />;

  const chartCfg = {
    sales: { label: "Sales", color: "hsl(var(--primary))" },
    collection: { label: "Collection", color: "hsl(var(--success))" },
    amount: { label: "Amount", color: "hsl(var(--accent))" },
  } satisfies ChartConfig;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back · ${fmtDate(new Date())}`}
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            <RangeFilter search={search} onChange={setRange} onCustom={(f, t) =>
              navigate({ search: { range: "custom", from: f, to: t } as Search })
            } />
            <Button
              variant="outline"
              onClick={() => setShowProducts((v) => !v)}
              title={showProducts ? "Hide product info" : "Show product info"}
            >
              {showProducts ? <EyeOff /> : <Eye />}
              {showProducts ? "Hide Products" : "Show Products"}
            </Button>
            <Link to="/invoices/new">
              <Button>
                <Plus /> New Invoice
              </Button>
            </Link>
          </div>
        }
      />
      <div className="p-8 space-y-8">
        {/* KPI grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {stats.map((s) => (
            <Card key={s.label} className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">
                    {s.label}
                  </div>
                  <div className="text-2xl font-semibold mt-1">{s.value}</div>
                </div>
                <div className={`size-10 rounded-md bg-secondary grid place-items-center ${s.tone}`}>
                  <s.icon className="size-5" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Collection by area */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <HandCoins className="size-4 text-success" /> Collection by area
              <span className="text-sm font-normal text-muted-foreground">({label})</span>
            </h2>
            <span className="text-sm text-muted-foreground">
              Total {fmt(totalCollectionAreas)}
            </span>
          </div>
          {collectionByArea.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">No collections in this range.</Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {collectionByArea.map((r) => {
                const pct = totalCollectionAreas
                  ? Math.round((r.amount / totalCollectionAreas) * 100)
                  : 0;
                return (
                  <Card key={r.area} className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <MapPin className="size-4 text-muted-foreground" />
                        {r.area}
                      </div>
                      <span className="text-xs text-muted-foreground">{pct}%</span>
                    </div>
                    <div className="text-2xl font-semibold text-success">{fmt(r.amount)}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.customers} customer{r.customers === 1 ? "" : "s"}
                    </div>
                    <div className="h-1.5 bg-secondary rounded overflow-hidden">
                      <div className="h-full bg-success" style={{ width: `${pct}%` }} />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Receivables by area */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" /> Receivables by area
              <span className="text-sm font-normal text-muted-foreground">(all time)</span>
            </h2>
            <span className="text-sm text-muted-foreground">
              Total {fmt(totalReceivablesAreas)}
            </span>
          </div>
          {receivablesByArea.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">No outstanding balances.</Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {receivablesByArea.map((r) => {
                const pct = totalReceivablesAreas
                  ? Math.round((r.amount / totalReceivablesAreas) * 100)
                  : 0;
                return (
                  <Card key={r.area} className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <MapPin className="size-4 text-muted-foreground" />
                        {r.area}
                      </div>
                      <span className="text-xs text-muted-foreground">{pct}%</span>
                    </div>
                    <div className="text-2xl font-semibold text-warning">{fmt(r.amount)}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.customers} customer{r.customers === 1 ? "" : "s"}
                    </div>
                    <div className="h-1.5 bg-secondary rounded overflow-hidden">
                      <div className="h-full bg-warning" style={{ width: `${pct}%` }} />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <h2 className="font-semibold mb-4">Sales — last 30 days</h2>
            {sales30.every((d) => d.sales === 0) ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <ChartContainer config={chartCfg} className="h-64 w-full">
                <ResponsiveContainer>
                  <AreaChart data={sales30}>
                    <defs>
                      <linearGradient id="salesG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-sales)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--color-sales)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={Math.floor(sales30.length / 8)} />
                    <YAxis tick={{ fontSize: 11 }} width={60} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="sales" stroke="var(--color-sales)" fill="url(#salesG)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold mb-4">Collection by area — last 6 months</h2>
            {areaCollection6mo.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <ChartContainer config={chartCfg} className="h-64 w-full">
                <ResponsiveContainer>
                  <BarChart data={areaCollection6mo} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="area" tick={{ fontSize: 11 }} width={90} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="amount" fill="var(--color-amount)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </Card>
        </div>

        {/* Sales vs Collection full width */}
        <Card className="p-5">
          <h2 className="font-semibold mb-4">Sales vs Collection — last 6 months</h2>
          {monthly6.every((m) => m.sales === 0 && m.collection === 0) ? (
            <p className="text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <ChartContainer config={chartCfg} className="h-72 w-full">
              <ResponsiveContainer>
                <BarChart data={monthly6}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={60} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="sales" fill="var(--color-sales)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collection" fill="var(--color-collection)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </Card>
      </div>
    </>
  );
}

function RangeFilter({
  search,
  onChange,
  onCustom,
}: {
  search: Search;
  onChange: (r: RangeKey) => void;
  onCustom: (from: string, to: string) => void;
}) {
  const options: { key: RangeKey; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
  ];
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<Date | undefined>(
    search.from ? new Date(search.from) : undefined,
  );
  const [to, setTo] = useState<Date | undefined>(
    search.to ? new Date(search.to) : undefined,
  );

  return (
    <div className="inline-flex rounded-md border border-border bg-card overflow-hidden">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "px-3 py-1.5 text-sm transition-colors",
            search.range === o.key
              ? "bg-primary text-primary-foreground"
              : "hover:bg-secondary",
          )}
        >
          {o.label}
        </button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "px-3 py-1.5 text-sm transition-colors inline-flex items-center gap-1.5 border-l border-border",
              search.range === "custom"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-secondary",
            )}
          >
            <CalendarIcon className="size-3.5" />
            {search.range === "custom" && search.from && search.to
              ? `${search.from} → ${search.to}`
              : "Custom"}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3 space-y-3" align="end">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">From</div>
              <Calendar mode="single" selected={from} onSelect={setFrom} className="p-0 pointer-events-auto" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">To</div>
              <Calendar mode="single" selected={to} onSelect={setTo} className="p-0 pointer-events-auto" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!from || !to}
              onClick={() => {
                if (from && to) {
                  onCustom(from.toISOString(), to.toISOString());
                  setOpen(false);
                }
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
