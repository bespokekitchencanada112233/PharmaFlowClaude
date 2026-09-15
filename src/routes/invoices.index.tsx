import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useStore, fmt, fmtDate, fmtDateTime } from "@/lib/store";
import { useRole, isToday } from "@/lib/roles";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { CustomerCombobox } from "@/components/CustomerCombobox";
import { Plus, Search, Pencil, X, Printer, Send } from "lucide-react";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { buildInvoicePdf } from "@/lib/pdf";
import { enqueueInvoiceListPrint } from "@/lib/printQueue";
import { toast } from "sonner";

export const Route = createFileRoute("/invoices/")({
  component: InvoicesList,
});

const fmtN = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });


type Preset = "today" | "7d" | "month" | "all" | "custom";

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeFor(preset: Preset, customFrom: string, customTo: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") {
    return { from: today, to: new Date(today.getTime() + 86400000) };
  }
  if (preset === "7d") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from, to: new Date(today.getTime() + 86400000) };
  }
  if (preset === "month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(today.getTime() + 86400000),
    };
  }
  if (preset === "custom") {
    const from = customFrom ? new Date(customFrom) : new Date(0);
    const toBase = customTo ? new Date(customTo) : today;
    const to = new Date(toBase.getTime() + 86400000);
    return { from, to };
  }
  return { from: new Date(0), to: new Date(8640000000000000) };
}

function InvoicesList() {
  const { db } = useStore();
  const { isAdmin } = useRole();
  const [q, setQ] = usePersistedState("invoices:q", "");
  const [preset, setPreset] = usePersistedState<Preset>("invoices:preset", "today");
  const [customFrom, setCustomFrom] = usePersistedState("invoices:customFrom", toISODate(new Date()));
  const [customTo, setCustomTo] = usePersistedState("invoices:customTo", toISODate(new Date()));
  const [customerId, setCustomerId] = usePersistedState("invoices:customerId", "");

  const { from, to } = useMemo(
    () => rangeFor(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const list = useMemo(() => {
    const qLower = q.toLowerCase();
    return db.invoices.filter((i) => {
      const d = new Date(i.date);
      if (d < from || d >= to) return false;
      if (customerId && i.customerId !== customerId) return false;
      if (
        qLower &&
        !i.customerName.toLowerCase().includes(qLower) &&
        !String(i.number).includes(qLower)
      )
        return false;
      return true;
    });
  }, [db.invoices, from, to, customerId, q]);

  const presets: { key: Preset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "7d", label: "Last 7 days" },
    { key: "month", label: "This month" },
    { key: "all", label: "All" },
    { key: "custom", label: "Custom" },
  ];

  const activePresetLabel = presets.find((p) => p.key === preset)?.label ?? "";
  const rangeLabel =
    preset === "custom"
      ? `${customFrom || "…"} to ${customTo || "…"}`
      : activePresetLabel;
  const customerLabel = customerId
    ? db.customers.find((c) => c.id === customerId)?.name ?? ""
    : "";

  const totals = useMemo(() => {
    return list.reduce(
      (acc, i) => {
        acc.total += i.total;
        acc.paid += i.paid;
        acc.balance += i.total - i.paid;
        return acc;
      },
      { total: 0, paid: 0, balance: 0 },
    );
  }, [list]);

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle={`${list.length} of ${db.invoices.length}`}
        actions={
          <>
            <Button
              variant="outline"
              disabled={list.length === 0}
              onClick={async () => {
                try {
                  await enqueueInvoiceListPrint({
                    invoiceIds: list.map((i) => i.id),
                    filterLabel: rangeLabel,
                    customerLabel: customerLabel || undefined,
                    search: q || undefined,
                    totals,
                  });
                  toast.success("Sent to printer");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <Send /> Send to Printer
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
            <Link to="/invoices/new">
              <Button>
                <Plus /> New Invoice
              </Button>
            </Link>
          </>
        }
      />

      <div className="p-4 sm:p-8 space-y-4">
        <Card className="p-3 sm:p-4 space-y-3 no-print">
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={preset === p.key ? "default" : "outline"}
                onClick={() => setPreset(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {preset === "custom" && (
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-auto"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-auto"
              />
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search customer or #…"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 sm:w-72">
              <div className="flex-1">
                <CustomerCombobox
                  customers={db.customers}
                  value={customerId}
                  onChange={setCustomerId}
                  placeholder="Filter by customer…"
                />
              </div>
              {customerId && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setCustomerId("")}
                  title="Clear customer filter"
                >
                  <X />
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden p-0 print-area">
          <div className="hidden print:block px-4 pt-4 pb-2 border-b border-border">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-lg font-bold">{db.company.name}</h1>
                <div className="text-sm">Invoices Report</div>
              </div>
              <div className="text-right text-xs">
                <div>Generated: {fmtDateTime(new Date())}</div>
                <div>Range: {rangeLabel}</div>
                {customerLabel && <div>Customer: {customerLabel}</div>}
                {q && <div>Search: {q}</div>}
                <div>Count: {list.length}</div>
              </div>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium text-right">Paid</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
                <th className="px-4 py-3 font-medium">Notes</th>
                <th className="px-4 py-3 w-16 print-hide"></th>
              </tr>
            </thead>

            <tbody>
              {list.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    No invoices for the selected filter.
                  </td>
                </tr>
              )}
              {list.map((i) => (
                <tr
                  key={i.id}
                  className="border-t border-border hover:bg-muted/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      to="/invoices/$id"
                      params={{ id: i.id }}
                      className="text-accent font-medium hover:underline"
                    >
                      INV-{i.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {fmtDateTime(i.date)}
                  </td>
                  <td className="px-4 py-3">{i.customerName}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtN(i.total)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtN(i.paid)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtN(i.total - i.paid)}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <span className="block truncate text-muted-foreground" title={i.notes || ""}>
                      {i.notes || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right print-hide">
                    <div className="flex items-center justify-end gap-1">

                      <WhatsAppButton
                        kind="invoice"
                        customerId={i.customerId}
                        vars={{
                          customer: i.customerName,
                          number: i.number,
                          date: fmtDate(i.date),
                          total: fmt(i.total),
                          paid: fmt(i.paid),
                          due: fmt(i.total - i.paid),
                        }}
                        fileName={`Invoice_INV-${i.number}.pdf`}
                        buildPdf={() => {
                          const customer = db.customers.find((c) => c.id === i.customerId);
                          return buildInvoicePdf({
                            company: db.company,
                            number: i.number,
                            date: i.date,
                            customerName: i.customerName,
                            customerCompany: customer?.company,
                            customerAddress: customer?.address,
                            customerPhone: customer?.phone,
                            items: i.items.map((it) => ({
                              productName: it.productName,
                              qty: it.qty,
                              price: it.price,
                            })),
                            total: i.total,
                            paid: i.paid,
                            notes: i.notes,
                          });
                        }}
                        variant="ghost"
                        size="icon"
                        iconOnly
                      />
                      {(isAdmin || isToday(i.date)) && (
                        <Link to="/invoices/$id/edit" params={{ id: i.id }}>
                          <Button size="icon" variant="ghost" title="Edit">
                            <Pencil />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {list.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="px-4 py-3" colSpan={3}>
                    Grand Total ({list.length})
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtN(totals.total)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtN(totals.paid)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtN(totals.balance)}</td>

                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 print-hide"></td>
                </tr>
              </tfoot>
            )}
          </table>

        </Card>
      </div>
    </>
  );
}
