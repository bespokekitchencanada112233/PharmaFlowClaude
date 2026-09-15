import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useStore, fmt, fmtDate } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Plus, Search, Pencil } from "lucide-react";
import { useRole, isToday } from "@/lib/roles";
import { DateRangeFilter, defaultDateRange, inRange, type DateRangeValue } from "@/components/DateRangeFilter";

export const Route = createFileRoute("/purchases/")({
  component: PurchasesList,
});

function PurchasesList() {
  const { db } = useStore();
  const { isAdmin } = useRole();
  const [q, setQ] = usePersistedState("purchases:q", "");
  const [range, setRange] = usePersistedState<DateRangeValue>("purchases:range", defaultDateRange);
  const list = useMemo(
    () =>
      db.purchases.filter(
        (p) =>
          inRange(p.date, range) &&
          (p.supplierName.toLowerCase().includes(q.toLowerCase()) ||
            String(p.number).includes(q)),
      ),
    [db.purchases, q, range],
  );
  const totalAmt = list.reduce((s, p) => s + p.total, 0);

  return (
    <>
      <PageHeader
        title="Purchases"
        subtitle={`${db.purchases.length} total`}
        actions={
          <Link to="/purchases/new">
            <Button><Plus /> New Purchase</Button>
          </Link>
        }
      />
      <div className="p-8 space-y-4">
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="flex items-center justify-between gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search supplier or #…" className="pl-9" />
          </div>
          <div className="text-sm text-muted-foreground">
            {list.length} · Total <span className="font-semibold text-foreground">{fmt(totalAmt)}</span>
          </div>
        </div>
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Purchase #</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium text-right">Paid</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No purchases.</td></tr>
              )}
              {list.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link to="/purchases/$id" params={{ id: p.id }} className="text-accent font-medium hover:underline">
                      PUR-{p.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{fmtDate(p.date)}</td>
                  <td className="px-4 py-3">{p.supplierName}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(p.total)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(p.paid)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(p.total - p.paid)}</td>
                  <td className="px-4 py-3 text-right">
                    {(isAdmin || isToday(p.date)) && (
                      <Link to="/purchases/$id/edit" params={{ id: p.id }}>
                        <Button size="icon" variant="ghost" title="Edit"><Pencil /></Button>
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
