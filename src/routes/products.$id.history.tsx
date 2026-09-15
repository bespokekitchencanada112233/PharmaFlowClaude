import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, fmt, fmtDate } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/products/$id/history")({
  component: ProductHistory,
});

function ProductHistory() {
  const { id } = useParams({ from: "/products/$id/history" });
  const { db } = useStore();
  const product = db.products.find((p) => p.id === id);

  const rows = useMemo(() => {
    type Row = {
      date: string;
      type: "Sale" | "Purchase" | "Sales Return" | "Purchase Return";
      docNo: string;
      party: string;
      qty: number;
      price: number;
      docId: string;
      docLink?: string;
    };
    const out: Row[] = [];
    for (const inv of db.invoices) {
      for (const it of inv.items) {
        if (it.productId === id)
          out.push({
            date: inv.date, type: "Sale", docNo: `INV-${inv.number}`,
            party: inv.customerName, qty: it.qty, price: it.price, docId: inv.id,
          });
      }
    }
    for (const p of db.purchases) {
      for (const it of p.items) {
        if (it.productId === id)
          out.push({
            date: p.date, type: "Purchase", docNo: `PUR-${p.number}`,
            party: p.supplierName, qty: it.qty, price: it.price, docId: p.id,
          });
      }
    }
    for (const r of db.salesReturns) {
      for (const it of r.items) {
        if (it.productId === id)
          out.push({
            date: r.date, type: "Sales Return", docNo: "Return",
            party: r.customerName, qty: it.qty, price: it.price, docId: r.id,
          });
      }
    }
    for (const r of db.purchaseReturns) {
      for (const it of r.items) {
        if (it.productId === id)
          out.push({
            date: r.date, type: "Purchase Return", docNo: "Return",
            party: r.supplierName, qty: it.qty, price: it.price, docId: r.id,
          });
      }
    }
    return out.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [db, id]);

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [partyQuery, setPartyQuery] = useState("");

  const filteredRows = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (q && !r.party.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, typeFilter, partyQuery]);

  const totals = filteredRows.reduce(
    (acc, r) => {
      if (r.type === "Sale") acc.sold += r.qty;
      else if (r.type === "Purchase") acc.purchased += r.qty;
      else if (r.type === "Sales Return") acc.salesReturned += r.qty;
      else acc.purchaseReturned += r.qty;
      return acc;
    },
    { sold: 0, purchased: 0, salesReturned: 0, purchaseReturned: 0 },
  );

  const partySuggestions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.party))).sort(),
    [rows],
  );

  if (!product) {
    return (
      <>
        <PageHeader title="Item history" />
        <div className="p-8">Product not found.</div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={`Item history · current stock ${product.stock}`}
        actions={
          <Link to="/products">
            <Button variant="outline">
              <ArrowLeft /> Back
            </Button>
          </Link>
        }
      />
      <div className="p-8 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Sold</div>
            <div className="text-xl font-semibold">{totals.sold}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Purchased</div>
            <div className="text-xl font-semibold">{totals.purchased}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Sales returned</div>
            <div className="text-xl font-semibold">{totals.salesReturned}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Purchase returned</div>
            <div className="text-xl font-semibold">{totals.purchaseReturned}</div>
          </Card>
        </div>

        <Card className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by customer / supplier name…"
                value={partyQuery}
                onChange={(e) => setPartyQuery(e.target.value)}
                list="party-suggestions"
              />
              <datalist id="party-suggestions">
                {partySuggestions.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="Sale">Sales</SelectItem>
                <SelectItem value="Purchase">Purchases</SelectItem>
                <SelectItem value="Sales Return">Sales Returns</SelectItem>
                <SelectItem value="Purchase Return">Purchase Returns</SelectItem>
              </SelectContent>
            </Select>
            {(partyQuery || typeFilter !== "all") && (
              <Button
                variant="outline"
                onClick={() => {
                  setPartyQuery("");
                  setTypeFilter("all");
                }}
              >
                Clear
              </Button>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Showing {filteredRows.length} of {rows.length} entries
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Doc</th>
                <th className="px-4 py-3 font-medium">Party</th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No movement yet.
                  </td>
                </tr>
              )}
              {filteredRows.map((r, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/50">
                  <td className="px-4 py-3">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3">{r.type}</td>
                  <td className="px-4 py-3">
                    {r.type === "Sale" ? (
                      <Link to="/invoices/$id" params={{ id: r.docId }} className="text-accent hover:underline">
                        {r.docNo}
                      </Link>
                    ) : r.type === "Purchase" ? (
                      <Link to="/purchases/$id" params={{ id: r.docId }} className="text-accent hover:underline">
                        {r.docNo}
                      </Link>
                    ) : (
                      r.docNo
                    )}
                  </td>
                  <td className="px-4 py-3">{r.party}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.qty}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(r.price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(r.qty * r.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
