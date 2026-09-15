import { createFileRoute, Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { useStore, fmt, fmtClean, fmtRound, fmtDate, fmtDateTime } from "@/lib/store";
import { useRole, isToday } from "@/lib/roles";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, EyeOff, Pencil, Printer, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { SmsButton } from "@/components/SmsButton";
import { useAutoInvoiceSms } from "@/lib/sms-auto";
import { buildInvoicePdf } from "@/lib/pdf";
import { enqueueInvoicePrint } from "@/lib/printQueue";

export const Route = createFileRoute("/invoices/$id")({
  component: InvoiceView,
});

function InvoiceView() {
  const { id } = useParams({ from: "/invoices/$id" });
  const location = useLocation();
  const { db, deleteInvoice } = useStore();
  const { sendInvoiceSmsOnce } = useAutoInvoiceSms();
  const { isAdmin } = useRole();
  const navigate = useNavigate();
  const [showProducts, setShowProducts] = useState(true);
  const inv = db.invoices.find((i) => i.id === id);
  const canEdit = inv && (isAdmin || isToday(inv.date));
  const canDelete = canEdit;
  const customer = inv ? db.customers.find((c) => c.id === inv.customerId) : null;

  if (location.pathname.endsWith("/edit")) {
    return <Outlet />;
  }

  if (!inv) {
    return (
      <>
        <PageHeader title="Invoice not found" />
        <div className="p-8">
          <Link to="/invoices">
            <Button variant="outline">
              <ArrowLeft /> Back
            </Button>
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Invoice INV-${inv.number}`}
        subtitle={fmtDateTime(inv.date)}
        actions={
          <>
            <Link to="/invoices">
              <Button variant="outline">
                <ArrowLeft /> Back
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => setShowProducts((v) => !v)}
              title={showProducts ? "Hide products from view" : "Show products"}
            >
              {showProducts ? <EyeOff /> : <Eye />}
              {showProducts ? "Hide Products" : "Show Products"}
            </Button>
            {canEdit && (
              <Link to="/invoices/$id/edit" params={{ id: inv.id }}>
                <Button variant="outline"><Pencil /> Edit</Button>
              </Link>
            )}
            <Button
              variant="outline"
              disabled={!canDelete}
              onClick={() => {
                if (confirm("Delete invoice and restore stock?")) {
                  deleteInvoice(inv.id);
                  toast.success("Deleted");
                  navigate({ to: "/invoices" });
                }
              }}
            >
              <Trash2 /> Delete
            </Button>
            <WhatsAppButton
              kind="invoice"
              customerId={inv.customerId}
              vars={{
                customer: inv.customerName,
                number: inv.number,
                date: fmtDate(inv.date),
                total: fmt(inv.total),
                paid: fmt(inv.paid),
                due: fmt(inv.total - inv.paid),
              }}
              fileName={`Invoice_INV-${inv.number}.pdf`}
              buildPdf={() =>
                buildInvoicePdf({
                  company: db.company,
                  number: inv.number,
                  date: inv.date,
                  customerName: inv.customerName,
                  customerCompany: customer?.company,
                  customerAddress: customer?.address,
                  customerPhone: customer?.phone,
                  items: inv.items.map((it) => ({
                    productName: it.productName,
                    qty: it.qty,
                    price: it.price,
                  })),
                  total: inv.total,
                  paid: inv.paid,
                  notes: inv.notes,
                })
              }
            />
            <SmsButton
              kind="invoice"
              customerId={inv.customerId}
              vars={{
                customer: inv.customerName,
                number: `INV-${inv.number}`,
                date: fmtDate(inv.date),
                total: fmt(inv.total),
                paid: fmt(inv.paid),
                due: fmt(inv.total - inv.paid),
              }}
            />
            <Button variant="outline" onClick={async () => {
              try {
                await enqueueInvoicePrint(inv.id);
                toast.success("Sent to printer");
                void sendInvoiceSmsOnce(inv);
              }
              catch (e) { toast.error((e as Error).message); }
            }}>
              <Send /> Send to Printer
            </Button>
            <Button onClick={() => { void sendInvoiceSmsOnce(inv); window.print(); }}>
              <Printer /> Print
            </Button>
          </>
        }
      />
      <div className="p-8">
        <div className="print-area mx-auto max-w-4xl bg-card text-card-foreground border border-border rounded-md p-10">
          <div className="flex justify-between items-start pb-6 border-b border-border">
            <div className="print-hide">
              <h1 className="text-2xl font-bold">{db.company.name}</h1>
              <div className="text-sm text-muted-foreground mt-1">
                {db.company.address}
              </div>
              {db.company.phone && (
                <div className="text-sm text-muted-foreground">
                  {db.company.phone}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Invoice
              </div>
              <div className="text-2xl font-semibold">INV-{inv.number}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {fmtDate(inv.date)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 py-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Bill To
              </div>
              <div className="font-semibold">{inv.customerName}</div>
              {customer?.company && (
                <div className="text-sm">{customer.company}</div>
              )}
              {customer?.address && (
                <div className="text-sm text-muted-foreground">
                  {customer.address}
                </div>
              )}
              {customer?.phone && (
                <div className="text-sm text-muted-foreground">
                  {customer.phone}
                </div>
              )}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground text-left">
              <tr>
                <th className="px-3 py-2 font-medium w-10">#</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium text-right w-20">Qty</th>
                <th className="px-3 py-2 font-medium text-right w-28">Price</th>
                <th className="px-3 py-2 font-medium text-right w-28">
                  Amount
                </th>
              </tr>
            </thead>
            {showProducts ? (
              <tbody>
                {inv.items.map((it, idx) => (
                  <tr key={idx} className="border-t border-border">
                    <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium">{it.productName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{it.qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtClean(it.price)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtClean(it.qty * it.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody>
                <tr className="border-t border-border">
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground bg-secondary/30">
                    <EyeOff className="size-5 mx-auto mb-2 opacity-60 inline-block" />
                    <div>Product details hidden ({inv.items.length} item{inv.items.length === 1 ? "" : "s"})</div>
                  </td>
                </tr>
              </tbody>
            )}
            <tfoot>
              <tr className="border-t-2 border-border">
                <td colSpan={3}></td>
                <td className="px-3 py-2 text-right font-semibold">Total</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtRound(inv.total)}</td>
              </tr>
              <tr>
                <td colSpan={3}></td>
                <td className="px-3 py-2 text-right">Paid</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtRound(inv.paid)}</td>
              </tr>
              <tr>
                <td colSpan={3}></td>
                <td className="px-3 py-2 text-right font-semibold text-warning">Balance Due</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-warning">{fmtRound(inv.total - inv.paid)}</td>
              </tr>
            </tfoot>
          </table>

          {inv.notes && (
            <div className="mt-8 pt-6 border-t border-border text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Notes
              </div>
              {inv.notes}
            </div>
          )}

          <div className="mt-12 pt-6 border-t border-border flex justify-between text-xs text-muted-foreground no-print">
            <span>Thank you for your business.</span>
            <span>Authorised Signatory</span>
          </div>
        </div>
      </div>
    </>
  );
}

function TotalsRow({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: string;
}) {
  const cls = `${bold ? "font-semibold" : ""} ${tone ?? ""}`;
  return (
    <tr>
      <td className="w-10" />
      <td className="w-full" />
      <td className="w-20" />
      <td className={`px-3 py-2 text-right w-28 ${cls}`}>{label}</td>
      <td className={`px-3 py-2 text-right w-28 tabular-nums ${cls}`}>{value}</td>
    </tr>
  );
}
