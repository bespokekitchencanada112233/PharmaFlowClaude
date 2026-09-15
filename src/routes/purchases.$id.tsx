import { createFileRoute, Link, Outlet, useLocation, useParams, useNavigate } from "@tanstack/react-router";
import { useStore, fmt, fmtClean, fmtDate, fmtDateTime } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, EyeOff, Pencil, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRole, isToday } from "@/lib/roles";
import { toast } from "sonner";

export const Route = createFileRoute("/purchases/$id")({
  component: PurchaseView,
});

function PurchaseView() {
  const { id } = useParams({ from: "/purchases/$id" });
  const location = useLocation();
  const { db, deletePurchase } = useStore();
  const navigate = useNavigate();
  const [showProducts, setShowProducts] = useState(true);

  if (location.pathname.endsWith("/edit")) {
    return <Outlet />;
  }

  const { isAdmin } = useRole();
  const pur = db.purchases.find((p) => p.id === id);
  const canEdit = !!pur && (isAdmin || isToday(pur.date));
  const supplier = pur ? db.suppliers.find((s) => s.id === pur.supplierId) : null;

  if (!pur) {
    return (
      <>
        <PageHeader title="Purchase not found" />
        <div className="p-8">
          <Link to="/purchases"><Button variant="outline"><ArrowLeft /> Back</Button></Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Purchase PUR-${pur.number}`}
        subtitle={fmtDateTime(pur.date)}
        actions={
          <>
            <Link to="/purchases"><Button variant="outline"><ArrowLeft /> Back</Button></Link>
            <Button
              variant="outline"
              onClick={() => setShowProducts((v) => !v)}
              title={showProducts ? "Hide products from view" : "Show products"}
            >
              {showProducts ? <EyeOff /> : <Eye />}
              {showProducts ? "Hide Products" : "Show Products"}
            </Button>
            {canEdit && (
              <Link to="/purchases/$id/edit" params={{ id: pur.id }}>
                <Button variant="outline"><Pencil /> Edit</Button>
              </Link>
            )}
            <Button variant="outline" onClick={() => {
              if (confirm("Delete purchase and reverse stock?")) {
                deletePurchase(pur.id); toast.success("Deleted");
                navigate({ to: "/purchases" });
              }
            }}><Trash2 /> Delete</Button>
            <Button onClick={() => window.print()}><Printer /> Print</Button>
          </>
        }
      />
      <div className="p-8">
        <div className="print-area mx-auto max-w-4xl bg-card text-card-foreground border border-border rounded-md p-10">
          <div className="flex justify-between items-start pb-6 border-b border-border">
            <div className="print-hide">
              <h1 className="text-2xl font-bold">{db.company.name}</h1>
              <div className="text-sm text-muted-foreground mt-1">{db.company.address}</div>
              {db.company.phone && (
                <div className="text-sm text-muted-foreground">{db.company.phone}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Purchase</div>
              <div className="text-2xl font-semibold">PUR-{pur.number}</div>
              <div className="text-sm text-muted-foreground mt-1">{fmtDate(pur.date)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 py-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Supplier
              </div>
              <div className="font-semibold">{pur.supplierName}</div>
              {supplier?.company && (
                <div className="text-sm">{supplier.company}</div>
              )}
              {supplier?.address && (
                <div className="text-sm text-muted-foreground">{supplier.address}</div>
              )}
              {supplier?.phone && (
                <div className="text-sm text-muted-foreground">{supplier.phone}</div>
              )}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground text-left">
              <tr>
                <th className="px-3 py-2 font-medium w-10">#</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium text-right w-20">Qty</th>
                <th className="px-3 py-2 font-medium text-right w-28">Cost</th>
                <th className="px-3 py-2 font-medium text-right w-28">Amount</th>
              </tr>
            </thead>
            {showProducts ? (
              <tbody>
                {pur.items.map((it, idx) => (
                  <tr key={idx} className="border-t border-border">
                    <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium">{it.productName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{it.qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtClean(it.price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtClean(it.qty * it.price)}</td>
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody>
                <tr className="border-t border-border">
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground bg-secondary/30">
                    <EyeOff className="size-5 mx-auto mb-2 opacity-60 inline-block" />
                    <div>Product details hidden ({pur.items.length} item{pur.items.length === 1 ? "" : "s"})</div>
                  </td>
                </tr>
              </tbody>
            )}
            <tfoot>
              <tr className="border-t-2 border-border">
                <td colSpan={3}></td>
                <td className="px-3 py-2 text-right font-semibold">Total</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(pur.total)}</td>
              </tr>
              <tr>
                <td colSpan={3}></td>
                <td className="px-3 py-2 text-right">Paid</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(pur.paid)}</td>
              </tr>
              <tr>
                <td colSpan={3}></td>
                <td className="px-3 py-2 text-right font-semibold text-warning">Balance Owed</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-warning">{fmt(pur.total - pur.paid)}</td>
              </tr>
            </tfoot>
          </table>

          {pur.notes && (
            <div className="mt-8 pt-6 border-t border-border text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notes</div>
              {pur.notes}
            </div>
          )}

          <div className="mt-12 pt-6 border-t border-border flex justify-between text-xs text-muted-foreground no-print">
            <span>Thank you.</span>
            <span>Authorised Signatory</span>
          </div>
        </div>
      </div>
    </>
  );
}
