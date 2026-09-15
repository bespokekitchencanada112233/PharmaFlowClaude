import { createFileRoute, Link } from "@tanstack/react-router";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useStore, fmt, fmtDateTime } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Eye, Pencil, Plus, Trash2, Search } from "lucide-react";
import { DateRangeFilter, defaultDateRange, inRange, type DateRangeValue } from "@/components/DateRangeFilter";
import { toast } from "sonner";

export const Route = createFileRoute("/returns/")({
  component: ReturnsList,
});

function ReturnsList() {
  const [range, setRange] = usePersistedState<DateRangeValue>("returns:range", defaultDateRange);
  const [q, setQ] = usePersistedState("returns:q", "");
  return (
    <>
      <PageHeader title="Returns" subtitle="Sales returns & purchase returns" />
      <div className="p-4 sm:p-8 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search customer, supplier or notes…"
              className="pl-9"
            />
          </div>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
        <Tabs defaultValue="sales">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="sales">Sales Returns (from customer)</TabsTrigger>
              <TabsTrigger value="purchase">Purchase Returns (to supplier)</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Link to="/returns/sales/new"><Button><Plus /> New Sales Return</Button></Link>
              <Link to="/returns/purchase/new"><Button variant="outline"><Plus /> New Purchase Return</Button></Link>
            </div>
          </div>
          <TabsContent value="sales" className="mt-4"><SalesReturnsTable range={range} q={q} /></TabsContent>
          <TabsContent value="purchase" className="mt-4"><PurchaseReturnsTable range={range} q={q} /></TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function SalesReturnsTable({ range, q }: { range: DateRangeValue; q: string }) {
  const { db, deleteSalesReturn } = useStore();
  const query = q.trim().toLowerCase();
  const rows = db.salesReturns.filter((r) => {
    if (!inRange(r.date, range)) return false;
    if (!query) return true;
    return (
      r.customerName.toLowerCase().includes(query) ||
      (r.notes ?? "").toLowerCase().includes(query)
    );
  });
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-secondary-foreground text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Customer</th>
            <th className="px-4 py-3 font-medium">Items</th>
            <th className="px-4 py-3 font-medium text-right">Total</th>
            <th className="px-4 py-3 w-40"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No sales returns found.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border hover:bg-muted/50">
              <td className="px-4 py-3">{fmtDateTime(r.date)}</td>
              <td className="px-4 py-3 font-medium">{r.customerName}</td>
              <td className="px-4 py-3 text-muted-foreground">{r.items.length} item(s)</td>
              <td className="px-4 py-3 text-right tabular-nums">{fmt(r.total)}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-1">
                  <Link to="/returns/sales/$id" params={{ id: r.id }}>
                    <Button size="icon" variant="ghost" title="View / Print"><Eye /></Button>
                  </Link>
                  <Link to="/returns/sales/$id/edit" params={{ id: r.id }}>
                    <Button size="icon" variant="ghost" title="Edit"><Pencil /></Button>
                  </Link>
                  <Button size="icon" variant="ghost" title="Delete" onClick={() => {
                    if (confirm("Delete this return?")) { deleteSalesReturn(r.id); toast.success("Deleted"); }
                  }}><Trash2 /></Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function PurchaseReturnsTable({ range, q }: { range: DateRangeValue; q: string }) {
  const { db, deletePurchaseReturn } = useStore();
  const query = q.trim().toLowerCase();
  const rows = db.purchaseReturns.filter((r) => {
    if (!inRange(r.date, range)) return false;
    if (!query) return true;
    return (
      r.supplierName.toLowerCase().includes(query) ||
      (r.notes ?? "").toLowerCase().includes(query)
    );
  });
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-secondary-foreground text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Supplier</th>
            <th className="px-4 py-3 font-medium">Items</th>
            <th className="px-4 py-3 font-medium text-right">Total</th>
            <th className="px-4 py-3 w-40"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No purchase returns found.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border hover:bg-muted/50">
              <td className="px-4 py-3">{fmtDateTime(r.date)}</td>
              <td className="px-4 py-3 font-medium">{r.supplierName}</td>
              <td className="px-4 py-3 text-muted-foreground">{r.items.length} item(s)</td>
              <td className="px-4 py-3 text-right tabular-nums">{fmt(r.total)}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-1">
                  <Link to="/returns/purchase/$id" params={{ id: r.id }}>
                    <Button size="icon" variant="ghost" title="View / Print"><Eye /></Button>
                  </Link>
                  <Link to="/returns/purchase/$id/edit" params={{ id: r.id }}>
                    <Button size="icon" variant="ghost" title="Edit"><Pencil /></Button>
                  </Link>
                  <Button size="icon" variant="ghost" title="Delete" onClick={() => {
                    if (confirm("Delete this return?")) { deletePurchaseReturn(r.id); toast.success("Deleted"); }
                  }}><Trash2 /></Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
