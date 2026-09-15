import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useStore, fmt, fmtDate } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SupplierCombobox } from "@/components/SupplierCombobox";
import { Plus, Trash2 } from "lucide-react";
import { DateRangeFilter, defaultDateRange, inRange, type DateRangeValue } from "@/components/DateRangeFilter";
import { toast } from "sonner";

export const Route = createFileRoute("/supplier-payments")({
  component: SupplierPaymentsPage,
});

function SupplierPaymentsPage() {
  const { db, addSupplierPayment, deleteSupplierPayment, supplierBalance } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = usePersistedState("supplier-payments:q", "");
  const [range, setRange] = usePersistedState<DateRangeValue>("supplier-payments:range", defaultDateRange);
  const [form, setForm] = useState({
    supplierId: "", amount: "", method: "Cash",
    date: new Date().toISOString().slice(0, 10), notes: "",
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return db.supplierPayments.filter((p) => {
      if (!inRange(p.date, range)) return false;
      if (!term) return true;
      return (
        p.supplierName.toLowerCase().includes(term) ||
        (p.method ?? "").toLowerCase().includes(term)
      );
    });
  }, [db.supplierPayments, q, range]);

  const total = filtered.reduce((s, p) => s + p.amount, 0);

  const submit = () => {
    const amt = Number(form.amount);
    if (!form.supplierId) return toast.error("Pick a supplier");
    if (!amt || amt <= 0) return toast.error("Enter amount");
    addSupplierPayment({
      supplierId: form.supplierId, amount: amt,
      method: form.method || undefined,
      date: new Date(form.date).toISOString(),
      notes: form.notes || undefined,
    });
    toast.success("Payment recorded");
    setOpen(false);
    setForm({ supplierId: "", amount: "", method: "Cash", date: new Date().toISOString().slice(0, 10), notes: "" });
  };

  return (
    <>
      <PageHeader
        title="Supplier Payments"
        subtitle="Record payments made to suppliers"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus /> Record payment</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record supplier payment</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="mb-1.5 block text-xs">Supplier</Label>
                  <SupplierCombobox
                    suppliers={db.suppliers}
                    value={form.supplierId}
                    onChange={(id) => setForm({ ...form, supplierId: id })}
                    placeholder="Search supplier…"
                    getSuffix={(s) => `Owed ${fmt(supplierBalance(s.id))}`}
                  />
                  {form.supplierId && (
                    <div className="mt-1 text-xs text-muted-foreground text-right">
                      Owed:{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {fmt(supplierBalance(form.supplierId))}
                      </span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1.5 block text-xs">Amount</Label>
                    <Input type="number" min="0" step="0.01" value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs">Date</Label>
                    <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs">Method</Label>
                  <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank">Bank Transfer</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs">Notes</Label>
                  <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="p-8 space-y-4">
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="flex items-center justify-between gap-3">
          <Input placeholder="Search supplier…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
          <div className="text-sm text-muted-foreground">
            {filtered.length} · Total <span className="font-semibold text-foreground">{fmt(total)}</span>
          </div>
        </div>
        <Card className="p-0 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No payments yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary text-secondary-foreground text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Supplier</th>
                  <th className="px-4 py-2 font-medium">Method</th>
                  <th className="px-4 py-2 font-medium">Notes</th>
                  <th className="px-4 py-2 font-medium text-right">Amount</th>
                  <th className="px-4 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2 whitespace-nowrap">{fmtDate(p.date)}</td>
                    <td className="px-4 py-2">
                      <Link
                        to="/suppliers/$id/statement"
                        params={{ id: p.supplierId }}
                        className="text-primary hover:underline"
                      >
                        {p.supplierName}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{p.method ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{p.notes ?? ""}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(p.amount)}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => {
                        if (confirm("Delete this payment?")) { deleteSupplierPayment(p.id); toast.success("Deleted"); }
                      }}><Trash2 /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
