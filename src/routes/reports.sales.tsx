import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useStore, fmtRound, fmtDate } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Printer } from "lucide-react";
import {
  DateRangeFilter,
  getRangeBounds,
  inRange,
  defaultDateRange,
  type DateRangeValue,
} from "@/components/DateRangeFilter";
import { usePersistedState } from "@/hooks/usePersistedState";

export const Route = createFileRoute("/reports/sales")({
  head: () => ({
    meta: [
      { title: "Sales Summary Report" },
      { name: "description", content: "Total sales amount by customer, area and date range." },
    ],
  }),
  component: SalesSummaryReport,
});

function SalesSummaryReport() {
  const { db } = useStore();
  const [range, setRange] = usePersistedState<DateRangeValue>("rep:sales:range", defaultDateRange);
  const [area, setArea] = usePersistedState<string>("rep:sales:area", "all");
  const [customerId, setCustomerId] = usePersistedState<string>("rep:sales:cust", "all");

  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const c of db.customers) if (c.area) set.add(c.area);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [db.customers]);

  const customersInArea = useMemo(
    () =>
      db.customers
        .filter((c) => area === "all" || (c.area || "") === area)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [db.customers, area],
  );

  const custById = useMemo(() => {
    const m = new Map<string, (typeof db.customers)[number]>();
    for (const c of db.customers) m.set(c.id, c);
    return m;
  }, [db.customers]);

  const result = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const inv of db.invoices) {
      if (!inRange(inv.date, range)) continue;
      if (customerId !== "all" && inv.customerId !== customerId) continue;
      if (area !== "all") {
        const c = custById.get(inv.customerId);
        if ((c?.area || "") !== area) continue;
      }
      total += Number(inv.total) || 0;
      count++;
    }
    return { total, count };
  }, [db.invoices, range, customerId, area, custById]);

  const customerLabel =
    customerId === "all"
      ? "All customers"
      : custById.get(customerId)?.name ?? "All customers";
  const areaLabel = area === "all" ? "All areas" : area;

  const { start, end } = getRangeBounds(range);
  const periodLabel =
    !start && !end
      ? "All time"
      : `${start ? fmtDate(start) : "Beginning"} – ${end ? fmtDate(end) : "Today"}`;

  return (
    <>
      <PageHeader
        title="Sales Summary"
        subtitle="Total sales amount only — filter by customer, area and date"
        actions={
          <>
            <Link to="/reports">
              <Button variant="outline">
                <ArrowLeft /> Reports
              </Button>
            </Link>
            <Button onClick={() => window.print()}>
              <Printer /> Print
            </Button>
          </>
        }
      />
      <div className="p-4 sm:p-8 space-y-4">
        <Card className="p-4 space-y-4 print:hidden">
          <div>
            <Label className="mb-1.5 block text-xs">Date range</Label>
            <DateRangeFilter value={range} onChange={setRange} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-xs">Area</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                value={area}
                onChange={(e) => {
                  setArea(e.target.value);
                  setCustomerId("all");
                }}
              >
                <option value="all">All areas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Customer</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="all">All customers</option>
                {customersInArea.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card className="p-8 text-center space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Sales Summary</h2>
            <p className="text-sm text-muted-foreground">{customerLabel}</p>
            <p className="text-sm text-muted-foreground">{areaLabel}</p>
            <p className="text-sm text-muted-foreground">{periodLabel}</p>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Total sales
            </div>
            <div className="text-4xl font-bold tabular-nums">{fmtRound(result.total)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {result.count} invoice{result.count === 1 ? "" : "s"}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
