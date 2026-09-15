import { createFileRoute, Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { useStore, fmt, fmtDate } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";

export const Route = createFileRoute("/suppliers/$id")({
  component: SupplierDetail,
});

function SupplierDetail() {
  const { id } = useParams({ from: "/suppliers/$id" });
  const location = useLocation();
  const { db, supplierBalance } = useStore();
  const s = db.suppliers.find((x) => x.id === id);
  const purchases = db.purchases.filter((p) => p.supplierId === id);
  const payments = db.supplierPayments.filter((p) => p.supplierId === id);
  const returns = db.purchaseReturns.filter((r) => r.supplierId === id);

  if (location.pathname.endsWith("/statement")) {
    return <Outlet />;
  }

  if (!s) {
    return (
      <>
        <PageHeader title="Supplier not found" />
        <div className="p-8">
          <Link to="/suppliers">
            <Button variant="outline">
              <ArrowLeft /> Back
            </Button>
          </Link>
        </div>
      </>
    );
  }

  const totalPurchases = purchases.reduce((sum, p) => sum + p.total, 0);
  const totalPaid =
    purchases.reduce((sum, p) => sum + p.paid, 0) + payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <>
      <PageHeader
        title={s.name}
        subtitle={[s.company, s.area, s.phone].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link to="/suppliers/$id/statement" params={{ id: s.id }}>
              <Button variant="outline">
                <FileText /> Statement
              </Button>
            </Link>
            <Link to="/suppliers">
              <Button variant="outline">
                <ArrowLeft /> Back
              </Button>
            </Link>
          </>
        }
      />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Stat label="Opening" value={fmt(s.openingBalance)} />
          <Stat label="Purchases" value={fmt(totalPurchases)} />
          <Stat label="Paid" value={fmt(totalPaid)} />
          <Stat label="Balance" value={fmt(supplierBalance(s.id))} tone="text-warning" />
        </div>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Purchase history</h2>
          {purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchases.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Purchase</th>
                  <th>Date</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2">
                      <Link
                        to="/purchases/$id"
                        params={{ id: p.id }}
                        className="text-accent hover:underline"
                      >
                        PUR-{p.number}
                      </Link>
                    </td>
                    <td>{fmtDate(p.date)}</td>
                    <td className="text-right tabular-nums">{fmt(p.total)}</td>
                    <td className="text-right tabular-nums">{fmt(p.paid)}</td>
                    <td className="text-right tabular-nums">{fmt(p.total - p.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Payments made</h2>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Date</th>
                  <th>Method</th>
                  <th>Notes</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2">{fmtDate(p.date)}</td>
                    <td>{p.amount < 0 ? <span className="text-warning font-medium">Cash In</span> : (p.method ?? "—")}</td>
                    <td className="text-muted-foreground">{p.notes ?? ""}</td>
                    <td className={`text-right tabular-nums ${p.amount < 0 ? "text-warning" : ""}`}>
                      {p.amount < 0 ? `−${fmt(-p.amount)}` : fmt(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Purchase returns</h2>
          {returns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No returns.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Date</th>
                  <th>Items</th>
                  <th>Notes</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2">{fmtDate(r.date)}</td>
                    <td>{r.items.length} item(s)</td>
                    <td className="text-muted-foreground">{r.notes ?? ""}</td>
                    <td className="text-right tabular-nums text-success">- {fmt(r.total)}</td>
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${tone ?? ""}`}>{value}</div>
    </Card>
  );
}
