import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useStore, fmt, fmtDate } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { CustomerCombobox } from "@/components/CustomerCombobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, FileText } from "lucide-react";
import { SmsButton } from "@/components/SmsButton";
import { useAutoPaymentSms } from "@/lib/sms-auto";
import { DateRangeFilter, defaultDateRange, inRange, type DateRangeValue } from "@/components/DateRangeFilter";
import { toast } from "sonner";
import { useRole } from "@/lib/roles";

export const Route = createFileRoute("/payments")({
  component: PaymentsPage,
});

function PaymentsPage() {
  const { isAdmin, loading: roleLoading } = useRole();
  const { db, addPayment, deletePayment, customerBalance } = useStore();
  const { sendPaymentSms, sendBulkPaymentSms } = useAutoPaymentSms();
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkArea, setBulkArea] = useState("");
  const [bulkMethod, setBulkMethod] = useState("Cash");
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().slice(0, 10));
  const [bulkNotes, setBulkNotes] = useState("");
  type BulkLine = { customerId: string; name: string; balance: number; amount: string };
  const [lines, setLines] = useState<BulkLine[]>([]);
  const [pickCustomerId, setPickCustomerId] = useState("");
  const [pickAmount, setPickAmount] = useState("");
  const [q, setQ] = usePersistedState("payments:q", "");
  const [range, setRange] = usePersistedState<DateRangeValue>("payments:range", defaultDateRange);
  const [form, setForm] = useState({
    customerId: "",
    amount: "",
    method: "Cash",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
    direction: "in" as "in" | "out",
  });


  const areas = useMemo(() => {
    const s = new Set<string>();
    db.customers.forEach((c) => {
      const a = (c.area || "").trim();
      if (a) s.add(a);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [db.customers]);

  // Accounting-format helpers (integer only, comma-separated)
  const digitsOnly = (s: string) => s.replace(/\D/g, "");
  const fmtAcct = (raw: string) =>
    raw ? Number(raw).toLocaleString("en-PK") : "";

  const addedIds = useMemo(() => new Set(lines.map((l) => l.customerId)), [lines]);

  const areaCandidates = useMemo(() => {
    if (!bulkArea) return [];
    return db.customers
      .filter((c) => (c.area || "").trim() === bulkArea)
      .filter((c) => !addedIds.has(c.id))
      .filter((c) => customerBalance(c.id) > 0.001)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [db.customers, bulkArea, addedIds, customerBalance, db.invoices, db.payments, db.salesReturns]);

  const bulkSummary = useMemo(() => {
    let count = 0;
    let sum = 0;
    for (const l of lines) {
      const v = Number(l.amount);
      if (v > 0) {
        count++;
        sum += v;
      }
    }
    return { count, sum };
  }, [lines]);

  const resetBulk = () => {
    setBulkArea("");
    setLines([]);
    setPickCustomerId("");
    setPickAmount("");
    setBulkMethod("Cash");
    setBulkDate(new Date().toISOString().slice(0, 10));
    setBulkNotes("");
  };

  const pickerRef = useRef<HTMLInputElement>(null);

  const addLine = () => {
    if (!pickCustomerId) return toast.error("Pick a customer");
    const c = db.customers.find((x) => x.id === pickCustomerId);
    if (!c) return toast.error("Customer not found");
    const balance = customerBalance(c.id);
    const amt = Number(pickAmount);
    if (!amt || amt <= 0) return toast.error("Enter amount");
    if (amt > balance + 0.001) return toast.error("Amount exceeds outstanding");
    if (addedIds.has(c.id)) return toast.error("Customer already added");
    setLines((prev) => [...prev, { customerId: c.id, name: c.name, balance, amount: pickAmount }]);
    setPickCustomerId("");
    setPickAmount("");
    setTimeout(() => pickerRef.current?.focus(), 0);
  };

  const submitBulk = () => {
    if (lines.length === 0) return toast.error("Add at least one customer");
    const iso = new Date(bulkDate).toISOString();
    let total = 0;
    for (const l of lines) {
      const amt = Number(l.amount);
      if (!amt || amt <= 0) return toast.error(`Invalid amount for ${l.name}`);
      if (amt > l.balance + 0.001) return toast.error(`${l.name}: amount exceeds outstanding`);
    }
    const created: import("@/lib/types").Payment[] = [];
    for (const l of lines) {
      const amt = Number(l.amount);
      const p = addPayment({
        customerId: l.customerId,
        amount: amt,
        method: bulkMethod || undefined,
        date: iso,
        notes: bulkNotes || undefined,
      });
      created.push(p);
      total += amt;
    }
    toast.success(`Recorded ${lines.length} payments — ${fmt(total)}`);
    void sendBulkPaymentSms(created);
    setBulkOpen(false);
    resetBulk();
  };



  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return db.payments.filter((p) => {
      if (!inRange(p.date, range)) return false;
      if (!term) return true;
      return (
        p.customerName.toLowerCase().includes(term) ||
        (p.method ?? "").toLowerCase().includes(term) ||
        (p.notes ?? "").toLowerCase().includes(term)
      );
    });
  }, [db.payments, q, range]);

  const total = filtered.reduce((s, p) => s + p.amount, 0);

  const submit = () => {
    const amt = Number(form.amount);
    if (!form.customerId) return toast.error("Pick a customer");
    if (!amt || amt <= 0) return toast.error("Enter amount");
    const signed = form.direction === "out" ? -amt : amt;
    const created = addPayment({
      customerId: form.customerId,
      amount: signed,
      method: form.method || undefined,
      date: new Date(form.date).toISOString(),
      notes: form.notes || undefined,
    });
    toast.success(form.direction === "out" ? "Cash out recorded" : "Payment recorded");
    void sendPaymentSms(created);
    setOpen(false);
    setForm({
      customerId: "",
      amount: "",
      method: "Cash",
      date: new Date().toISOString().slice(0, 10),
      notes: "",
      direction: "in",
    });
  };


  if (roleLoading) return null;
  if (!isAdmin) return <Navigate to="/invoices" />;

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Record payments received from customers"
        actions={
          <div className="flex gap-2">
            <Dialog
              open={bulkOpen}
              onOpenChange={(v) => {
                setBulkOpen(v);
                if (!v) resetBulk();
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus /> Bulk by area
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Bulk payment by area</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-1.5 block text-xs">Area</Label>
                      <Select value={bulkArea} onValueChange={setBulkArea}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick area…" />
                        </SelectTrigger>
                        <SelectContent>
                          {areas.length === 0 && (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">
                              No areas configured
                            </div>
                          )}
                          {areas.map((a) => (
                            <SelectItem key={a} value={a}>
                              {a}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs">Date</Label>
                      <Input
                        type="date"
                        value={bulkDate}
                        onChange={(e) => setBulkDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-1.5 block text-xs">Method</Label>
                      <Select value={bulkMethod} onValueChange={setBulkMethod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cash">Cash</SelectItem>
                          <SelectItem value="Bank">Bank Transfer</SelectItem>
                          <SelectItem value="Cheque">Cheque</SelectItem>
                          <SelectItem value="Card">Card</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs">Notes</Label>
                      <Input
                        value={bulkNotes}
                        onChange={(e) => setBulkNotes(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  {bulkArea && (
                    <div className="space-y-3">
                      <div className="border border-border rounded-md p-3 space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">Add customer</div>
                        <div className="grid grid-cols-[1fr_140px_auto] gap-2">
                          <CustomerCombobox
                            ref={pickerRef}
                            customers={areaCandidates}
                            value={pickCustomerId}
                            onChange={(id) => setPickCustomerId(id)}
                            placeholder={
                              areaCandidates.length === 0
                                ? "No remaining customers with outstanding"
                                : "Search customer in area…"
                            }
                            getSuffix={(c) => `Bal ${fmt(customerBalance(c.id))}`}
                          />
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="Amount"
                            className="text-right tabular-nums"
                            value={fmtAcct(pickAmount)}
                            onChange={(e) => setPickAmount(digitsOnly(e.target.value))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                                if (pickCustomerId && Number(pickAmount) > 0) {
                                  e.preventDefault();
                                  addLine();
                                }
                              }
                            }}
                          />
                          <Button type="button" onClick={addLine} disabled={!pickCustomerId}>
                            <Plus /> Add
                          </Button>
                        </div>
                        {pickCustomerId && (
                          <div className="text-xs text-muted-foreground text-right">
                            Outstanding:{" "}
                            <span className="font-medium text-foreground tabular-nums">
                              {fmt(customerBalance(pickCustomerId))}
                            </span>
                          </div>
                        )}

                      </div>

                      <div className="border border-border rounded-md overflow-hidden">
                        {lines.length === 0 ? (
                          <div className="p-6 text-center text-sm text-muted-foreground">
                            No payments added yet. Pick a customer above.
                          </div>
                        ) : (
                          <table className="w-full text-sm">
                            <thead className="bg-secondary text-secondary-foreground text-left">
                              <tr>
                                <th className="px-3 py-2 font-medium">Customer</th>
                                <th className="px-3 py-2 font-medium text-right">Outstanding</th>
                                <th className="px-3 py-2 font-medium text-right w-40">Amount</th>
                                <th className="px-3 py-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {lines.map((l, idx) => (
                                <tr key={l.customerId} className="border-t border-border">
                                  <td className="px-3 py-2">{l.name}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    <button
                                      type="button"
                                      className="text-accent hover:underline"
                                      title="Fill outstanding"
                                      onClick={() =>
                                        setLines((prev) =>
                                          prev.map((x, i) =>
                                            i === idx
                                              ? { ...x, amount: String(Math.round(x.balance)) }
                                              : x,
                                          ),
                                        )
                                      }
                                    >
                                      {fmt(l.balance)}
                                    </button>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <Input
                                      type="text"
                                      inputMode="numeric"
                                      className="text-right tabular-nums"
                                      value={fmtAcct(l.amount)}
                                      onChange={(e) =>
                                        setLines((prev) =>
                                          prev.map((x, i) =>
                                            i === idx
                                              ? { ...x, amount: digitsOnly(e.target.value) }
                                              : x,
                                          ),
                                        )
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() =>
                                        setLines((prev) => prev.filter((_, i) => i !== idx))
                                      }
                                    >
                                      <Trash2 />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter className="border-t border-border pt-3">
                  <div className="mr-auto text-sm text-muted-foreground">
                    {bulkSummary.count} payment
                    {bulkSummary.count === 1 ? "" : "s"} ·{" "}
                    <span className="font-semibold text-foreground">
                      {fmt(bulkSummary.sum)}
                    </span>
                  </div>
                  <Button variant="outline" onClick={() => setBulkOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={submitBulk} disabled={bulkSummary.count === 0}>
                    Save payments
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus /> Record payment
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record payment</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="mb-1.5 block text-xs">Type</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={form.direction === "in" ? "default" : "outline"}
                        onClick={() => setForm({ ...form, direction: "in" })}
                      >
                        Received from customer
                      </Button>
                      <Button
                        type="button"
                        variant={form.direction === "out" ? "default" : "outline"}
                        onClick={() => setForm({ ...form, direction: "out", method: "Cash" })}
                      >
                        Cash given to customer
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs">Customer</Label>

                    <CustomerCombobox
                      customers={db.customers}
                      value={form.customerId}
                      onChange={(id) => setForm({ ...form, customerId: id })}
                      placeholder="Search customer…"
                      getSuffix={(c) => `Bal ${fmt(customerBalance(c.id))}`}
                    />
                    {form.customerId && (
                      <div className="mt-1 text-xs text-muted-foreground text-right">
                        Outstanding:{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          {fmt(customerBalance(form.customerId))}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-1.5 block text-xs">Amount</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        className="text-right tabular-nums"
                        value={fmtAcct(form.amount)}
                        onChange={(e) =>
                          setForm({ ...form, amount: digitsOnly(e.target.value) })
                        }
                      />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs">Date</Label>
                      <Input
                        type="date"
                        value={form.date}
                        onChange={(e) =>
                          setForm({ ...form, date: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs">Method</Label>
                    <Select
                      value={form.method}
                      onValueChange={(v) => setForm({ ...form, method: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Bank">Bank Transfer</SelectItem>
                        <SelectItem value="Cheque">Cheque</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs">Notes</Label>
                    <Input
                      value={form.notes}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value })
                      }
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={submit}>Save payment</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }

      />
      <div className="p-8 space-y-4">
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="flex items-center justify-between gap-3">
          <Input
            placeholder="Search by customer, method, notes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-sm"
          />
          <div className="text-sm text-muted-foreground">
            {filtered.length} payment{filtered.length === 1 ? "" : "s"} ·
            Total{" "}
            <span className="font-semibold text-foreground">{fmt(total)}</span>
          </div>
        </div>

        <Card className="p-0 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No payments yet. Click "Record payment" to add one.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary text-secondary-foreground text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Customer</th>
                  <th className="px-4 py-2 font-medium">Method</th>
                  <th className="px-4 py-2 font-medium">Notes</th>
                  <th className="px-4 py-2 font-medium text-right">Amount</th>
                  <th className="px-4 py-2 font-medium w-24"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2 whitespace-nowrap">
                      {fmtDate(p.date)}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        to="/customers/$id"
                        params={{ id: p.customerId }}
                        className="text-accent hover:underline"
                      >
                        {p.customerName}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      {p.amount < 0 ? (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-warning/15 text-warning font-medium">
                          Cash Out
                        </span>
                      ) : (
                        p.method ?? "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {p.notes ?? ""}
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${p.amount < 0 ? "text-warning" : ""}`}>
                      {p.amount < 0 ? `−${fmt(-p.amount)}` : fmt(p.amount)}
                    </td>

                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Link
                          to="/customers/$id/statement"
                          params={{ id: p.customerId }}
                        >
                          <Button size="icon" variant="ghost" title="Statement">
                            <FileText />
                          </Button>
                        </Link>
                        {p.amount >= 0 && (
                          <SmsButton
                            kind="payment"
                            customerId={p.customerId}
                            iconOnly
                            size="icon"
                            variant="ghost"
                            vars={{
                              customer: p.customerName,
                              amount: fmt(p.amount),
                              date: fmtDate(p.date),
                              balance: fmt(customerBalance(p.customerId)),
                            }}
                          />
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Delete this payment?")) {
                              deletePayment(p.id);
                              toast.success("Deleted");
                            }
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
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
