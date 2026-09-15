import { createFileRoute, Link, Outlet, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useStore, fmt, fmtClean, fmtDate, fmtDateTime } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Pencil, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { buildReturnPdf } from "@/lib/pdf";

export const Route = createFileRoute("/returns/purchase/$id")({
  component: PurchaseReturnView,
});

function PurchaseReturnView() {
  const { id } = useParams({ from: "/returns/purchase/$id" });
  const location = useLocation();
  const navigate = useNavigate();
  const { db, deletePurchaseReturn } = useStore();

  if (location.pathname.endsWith("/edit")) return <Outlet />;

  const ret = db.purchaseReturns.find((r) => r.id === id);
  if (!ret) {
    return (
      <>
        <PageHeader title="Purchase return not found" />
        <div className="p-8"><Link to="/returns"><Button variant="outline"><ArrowLeft /> Back</Button></Link></div>
      </>
    );
  }
  const supplier = db.suppliers.find((s) => s.id === ret.supplierId);
  const ref = `PR-${ret.id.slice(0, 8).toUpperCase()}`;

  function downloadPdf() {
    if (!ret) return;
    const blob = buildReturnPdf({
      company: db.company,
      kind: "purchase",
      refLabel: ref,
      date: ret.date,
      partyName: ret.supplierName,
      partyCompany: supplier?.company,
      partyAddress: supplier?.address,
      partyPhone: supplier?.phone,
      items: ret.items,
      total: ret.total,
      notes: ret.notes,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `PurchaseReturn_${ref}.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title={`Purchase Return ${ref}`}
        subtitle={fmtDateTime(ret.date)}
        actions={
          <>
            <Link to="/returns"><Button variant="outline"><ArrowLeft /> Back</Button></Link>
            <Link to="/returns/purchase/$id/edit" params={{ id: ret.id }}>
              <Button variant="outline"><Pencil /> Edit</Button>
            </Link>
            <Button variant="outline" onClick={downloadPdf}><Download /> PDF</Button>
            <Button variant="outline" onClick={() => {
              if (confirm("Delete this return and revert stock?")) {
                deletePurchaseReturn(ret.id); toast.success("Deleted");
                navigate({ to: "/returns" });
              }
            }}><Trash2 /> Delete</Button>
            <Button onClick={() => window.print()}><Printer /> Print</Button>
          </>
        }
      />
      <div className="p-8">
        <div className="print-area mx-auto max-w-4xl bg-card text-card-foreground border border-border rounded-md p-10">
          <div className="flex justify-between items-start pb-6 border-b border-border">
            <div>
              <h1 className="text-2xl font-bold">{db.company.name}</h1>
              <div className="text-sm text-muted-foreground mt-1">{db.company.address}</div>
              {db.company.phone && <div className="text-sm text-muted-foreground">{db.company.phone}</div>}
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Purchase Return</div>
              <div className="text-2xl font-semibold">{ref}</div>
              <div className="text-sm text-muted-foreground mt-1">{fmtDate(ret.date)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 py-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">To Supplier</div>
              <div className="font-semibold">{ret.supplierName}</div>
              {supplier?.company && <div className="text-sm">{supplier.company}</div>}
              {supplier?.address && <div className="text-sm text-muted-foreground">{supplier.address}</div>}
              {supplier?.phone && <div className="text-sm text-muted-foreground">{supplier.phone}</div>}
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
            <tbody>
              {ret.items.map((it, idx) => (
                <tr key={idx} className="border-t border-border">
                  <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium">{it.productName}</td>
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
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(ret.total)}</td>
              </tr>
            </tfoot>
          </table>
          {ret.notes && (
            <div className="mt-8 pt-6 border-t border-border text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notes</div>
              {ret.notes}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
