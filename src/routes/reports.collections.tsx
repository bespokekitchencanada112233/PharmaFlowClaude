import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useStore, fmtRound } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { toCSV, downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/reports/collections")({
  head: () => ({
    meta: [
      { title: "Collection Report — Date & Month wise" },
      {
        name: "description",
        content:
          "Date-wise collection for any month and month-wise collection for any year, filtered by customer and area.",
      },
      { property: "og:title", content: "Collection Report — Date & Month wise" },
      {
        property: "og:description",
        content: "Date-wise and month-wise collections filtered by customer and area.",
      },
    ],
  }),
  component: CollectionReport,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function CollectionReport() {
  const { db } = useStore();
  const now = new Date();
  const [mode, setMode] = usePersistedState<"month" | "year">("rep:coll:mode", "month");
  const [year, setYear] = usePersistedState<number>("rep:coll:year", now.getFullYear());
  const [month, setMonth] = usePersistedState<number>("rep:coll:month", now.getMonth());
  const [area, setArea] = usePersistedState<string>("rep:coll:area", "all");
  const [customerId, setCustomerId] = usePersistedState<string>("rep:coll:cust", "all");

  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const c of db.customers) if (c.area) set.add(c.area);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [db.customers]);

  const custById = useMemo(() => {
    const m = new Map<string, (typeof db.customers)[number]>();
    for (const c of db.customers) m.set(c.id, c);
    return m;
  }, [db.customers]);

  const customersInArea = useMemo(
    () =>
      db.customers
        .filter((c) => area === "all" || (c.area || "") === area)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [db.customers, area],
  );

  // Collections = standalone payments + amounts paid directly on invoices
  const entries = useMemo(() => {
    const list: { customerId: string; date: string; amount: number }[] = [];
    for (const p of db.payments)
      list.push({ customerId: p.customerId, date: p.date, amount: Number(p.amount) || 0 });
    for (const i of db.invoices) {
      const paid = Number(i.paid) || 0;
      if (!paid) continue;
      list.push({ customerId: i.customerId, date: i.date, amount: paid });
    }
    return list;
  }, [db.payments, db.invoices]);

  const years = useMemo(() => {
    const set = new Set<number>([now.getFullYear()]);
    for (const p of entries) set.add(new Date(p.date).getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [entries, now]);

  const filtered = useMemo(
    () =>
      entries.filter((p) => {
        if (customerId !== "all" && p.customerId !== customerId) return false;
        if (area !== "all" && (custById.get(p.customerId)?.area || "") !== area) return false;
        return new Date(p.date).getFullYear() === year;
      }),
    [entries, customerId, area, custById, year],
  );


  const rows = useMemo(() => {
    if (mode === "year") {
      const buckets = MONTHS.map((label, i) => ({ label, amount: 0, count: 0, i }));
      for (const p of filtered) {
        const d = new Date(p.date);
        const b = buckets[d.getMonth()];
        b.amount += Number(p.amount) || 0;
        b.count++;
      }
      return buckets.map((b) => ({ label: b.label, amount: b.amount, count: b.count }));
    }
    const days = new Date(year, month + 1, 0).getDate();
    const buckets = Array.from({ length: days }, (_, i) => ({
      label: `${String(i + 1).padStart(2, "0")} ${MONTHS[month].slice(0, 3)} ${year}`,
      amount: 0,
      count: 0,
    }));
    for (const p of filtered) {
      const d = new Date(p.date);
      if (d.getMonth() !== month) continue;
      const b = buckets[d.getDate() - 1];
      b.amount += Number(p.amount) || 0;
      b.count++;
    }
    return buckets;
  }, [filtered, mode, month, year]);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);

  const customerLabel =
    customerId === "all" ? "All customers" : custById.get(customerId)?.name ?? "All customers";
  const areaLabel = area === "all" ? "All areas" : area;
  const periodLabel = mode === "year" ? `Year ${year}` : `${MONTHS[month]} ${year}`;

  function exportCSV() {
    const csv = toCSV(
      rows.map((r) => ({
        Period: r.label,
        Payments: r.count,
        Collection: Math.round(r.amount),
      })),
      ["Period", "Payments", "Collection"],
    );
    downloadCSV(`collections-${mode === "year" ? year : `${year}-${month + 1}`}.csv`, csv);
  }

  return (
    <>
      <PageHeader
        title="Collection Report"
        subtitle="Date-wise collection for a month, or month-wise for a year"
        actions={
          <>
            <Link to="/reports">
              <Button variant="outline">
                <ArrowLeft /> Reports
              </Button>
            </Link>
            <Button variant="outline" onClick={exportCSV}>
              <Download /> CSV
            </Button>
            <Button onClick={() => window.print()}>
              <Printer /> Print
            </Button>
          </>
        }
      />
      <div className="p-4 sm:p-8 space-y-4">
        <Card className="p-4 space-y-4 print:hidden">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={mode === "month" ? "default" : "outline"}
              onClick={() => setMode("month")}
            >
              Monthly (date-wise)
            </Button>
            <Button
              size="sm"
              variant={mode === "year" ? "default" : "outline"}
              onClick={() => setMode("year")}
            >
              Yearly (month-wise)
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <Label className="mb-1.5 block text-xs">Year</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            {mode === "month" && (
              <div>
                <Label className="mb-1.5 block text-xs">Month</Label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}
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

        <Card className="print-area p-4 sm:p-6 space-y-4">
          <div className="space-y-1 text-center">
            <h2 className="text-lg font-semibold">Collection Report</h2>
            <p className="text-sm text-muted-foreground">{periodLabel}</p>
            <p className="text-sm text-muted-foreground">
              {customerLabel} · {areaLabel}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="text-left py-2">{mode === "year" ? "Month" : "Date"}</th>
                  <th className="text-right py-2">Payments</th>
                  <th className="text-right py-2">Collection</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b last:border-0">
                    <td className="py-1.5">{r.label}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                      {r.count || "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-medium">
                      {r.amount ? fmtRound(r.amount) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right tabular-nums">{totalCount}</td>
                  <td className="py-2 text-right tabular-nums">{fmtRound(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
