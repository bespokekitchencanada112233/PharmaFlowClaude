import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, fmt, fmtDate } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DateRangeFilter,
  defaultDateRange,
  type DateRangeValue,
} from "@/components/DateRangeFilter";
import { useRole } from "@/lib/roles";
import { ProfitPinGate } from "@/components/ProfitPinGate";
import { computeProfit } from "@/lib/profit";
import { toCSV, downloadCSV } from "@/lib/csv";
import { TrendingUp, KeyRound, Download } from "lucide-react";

export const Route = createFileRoute("/reports/profitability")({
  component: ProfitabilityPage,
});

function ProfitabilityPage() {
  const { isAdmin, loading } = useRole();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/invoices" />;

  return (
    <>
      <ProfitPinGate>
        {({ changePin }) => <ProfitabilityBody onChangePin={changePin} />}
      </ProfitPinGate>
    </>
  );
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function ProfitabilityBody({ onChangePin }: { onChangePin: () => void }) {
  const { db } = useStore();
  const [range, setRange] = useState<DateRangeValue>(defaultDateRange);
  const { totals, companyRows, invoiceRows } = useMemo(
    () => computeProfit(db, range),
    [db, range],
  );

  const exportCompany = () => {
    const csv = toCSV(
      companyRows.map((r) => ({
        Company: r.company,
        Units: r.units,
        Revenue: r.revenue.toFixed(2),
        Cost: r.cost.toFixed(2),
        Profit: r.profit.toFixed(2),
        Margin: pct(r.margin),
      })),
    );
    downloadCSV(`profit-by-company-${Date.now()}.csv`, csv);
  };

  const exportInvoices = () => {
    const csv = toCSV(
      invoiceRows.map((r) => ({
        Invoice: `INV-${r.number}`,
        Date: fmtDate(r.date),
        Customer: r.customerName,
        Revenue: r.revenue.toFixed(2),
        Cost: r.cost.toFixed(2),
        Profit: r.profit.toFixed(2),
        Margin: pct(r.margin),
      })),
    );
    downloadCSV(`profit-by-invoice-${Date.now()}.csv`, csv);
  };

  return (
    <>
      <PageHeader
        title="Profitability"
        subtitle="Revenue, cost and profit for the selected date range"
        actions={
          <Button variant="outline" size="sm" onClick={onChangePin}>
            <KeyRound /> Change PIN
          </Button>
        }
      />
      <div className="p-4 sm:p-8 space-y-6">
        <Card className="p-4">
          <DateRangeFilter value={range} onChange={setRange} />
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Revenue" value={fmt(totals.revenue)} />
          <Stat label="Cost" value={fmt(totals.cost)} />
          <Stat
            label="Profit"
            value={fmt(totals.profit)}
            highlight
            tone={totals.profit >= 0 ? "good" : "bad"}
          />
          <Stat label="Margin" value={pct(totals.margin)} />
        </div>

        <Tabs defaultValue="company">
          <TabsList>
            <TabsTrigger value="company">By Company</TabsTrigger>
            <TabsTrigger value="invoice">By Invoice</TabsTrigger>
          </TabsList>

          <TabsContent value="company">
            <Card className="p-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <TrendingUp className="size-4" /> Profit by product company
                </div>
                <Button variant="outline" size="sm" onClick={exportCompany}>
                  <Download /> CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2">Company</th>
                      <th className="text-right px-4 py-2">Units</th>
                      <th className="text-right px-4 py-2">Revenue</th>
                      <th className="text-right px-4 py-2">Cost</th>
                      <th className="text-right px-4 py-2">Profit</th>
                      <th className="text-right px-4 py-2">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companyRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-6 text-center text-muted-foreground"
                        >
                          No sales in this range.
                        </td>
                      </tr>
                    ) : (
                      companyRows.map((r) => (
                        <tr key={r.company} className="border-t border-border">
                          <td className="px-4 py-2">{r.company}</td>
                          <td className="px-4 py-2 text-right">{r.units}</td>
                          <td className="px-4 py-2 text-right">
                            {fmt(r.revenue)}
                          </td>
                          <td className="px-4 py-2 text-right">{fmt(r.cost)}</td>
                          <td
                            className={`px-4 py-2 text-right font-medium ${
                              r.profit >= 0 ? "text-success" : "text-destructive"
                            }`}
                          >
                            {fmt(r.profit)}
                          </td>
                          <td className="px-4 py-2 text-right text-muted-foreground">
                            {pct(r.margin)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="invoice">
            <Card className="p-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <TrendingUp className="size-4" /> Profit by invoice
                </div>
                <Button variant="outline" size="sm" onClick={exportInvoices}>
                  <Download /> CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2">#</th>
                      <th className="text-left px-4 py-2">Date</th>
                      <th className="text-left px-4 py-2">Customer</th>
                      <th className="text-right px-4 py-2">Revenue</th>
                      <th className="text-right px-4 py-2">Cost</th>
                      <th className="text-right px-4 py-2">Profit</th>
                      <th className="text-right px-4 py-2">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-6 text-center text-muted-foreground"
                        >
                          No invoices in this range.
                        </td>
                      </tr>
                    ) : (
                      invoiceRows.map((r) => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="px-4 py-2">
                            <Link
                              to="/invoices/$id"
                              params={{ id: r.id }}
                              className="text-accent hover:underline"
                            >
                              INV-{r.number}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {fmtDate(r.date)}
                          </td>
                          <td className="px-4 py-2">{r.customerName}</td>
                          <td className="px-4 py-2 text-right">
                            {fmt(r.revenue)}
                          </td>
                          <td className="px-4 py-2 text-right">{fmt(r.cost)}</td>
                          <td
                            className={`px-4 py-2 text-right font-medium ${
                              r.profit >= 0 ? "text-success" : "text-destructive"
                            }`}
                          >
                            {fmt(r.profit)}
                          </td>
                          <td className="px-4 py-2 text-right text-muted-foreground">
                            {pct(r.margin)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground">
          Profit uses each product's <strong>current purchase price</strong> as
          cost basis. Sales returns in the date range reduce revenue, cost and
          profit. Changing a product's purchase price will retroactively change
          historical profit figures.
        </p>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <Card className={`p-5 ${highlight ? "border-primary/40" : ""}`}>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div
        className={`text-2xl font-semibold mt-1 ${
          tone === "good"
            ? "text-success"
            : tone === "bad"
              ? "text-destructive"
              : ""
        }`}
      >
        {value}
      </div>
    </Card>
  );
}
