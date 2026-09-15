import { createFileRoute, Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { useStore, fmt, fmtDate } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/customers/$id")({
  component: CustomerDetail,
});

function CustomerDetail() {
  const { id } = useParams({ from: "/customers/$id" });
  const location = useLocation();
  const { db, customerBalance, online, pendingCount, refreshData } = useStore();

  // Statements and balances must use the latest saved records before they are
  // viewed or printed. Keep local pending work intact while offline.
  useEffect(() => {
    if (online && pendingCount === 0) void refreshData();
  }, [id, online, pendingCount, refreshData]);
  const c = db.customers.find((x) => x.id === id);
  const invoices = db.invoices.filter((i) => i.customerId === id);
  const payments = db.payments.filter((p) => p.customerId === id);
  const returns = db.salesReturns.filter((r) => r.customerId === id);

  if (location.pathname.endsWith("/statement")) {
    return <Outlet />;
  }

  if (!c) {
    return (
      <>
        <PageHeader title="Customer not found" />
        <div className="p-8">
          <Link to="/customers">
            <Button variant="outline">
              <ArrowLeft /> Back
            </Button>
          </Link>
        </div>
      </>
    );
  }

  const totalSales = invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid =
    invoices.reduce((s, i) => s + i.paid, 0) + payments.reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={[c.company, c.area, c.phone].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link to="/customers/$id/statement" params={{ id: c.id }}>
              <Button variant="outline">
                <FileText /> Statement
              </Button>
            </Link>
            <Link to="/customers">
              <Button variant="outline">
                <ArrowLeft /> Back
              </Button>
            </Link>
          </>
        }
      />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Stat label="Opening" value={fmt(c.openingBalance)} />
          <Stat label="Sales" value={fmt(totalSales)} />
          <Stat label="Received" value={fmt(totalPaid)} />
          <Stat label="Balance" value={fmt(customerBalance(c.id))} tone="text-warning" />
        </div>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Sale history</h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Invoice</th>
                  <th>Date</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="py-2">
                      <Link
                        to="/invoices/$id"
                        params={{ id: i.id }}
                        className="text-accent hover:underline"
                      >
                        INV-{i.number}
                      </Link>
                    </td>
                    <td>{fmtDate(i.date)}</td>
                    <td className="text-right tabular-nums">{fmt(i.total)}</td>
                    <td className="text-right tabular-nums">{fmt(i.paid)}</td>
                    <td className="text-right tabular-nums">{fmt(i.total - i.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Payments received</h2>
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
                    <td>{p.amount < 0 ? <span className="text-warning font-medium">Cash Out</span> : (p.method ?? "—")}</td>
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
          <h2 className="font-semibold mb-4">Sales returns</h2>
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
