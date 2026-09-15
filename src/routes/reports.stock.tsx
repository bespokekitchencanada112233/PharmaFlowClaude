import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, fmt, fmtClean, fmtDate } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { toCSV, downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/reports/stock")({
  component: StockReport,
});

type Band = "all" | "neg" | "zero" | "low" | "high" | "low50" | "low100";
const BAND_LABEL: Record<Band, string> = {
  all: "All products",
  neg: "Qty < 0 (negative)",
  zero: "Qty = 0 (out of stock)",
  low: "Qty 1 – 10 (low)",
  high: "Qty > 10 (healthy)",
  low50: "Qty < 50",
  low100: "Qty < 100",
};

function inBand(stock: number, band: Band): boolean {
  switch (band) {
    case "neg": return stock < 0;
    case "zero": return stock === 0;
    case "low": return stock >= 1 && stock <= 10;
    case "high": return stock > 10;
    case "low50": return stock < 50;
    case "low100": return stock < 100;
    default: return true;
  }
}

function StockReport() {
  const { db } = useStore();
  const [band, setBand] = useState<Band>("all");
  const [q, setQ] = useState("");
  const [company, setCompany] = useState("all");

  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const p of db.products) if (p.company) set.add(p.company);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [db.products]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return db.products
      .filter((p) => inBand(Number(p.stock) || 0, band))
      .filter((p) => company === "all" || (p.company || "") === company)
      .filter((p) =>
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.pack || "").toLowerCase().includes(term) ||
        (p.company || "").toLowerCase().includes(term),
      )
      .sort((a, b) =>
        (a.company || "").localeCompare(b.company || "") ||
        a.name.localeCompare(b.name),
      );
  }, [db.products, band, q, company]);

  const totals = useMemo(() => {
    let units = 0; let value = 0;
    for (const p of rows) {
      const s = Number(p.stock) || 0;
      units += s;
      value += s * (Number(p.purchasePrice) || 0);
    }
    return { count: rows.length, units, value };
  }, [rows]);

  function exportCsv() {
    const data = rows.map((p) => ({
      product: p.name,
      company: p.company || "",
      pack: p.pack || "",
      stock: p.stock,
      cost: p.purchasePrice,
      sale: p.salePrice,
      stock_value: (Number(p.stock) || 0) * (Number(p.purchasePrice) || 0),
    }));
    downloadCSV(`stock-report-${new Date().toISOString().slice(0, 10)}.csv`,
      toCSV(data, ["product", "company", "pack", "stock", "cost", "sale", "stock_value"]));
  }

  return (
    <>
      <PageHeader
        title="Stock Report"
        subtitle="Filter by stock level, print or export"
        actions={
          <>
            <Link to="/reports"><Button variant="outline"><ArrowLeft /> Reports</Button></Link>
            <Button variant="outline" onClick={exportCsv}><Download /> CSV</Button>
            <Button onClick={() => window.print()}><Printer /> Print</Button>
          </>
        }
      />
      <div className="p-4 sm:p-8 space-y-4">
        <Card className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 print:hidden">
          <div>
            <Label className="mb-1.5 block text-xs">Stock filter</Label>
            <select
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
              value={band}
              onChange={(e) => setBand(e.target.value as Band)}
            >
              {(["all", "neg", "zero", "low", "high", "low50", "low100"] as Band[]).map((b) => (
                <option key={b} value={b}>{BAND_LABEL[b]}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Company</Label>
            <select
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="all">All companies</option>
              {companies.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block text-xs">Search</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product, pack, company…" />
          </div>
        </Card>

        <div className="print-area">
          <div className="hidden print:block mb-4">
            <h1 className="text-xl font-bold">{db.company.name} — Stock Report</h1>
            <div className="text-xs text-muted-foreground">
              {BAND_LABEL[band]}
              {company !== "all" ? ` · ${company}` : ""}
              {" · "}{fmtDate(new Date())}
            </div>
          </div>
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-secondary-foreground text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Pack</th>
                  <th className="px-4 py-3 font-medium text-right">Cost</th>
                  <th className="px-4 py-3 font-medium text-right">Sale</th>
                  <th className="px-4 py-3 font-medium text-right">Stock</th>
                  <th className="px-4 py-3 font-medium text-right">Stock Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No products match.</td></tr>
                )}
                {rows.map((p) => {
                  const s = Number(p.stock) || 0;
                  const tone =
                    s < 0 ? "text-destructive" :
                    s === 0 ? "text-warning" :
                    s <= 10 ? "text-warning" : "";
                  return (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.company || "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.pack || "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtClean(p.purchasePrice)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtClean(p.salePrice)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums font-medium ${tone}`}>{s}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtClean(s * (Number(p.purchasePrice) || 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-secondary/40 font-semibold">
                  <td className="px-4 py-3" colSpan={5}>
                    {totals.count} product{totals.count === 1 ? "" : "s"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{totals.units}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.value)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </div>
      </div>
    </>
  );
}
