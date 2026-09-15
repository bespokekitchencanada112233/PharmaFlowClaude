import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, fmt, fmtClean, fmtDate, fmtDateTime } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Printer, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  subscribePrintJobs,
  listPendingJobs,
  listRecentJobs,
  claimJob,
  markPrinted,
  markFailed,
  enqueueTestPrint,
  cancelJob,
  type PrintJobRow,
  type InvoiceListPrintPayload,
} from "@/lib/printQueue";

export const Route = createFileRoute("/print-station")({
  component: PrintStation,
});

function PrintStation() {
  const { db } = useStore();
  const [current, setCurrent] = useState<PrintJobRow | null>(null);
  const [recent, setRecent] = useState<PrintJobRow[]>([]);
  const queueRef = useRef<PrintJobRow[]>([]);
  const processingRef = useRef(false);

  const refreshRecent = async () => {
    try {
      setRecent(await listRecentJobs(15));
    } catch {
      // ignore
    }
  };



  const processNext = async () => {
    if (processingRef.current) return;

    const next = queueRef.current.shift();
    if (!next) return;
    processingRef.current = true;
    try {
      const claimed = await claimJob(next.id);
      if (!claimed) {
        // someone else claimed it
        processingRef.current = false;
        void processNext();
        return;
      }
      setCurrent(claimed);
      // wait two animation frames for the printable DOM to mount
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
      try {
        window.print();
        await markPrinted(claimed.id);
        toast.success(`Printed ${labelFor(claimed)}`);
      } catch (e) {
        await markFailed(claimed.id, (e as Error).message);
        toast.error(`Print failed: ${(e as Error).message}`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCurrent(null);
      processingRef.current = false;
      await refreshRecent();
      // process the next job if any
      if (queueRef.current.length > 0) {
        setTimeout(() => void processNext(), 150);
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const pending = await listPendingJobs();
        if (!mounted) return;
        queueRef.current.push(...pending);
        await refreshRecent();
        void processNext();
      } catch (e) {
        toast.error("Could not load queue: " + (e as Error).message);
      }
    })();

    const unsub = subscribePrintJobs(
      (row) => {
        if (row.status !== "pending") return;
        queueRef.current.push(row);
        void refreshRecent();
        void processNext();
      },
      () => {
        void refreshRecent();
      },
    );

    return () => {
      mounted = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const lastPrinted = useMemo(
    () => recent.find((r) => r.status === "printed"),
    [recent],
  );

  return (
    <>
      <PageHeader
        title="Print Station"
        subtitle="Listening for print jobs in real time"
        actions={
          <div className="flex items-center gap-2 no-print">
            <Badge variant="secondary" className="gap-1">
              <Check className="size-3" /> Auto-print: ON
            </Badge>

            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await enqueueTestPrint();
                  toast.success("Test job sent");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <Printer /> Test print
            </Button>
          </div>
        }
      />

      <div className="p-4 sm:p-8 space-y-4 no-print">
        <Card className="p-4 flex items-center gap-4">
          <div className="size-12 rounded-full bg-primary/10 grid place-items-center">
            {current ? (
              <Loader2 className="size-6 animate-spin text-primary" />
            ) : (
              <Printer className="size-6 text-primary" />
            )}
          </div>
          <div className="flex-1">
            <div className="font-semibold">
              {current
                ? `Printing ${labelFor(current)}…`
                : "Ready — waiting for jobs"}

            </div>
            <div className="text-sm text-muted-foreground">
              {queueRef.current.length > 0
                ? `${queueRef.current.length} job(s) queued`
                : lastPrinted
                  ? `Last printed: ${labelFor(lastPrinted)} at ${new Date(
                      lastPrinted.printed_at || lastPrinted.updated_at,
                    ).toLocaleTimeString()}`
                  : "No jobs yet"}
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold mb-2">Setup</div>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-5">
            <li>
              On the printer PC, launch Chrome with the kiosk-printing flag so
              prints skip the dialog and go straight to the default printer:
            </li>
            <li>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                chrome.exe --kiosk-printing --app={typeof window !== "undefined"
                  ? `${window.location.origin}/print-station`
                  : "/print-station"}
              </code>
            </li>
            <li>Leave this page open. Any user can now click Send to Printer.</li>
          </ol>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="px-4 py-3 border-b border-border text-sm font-semibold">
            Recent jobs
          </div>
          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground text-left">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">By</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No jobs yet.
                  </td>
                </tr>
              )}
              {recent.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(r.created_at).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-2">{labelFor(r)}</td>
                  <td className="px-4 py-2">{r.requested_by_name || "—"}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2">
                    {r.status === "pending" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Cancel"
                        onClick={async () => {
                          await cancelJob(r.id);
                          queueRef.current = queueRef.current.filter(
                            (j) => j.id !== r.id,
                          );
                          await refreshRecent();
                        }}
                      >
                        <X />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {current && (
        <div className="print-area w-full bg-card text-card-foreground p-8">
          <PrintJobBody job={current} db={db} />
        </div>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: PrintJobRow["status"] }) {
  if (status === "printed")
    return (
      <Badge variant="secondary" className="gap-1">
        <Check className="size-3" /> Printed
      </Badge>
    );
  if (status === "printing")
    return (
      <Badge className="gap-1">
        <Loader2 className="size-3 animate-spin" /> Printing
      </Badge>
    );
  if (status === "pending") return <Badge variant="outline">Pending</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="outline">Cancelled</Badge>;
}

function labelFor(j: PrintJobRow): string {
  if (j.kind === "test") return "Test page";
  if (j.kind === "invoice") {
    const id = (j.payload as { invoiceId?: string })?.invoiceId;
    return id ? `Invoice` : "Invoice";
  }
  if (j.kind === "invoice_list") {
    const p = j.payload as unknown as InvoiceListPrintPayload;
    return `Invoice list (${p.invoiceIds?.length ?? 0})`;
  }
  return j.kind;
}

function PrintJobBody({
  job,
  db,
}: {
  job: PrintJobRow;
  db: ReturnType<typeof useStore>["db"];
}) {
  if (job.kind === "test") {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold">{db.company.name}</h1>
        <p className="mt-2">Print Station test page</p>
        <p className="text-xs text-muted-foreground mt-1">
          {fmtDateTime(new Date())}
        </p>
      </div>
    );
  }
  if (job.kind === "invoice") {
    const id = (job.payload as { invoiceId?: string })?.invoiceId;
    const inv = db.invoices.find((i) => i.id === id);
    if (!inv) return <div className="p-10 text-center">Invoice not found</div>;
    const customer = db.customers.find((c) => c.id === inv.customerId);
    return (
      <div>
        <div className="flex justify-between items-start pb-6 border-b border-border">
          <div>
            <h1 className="text-2xl font-bold">{db.company.name}</h1>
            <div className="text-sm">{db.company.address}</div>
            {db.company.phone && <div className="text-sm">{db.company.phone}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Invoice</div>
            <div className="text-2xl font-semibold">INV-{inv.number}</div>
            <div className="text-sm">{fmtDate(inv.date)}</div>
          </div>
        </div>
        <div className="py-6">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Bill To</div>
          <div className="font-semibold">{inv.customerName}</div>
          {customer?.company && <div className="text-sm">{customer.company}</div>}
          {customer?.address && <div className="text-sm">{customer.address}</div>}
          {customer?.phone && <div className="text-sm">{customer.phone}</div>}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="px-3 py-2 font-medium w-10">#</th>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium text-right w-20">Qty</th>
              <th className="px-3 py-2 font-medium text-right w-28">Price</th>
              <th className="px-3 py-2 font-medium text-right w-28">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, idx) => (
              <tr key={idx} className="border-t border-border">
                <td className="px-3 py-2">{idx + 1}</td>
                <td className="px-3 py-2">{it.productName}</td>
                <td className="px-3 py-2 text-right tabular-nums">{it.qty}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtClean(it.price)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtClean(it.qty * it.price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border">
              <td colSpan={3}></td>
              <td className="px-3 py-2 text-right font-semibold">Total</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(inv.total)}</td>
            </tr>
            <tr>
              <td colSpan={3}></td>
              <td className="px-3 py-2 text-right">Paid</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(inv.paid)}</td>
            </tr>
            <tr>
              <td colSpan={3}></td>
              <td className="px-3 py-2 text-right font-semibold">Balance Due</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(inv.total - inv.paid)}</td>
            </tr>
          </tfoot>
        </table>
        {inv.notes && (
          <div className="mt-8 pt-6 border-t border-border text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notes</div>
            {inv.notes}
          </div>
        )}
      </div>
    );
  }
  if (job.kind === "invoice_list") {
    const p = job.payload as unknown as InvoiceListPrintPayload;
    const ids = new Set(p.invoiceIds ?? []);
    const rows = db.invoices.filter((i) => ids.has(i.id));
    return (
      <div>
        <div className="flex justify-between items-start pb-4 border-b border-border">
          <div>
            <h1 className="text-lg font-bold">{db.company.name}</h1>
            <div className="text-sm">Invoices Report</div>
          </div>
          <div className="text-right text-xs">
            <div>Generated: {fmtDateTime(new Date())}</div>
            <div>Range: {p.filterLabel}</div>
            {p.customerLabel && <div>Customer: {p.customerLabel}</div>}
            {p.search && <div>Search: {p.search}</div>}
            <div>Count: {rows.length}</div>
          </div>
        </div>
        <table className="w-full text-sm mt-3">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Invoice</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium text-right">Total</th>
              <th className="px-3 py-2 font-medium text-right">Paid</th>
              <th className="px-3 py-2 font-medium text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-3 py-2">INV-{i.number}</td>
                <td className="px-3 py-2">{fmtDate(i.date)}</td>
                <td className="px-3 py-2">{i.customerName}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(i.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(i.paid)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(i.total - i.paid)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td className="px-3 py-2" colSpan={3}>Grand Total ({rows.length})</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(p.totals.total)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(p.totals.paid)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(p.totals.balance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }
  return null;
}
