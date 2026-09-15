import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useStore, fmt, fmtDate, fmtDateTime } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Printer, Search } from "lucide-react";
import { usePersistedState } from "@/hooks/usePersistedState";
import {
  computeMonthlyStock,
  monthLabel,
  type MonthlyStockCompany,
} from "@/lib/reports/monthlyStock";

export const Route = createFileRoute("/reports/")({
  component: ReportsPage,
});

type AreaRow = { id: string; name: string; phone?: string; balance: number };
type AreaGroup = { area: string; rows: AreaRow[] };

type SalesItemRow = { productId: string; name: string; qty: number; salePrice: number; total: number };
type SalesCompanyRow = { company: string; qty: number; total: number; items: SalesItemRow[] };

type CollectionRow = {
  id: string;
  date: string;
  customerName: string;
  method: string | null;
  notes: string | null;
  amount: number;
  source: "invoice" | "payment";
  reference: string | null;
};

type QuotationItem = { productId: string; name: string; pack: string; salePrice: number };
type QuotationCompany = { company: string; rows: QuotationItem[] };

type PrintPayload =
  | { kind: "area"; group: AreaGroup }
  | { kind: "area-all"; groups: AreaGroup[]; filter: string }
  | {
      kind: "sales-company";
      from: string;
      to: string;
      rows: SalesCompanyRow[];
    }
  | {
      kind: "monthly-stock";
      monthLabel: string;
      companies: MonthlyStockCompany[];
    }
  | {
      kind: "collection";
      from: string;
      to: string;
      area: string | null;
      rows: CollectionRow[];
    }
  | {
      kind: "quotation";
      companies: QuotationCompany[];
    };

function ReportsPage() {
  const { db, customerBalance } = useStore();
  const [printPayload, setPrintPayload] = useState<PrintPayload | null>(null);

  const NO_AREA = "— No area —";

  // ---------- Outstanding by area ----------
  const groups = useMemo<AreaGroup[]>(() => {
    const map = new Map<string, AreaGroup>();
    for (const c of db.customers) {
      const bal = customerBalance(c.id);
      const area = (c.area || NO_AREA).trim() || NO_AREA;
      if (!map.has(area)) map.set(area, { area, rows: [] });
      map.get(area)!.rows.push({ id: c.id, name: c.name, phone: c.phone, balance: bal });
    }
    const arr = Array.from(map.values());
    arr.forEach((g) => g.rows.sort((a, b) => a.name.localeCompare(b.name)));
    arr.sort((a, b) => a.area.localeCompare(b.area));
    return arr;
  }, [db.customers, db.invoices, db.payments, db.salesReturns, customerBalance]);

  const allAreaNames = useMemo(() => groups.map((g) => g.area), [groups]);

  // Default: every real area checked, "No area" unchecked.
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(new Set());
  const [areaInit, setAreaInit] = useState(false);
  useEffect(() => {
    if (areaInit || allAreaNames.length === 0) return;
    setSelectedAreas(new Set(allAreaNames.filter((a) => a !== NO_AREA)));
    setAreaInit(true);
  }, [allAreaNames, areaInit]);

  const toggleArea = (a: string) => {
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  };

  const filteredGroups = useMemo(() => {
    return groups
      .filter((g) => selectedAreas.has(g.area))
      .map((g) => ({
        ...g,
        rows: g.rows.filter((r) => r.balance > 0.001),
      }))
      .filter((g) => g.rows.length > 0);
  }, [groups, selectedAreas]);

  // ---------- Sales by company ----------
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  type SalesPreset = "today" | "week" | "month" | "custom";
  const [salesPreset, setSalesPreset] = usePersistedState<SalesPreset>("reports:sales:preset", "month");
  const [customFrom, setCustomFrom] = usePersistedState("reports:sales:from", firstOfMonth);
  const [customTo, setCustomTo] = usePersistedState("reports:sales:to", today);
  const [salesCompany, setSalesCompany] = usePersistedState("reports:sales:company", "all");

  const { from, to } = useMemo(() => {
    const t = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (salesPreset === "today") return { from: today, to: today };
    if (salesPreset === "week") {
      const day = t.getDay(); // 0=Sun
      const diff = (day + 6) % 7; // days since Monday
      const mon = new Date(t.getFullYear(), t.getMonth(), t.getDate() - diff);
      return { from: iso(mon), to: today };
    }
    if (salesPreset === "month") return { from: firstOfMonth, to: today };
    return { from: customFrom, to: customTo };
  }, [salesPreset, customFrom, customTo, today, firstOfMonth]);

  // Payment collection date range — defaults to today only
  const [colFrom, setColFrom] = useState(today);
  const [colTo, setColTo] = useState(today);
  const [colCustomer, setColCustomer] = useState("all");
  const [colMethod, setColMethod] = useState("all");
  const [colArea, setColArea] = useState("all");
  const [colSource, setColSource] = useState<"all" | "invoice" | "payment">("all");

  const productMap = useMemo(() => {
    const m = new Map<string, { company: string; name: string; salePrice: number }>();
    for (const p of db.products) {
      m.set(p.id, {
        company: (p.company || "— No company —").trim() || "— No company —",
        name: p.name,
        salePrice: Number(p.salePrice) || 0,
      });
    }
    return m;
  }, [db.products]);

  const salesByCompany = useMemo<SalesCompanyRow[]>(() => {
    const fromTs = new Date(from + "T00:00:00").getTime();
    const toTs = new Date(to + "T23:59:59.999").getTime();
    // company -> productId -> row
    const agg = new Map<string, Map<string, SalesItemRow>>();
    const addQty = (productId: string, qty: number) => {
      const info = productMap.get(productId);
      const company = info?.company || "— No company —";
      const name = info?.name || "Unknown item";
      const salePrice = info?.salePrice || 0;
      if (!agg.has(company)) agg.set(company, new Map());
      const inner = agg.get(company)!;
      const cur = inner.get(productId) || { productId, name, qty: 0, salePrice, total: 0 };
      cur.qty += qty;
      cur.total = cur.qty * salePrice;
      inner.set(productId, cur);
    };
    for (const inv of db.invoices) {
      const t = new Date(inv.date).getTime();
      if (isNaN(t) || t < fromTs || t > toTs) continue;
      for (const it of inv.items) addQty(it.productId, Number(it.qty) || 0);
    }
    for (const r of db.salesReturns) {
      const t = new Date(r.date).getTime();
      if (isNaN(t) || t < fromTs || t > toTs) continue;
      for (const it of r.items) addQty(it.productId, -(Number(it.qty) || 0));
    }
    return Array.from(agg.entries())
      .map(([company, inner]) => {
        const items = Array.from(inner.values())
          .filter((i) => i.qty !== 0)
          .sort((a, b) => b.total - a.total);
        const qty = items.reduce((s, i) => s + i.qty, 0);
        const total = items.reduce((s, i) => s + i.total, 0);
        return { company, qty, total, items };
      })
      .filter((r) => r.items.length > 0)
      .sort((a, b) => b.total - a.total);
  }, [db.invoices, db.salesReturns, productMap, from, to]);

  const salesCompanyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of db.products) set.add((p.company || "— No company —").trim() || "— No company —");
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [db.products]);

  const salesByCompanyFiltered = useMemo(
    () => (salesCompany === "all" ? salesByCompany : salesByCompany.filter((r) => r.company === salesCompany)),
    [salesByCompany, salesCompany],
  );
  const salesGrand = salesByCompanyFiltered.reduce((s, r) => s + r.total, 0);

  // ---------- Payment collection ----------
  const customerAreaMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of db.customers) m.set(c.id, (c.area || "").trim());
    return m;
  }, [db.customers]);

  const collectionAreas = useMemo(() => {
    const set = new Set<string>();
    for (const c of db.customers) {
      const a = (c.area || "").trim();
      if (a) set.add(a);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [db.customers]);

  const collectionRows = useMemo<CollectionRow[]>(() => {
    const fromTs = new Date(colFrom + "T00:00:00").getTime();
    const toTs = new Date(colTo + "T23:59:59.999").getTime();
    type Row = CollectionRow & { customerId: string };
    const payAttached: Row[] = db.payments.map((p) => ({
      id: `pay:${p.id}`,
      date: p.date,
      customerName: p.customerName,
      method: p.method ?? null,
      notes: p.notes ?? null,
      amount: Number(p.amount) || 0,
      source: "payment",
      reference: null,
      customerId: p.customerId,
    }));
    const invAttached: Row[] = db.invoices
      .filter((i) => (Number(i.paid) || 0) > 0)
      .map((i) => ({
        id: `inv:${i.id}`,
        date: i.date,
        customerName: i.customerName,
        method: "Invoice",
        notes: i.notes ?? null,
        amount: Number(i.paid) || 0,
        source: "invoice",
        reference: `INV-${i.number}`,
        customerId: i.customerId,
      }));
    const merged: Row[] = [
      ...(colSource === "invoice" ? [] : payAttached),
      ...(colSource === "payment" ? [] : invAttached),
    ];
    return merged
      .filter((r) => {
        const t = new Date(r.date).getTime();
        if (isNaN(t) || t < fromTs || t > toTs) return false;
        if (colCustomer !== "all" && r.customerId !== colCustomer) return false;
        if (colMethod !== "all" && (r.method || "") !== colMethod) return false;
        if (colArea !== "all" && (customerAreaMap.get(r.customerId) || "") !== colArea) return false;
        return true;
      })
      .map(({ customerId: _c, ...rest }) => rest)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [db.payments, db.invoices, colFrom, colTo, colCustomer, colMethod, colArea, colSource, customerAreaMap]);

  const collectionTotal = collectionRows.reduce((s, r) => s + r.amount, 0);
  const collectionMethods = useMemo(() => {
    const set = new Set<string>();
    for (const p of db.payments) if (p.method) set.add(p.method);
    if (db.invoices.some((i) => (Number(i.paid) || 0) > 0)) set.add("Invoice");
    return Array.from(set).sort();
  }, [db.payments, db.invoices]);

  // ---------- Print trigger ----------
  useEffect(() => {
    if (!printPayload) return;
    const clearPrintPayload = () => setPrintPayload(null);
    window.addEventListener("afterprint", clearPrintPayload, { once: true });
    const id = window.setTimeout(() => {
      window.print();
    }, 100);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("afterprint", clearPrintPayload);
    };
  }, [printPayload]);

  // ---------- Monthly stock by company ----------
  const nowD = new Date();
  const [msYear, setMsYear] = useState(nowD.getFullYear());
  const [msMonth, setMsMonth] = useState(nowD.getMonth() + 1); // 1-12
  const [msCompanyFilter, setMsCompanyFilter] = useState("all");
  const [msSearch, setMsSearch] = useState("");

  const monthlyStockAll = useMemo(
    () => computeMonthlyStock(db, msYear, msMonth),
    [db, msYear, msMonth],
  );

  const msCompanies = useMemo(() => {
    const q = msSearch.trim().toLowerCase();
    let list = monthlyStockAll;
    if (msCompanyFilter !== "all") {
      list = list.filter((c) => c.company === msCompanyFilter);
    }
    if (q) {
      list = list
        .map((c) => ({
          ...c,
          rows: c.rows.filter(
            (r) =>
              r.name.toLowerCase().includes(q) || r.pack.toLowerCase().includes(q),
          ),
        }))
        .filter((c) => c.rows.length > 0);
    }
    return list;
  }, [monthlyStockAll, msCompanyFilter, msSearch]);

  const msMonthLabel = monthLabel(msYear, msMonth);

  // ---------- Quotation (company-wise items & sale price) ----------
  const [quoteCompanyFilter, setQuoteCompanyFilter] = useState("all");
  const [quoteSearch, setQuoteSearch] = useState("");

  const quotationAll = useMemo<QuotationCompany[]>(() => {
    const map = new Map<string, QuotationItem[]>();
    for (const p of db.products) {
      const company = (p.company || "— No company —").trim() || "— No company —";
      if (!map.has(company)) map.set(company, []);
      map.get(company)!.push({
        productId: p.id,
        name: p.name,
        pack: p.pack || "",
        salePrice: Number(p.salePrice) || 0,
      });
    }
    return Array.from(map.entries())
      .map(([company, rows]) => ({
        company,
        rows: rows.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.company.localeCompare(b.company));
  }, [db.products]);

  const quotationCompanies = useMemo(() => {
    const q = quoteSearch.trim().toLowerCase();
    let list = quotationAll;
    if (quoteCompanyFilter !== "all") {
      list = list.filter((c) => c.company === quoteCompanyFilter);
    }
    if (q) {
      list = list
        .map((c) => ({
          ...c,
          rows: c.rows.filter(
            (r) => r.name.toLowerCase().includes(q) || r.pack.toLowerCase().includes(q),
          ),
        }))
        .filter((c) => c.rows.length > 0);
    }
    return list;
  }, [quotationAll, quoteCompanyFilter, quoteSearch]);

  return (
    <>
      <PageHeader title="Reports" subtitle="Outstanding & sales analysis" />
      <div className="p-8 space-y-6 print:hidden">
        <Tabs defaultValue="area">
          <TabsList>
            <TabsTrigger value="area">Outstanding by Area</TabsTrigger>
            <TabsTrigger value="collection">Payment Collection</TabsTrigger>
            <TabsTrigger value="sales">Sales by Company</TabsTrigger>
            <TabsTrigger value="monthly-stock">Monthly Stock</TabsTrigger>
            <TabsTrigger value="quotation">Quotation</TabsTrigger>
          </TabsList>

          {/* ---------------- AREA TAB ---------------- */}
          <TabsContent value="area" className="space-y-4">
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm font-medium">Filter by area</div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedAreas(new Set(allAreaNames))}
                  >
                    Select all
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedAreas(new Set())}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPrintPayload({ kind: "area-all", groups: filteredGroups, filter: "" })
                    }
                    disabled={filteredGroups.length === 0}
                  >
                    <Printer className="mr-1.5 h-4 w-4" /> Print all
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {allAreaNames.map((a) => (
                  <label
                    key={a}
                    className="flex items-center gap-2 text-sm cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={selectedAreas.has(a)}
                      onChange={() => toggleArea(a)}
                    />
                    <span>{a}</span>
                  </label>
                ))}
                {allAreaNames.length === 0 && (
                  <span className="text-xs text-muted-foreground">No areas yet.</span>
                )}
              </div>
            </Card>

            {filteredGroups.length === 0 && (
              <Card className="p-6 text-sm text-muted-foreground">No customers.</Card>
            )}

            <div className="space-y-4">
              {filteredGroups.map((g) => {
                const subtotal = g.rows.reduce((s, r) => s + r.balance, 0);
                return (
                  <Card key={g.area} className="p-5">
                    <div className="flex items-center justify-between mb-3 gap-3">
                      <div>
                        <h3 className="font-semibold">{g.area}</h3>
                        <p className="text-xs text-muted-foreground">
                          {g.rows.length} customers · Outstanding {fmt(subtotal)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => setPrintPayload({ kind: "area", group: g })}
                      >
                        <Printer /> Print
                      </Button>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="text-left text-muted-foreground">
                        <tr>
                          <th className="py-2">Customer</th>
                          <th>Phone</th>
                          <th className="text-right">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r) => (
                          <tr key={r.id} className="border-t border-border">
                            <td className="py-2">{r.name}</td>
                            <td className="text-muted-foreground">{r.phone || "—"}</td>
                            <td className="text-right tabular-nums">{fmt(r.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ---------------- COLLECTION TAB ---------------- */}
          <TabsContent value="collection" className="space-y-4">
            <Card className="p-5 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">From</label>
                  <Input type="date" value={colFrom} onChange={(e) => setColFrom(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">To</label>
                  <Input type="date" value={colTo} onChange={(e) => setColTo(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setColFrom(today); setColTo(today); }}>Today</Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    const d = new Date(); d.setDate(d.getDate() - 6);
                    setColFrom(d.toISOString().slice(0, 10)); setColTo(today);
                  }}>Last 7 days</Button>
                  <Button variant="outline" size="sm" onClick={() => { setColFrom(firstOfMonth); setColTo(today); }}>This month</Button>
                </div>
                <div className="min-w-[180px]">
                  <label className="text-xs text-muted-foreground block mb-1">Customer</label>
                  <select
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                    value={colCustomer}
                    onChange={(e) => setColCustomer(e.target.value)}
                  >
                    <option value="all">All customers</option>
                    {db.customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[140px]">
                  <label className="text-xs text-muted-foreground block mb-1">Area</label>
                  <select
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                    value={colArea}
                    onChange={(e) => setColArea(e.target.value)}
                  >
                    <option value="all">All areas</option>
                    {collectionAreas.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[140px]">
                  <label className="text-xs text-muted-foreground block mb-1">Method</label>
                  <select
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                    value={colMethod}
                    onChange={(e) => setColMethod(e.target.value)}
                  >
                    <option value="all">All methods</option>
                    {collectionMethods.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[160px]">
                  <label className="text-xs text-muted-foreground block mb-1">Source</label>
                  <select
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                    value={colSource}
                    onChange={(e) => setColSource(e.target.value as "all" | "invoice" | "payment")}
                  >
                    <option value="all">All payments</option>
                    <option value="invoice">Invoice payment</option>
                    <option value="payment">Recorded payment</option>
                  </select>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <div className="text-sm text-muted-foreground">
                    Total: <span className="font-semibold text-foreground">{fmt(collectionTotal)}</span>
                  </div>
                  <Button
                    onClick={() =>
                      setPrintPayload({ kind: "collection", from: colFrom, to: colTo, area: colArea === "all" ? null : colArea, rows: collectionRows })
                    }
                    disabled={collectionRows.length === 0}
                  >
                    <Printer className="mr-2 h-4 w-4" /> Print
                  </Button>
                </div>
              </div>

              {collectionRows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  No payments collected in this range.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 px-2">Date</th>
                      <th className="text-left py-2 px-2">Customer</th>
                      <th className="text-left py-2 px-2">Source</th>
                      <th className="text-left py-2 px-2">Method</th>
                      <th className="text-left py-2 px-2">Notes</th>
                      <th className="text-right py-2 px-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collectionRows.map((r) => (
                      <tr key={r.id} className="border-b">
                        <td className="py-2 px-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                        <td className="py-2 px-2">{r.customerName}</td>
                        <td className="py-2 px-2">
                          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${r.source === "invoice" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {r.source === "invoice" ? (r.reference || "Invoice") : "Payment"}
                          </span>
                        </td>
                        <td className="py-2 px-2">{r.method || "—"}</td>
                        <td className="py-2 px-2 text-muted-foreground">{r.notes || ""}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmt(r.amount)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold border-t-2">
                      <td colSpan={5} className="py-2 px-2 text-right">Total</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(collectionTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </Card>
          </TabsContent>

          {/* ---------------- SALES TAB ---------------- */}
          <TabsContent value="sales" className="space-y-4">
            <Card className="p-5 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-wrap gap-2">
                  {([
                    { k: "today", l: "Today" },
                    { k: "week", l: "This week" },
                    { k: "month", l: "This month" },
                    { k: "custom", l: "Custom" },
                  ] as { k: SalesPreset; l: string }[]).map((p) => (
                    <Button
                      key={p.k}
                      size="sm"
                      variant={salesPreset === p.k ? "default" : "outline"}
                      onClick={() => setSalesPreset(p.k)}
                    >
                      {p.l}
                    </Button>
                  ))}
                </div>
                {salesPreset === "custom" && (
                  <>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">From</label>
                      <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">To</label>
                      <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                    </div>
                  </>
                )}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Company</label>
                  <select
                    value={salesCompany}
                    onChange={(e) => setSalesCompany(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="all">All companies</option>
                    {salesCompanyOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {from} → {to} · Total: <span className="font-semibold text-foreground">{fmt(salesGrand)}</span>
                  </span>
                  <Button
                    onClick={() =>
                      setPrintPayload({ kind: "sales-company", from, to, rows: salesByCompanyFiltered })
                    }
                    disabled={salesByCompanyFiltered.length === 0}
                  >
                    <Printer /> Print
                  </Button>
                </div>
              </div>

              {salesByCompanyFiltered.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales in this range.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2">Company / Item</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Sale price</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesByCompanyFiltered.map((r) => (
                      <Fragment key={r.company}>
                        <tr className="border-t border-border bg-secondary/40 font-semibold">
                          <td className="py-2">{r.company}</td>
                          <td className="text-right tabular-nums">{r.qty}</td>
                          <td></td>
                          <td className="text-right tabular-nums">{fmt(r.total)}</td>
                        </tr>
                        {r.items.map((it) => (
                          <tr key={it.productId} className="border-t border-border">
                            <td className="py-2 pl-6 text-muted-foreground">{it.name}</td>
                            <td className="text-right tabular-nums">{it.qty}</td>
                            <td className="text-right tabular-nums">{fmt(it.salePrice)}</td>
                            <td className="text-right tabular-nums">{fmt(it.total)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="py-2">Grand total</td>
                      <td className="text-right tabular-nums">
                        {salesByCompanyFiltered.reduce((s, r) => s + r.qty, 0)}
                      </td>
                      <td></td>
                      <td className="text-right tabular-nums">{fmt(salesGrand)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </Card>
          </TabsContent>

          {/* ---------------- MONTHLY STOCK TAB ---------------- */}
          <TabsContent value="monthly-stock" className="space-y-4">
            <Card className="p-5 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Month</label>
                  <Input
                    type="month"
                    value={`${msYear}-${String(msMonth).padStart(2, "0")}`}
                    onChange={(e) => {
                      const [y, m] = e.target.value.split("-").map(Number);
                      if (y && m) {
                        setMsYear(y);
                        setMsMonth(m);
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Company</label>
                  <select
                    value={msCompanyFilter}
                    onChange={(e) => setMsCompanyFilter(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="all">All companies</option>
                    {monthlyStockAll.map((c) => (
                      <option key={c.company} value={c.company}>
                        {c.company}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="relative flex-1 min-w-[200px]">
                  <label className="text-xs text-muted-foreground block mb-1">Search product</label>
                  <Search className="size-4 absolute left-3 top-[34px] text-muted-foreground" />
                  <Input
                    value={msSearch}
                    onChange={(e) => setMsSearch(e.target.value)}
                    placeholder="Filter products…"
                    className="pl-9"
                  />
                </div>
                <Button
                  onClick={() =>
                    setPrintPayload({
                      kind: "monthly-stock",
                      monthLabel: msMonthLabel,
                      companies: msCompanies,
                    })
                  }
                  disabled={msCompanies.length === 0}
                >
                  <Printer /> Print all companies
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Opening = stock at start of {msMonthLabel}. Purchases & Sales are net of returns.
                Closing = Opening + Purchases − Sales. Assumes no manual stock adjustments after
                the period.
              </p>

              {msCompanies.length === 0 ? (
                <p className="text-sm text-muted-foreground">No products for this filter.</p>
              ) : (
                <div className="space-y-4">
                  {msCompanies.map((c) => (
                    <div key={c.company} className="border border-border rounded-md">
                      <div className="flex items-center justify-between gap-3 p-3 bg-secondary/40 border-b border-border">
                        <div>
                          <h3 className="font-semibold">{c.company}</h3>
                          <p className="text-xs text-muted-foreground">
                            {c.rows.length} products · Opening {c.totals.opening} · Purchased{" "}
                            {c.totals.purchased} · Sold {c.totals.sold} · Closing{" "}
                            {c.totals.closing}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() =>
                            setPrintPayload({
                              kind: "monthly-stock",
                              monthLabel: msMonthLabel,
                              companies: [c],
                            })
                          }
                        >
                          <Printer /> Print
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-muted-foreground">
                            <tr>
                              <th className="py-2 px-3">Product</th>
                              <th className="px-3">Pack</th>
                              <th className="px-3 text-right">Opening</th>
                              <th className="px-3 text-right">Purchased</th>
                              <th className="px-3 text-right">Sold</th>
                              <th className="px-3 text-right">Closing</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.rows.map((r) => (
                              <tr key={r.productId} className="border-t border-border">
                                <td className="py-2 px-3">{r.name}</td>
                                <td className="px-3 text-muted-foreground">{r.pack || "—"}</td>
                                <td className="px-3 text-right tabular-nums">{r.opening}</td>
                                <td className="px-3 text-right tabular-nums">{r.purchased}</td>
                                <td className="px-3 text-right tabular-nums">{r.sold}</td>
                                <td className="px-3 text-right tabular-nums font-medium">
                                  {r.closing}
                                </td>
                              </tr>
                            ))}
                            <tr className="border-t-2 border-border font-semibold bg-secondary/30">
                              <td className="py-2 px-3" colSpan={2}>
                                Total
                              </td>
                              <td className="px-3 text-right tabular-nums">{c.totals.opening}</td>
                              <td className="px-3 text-right tabular-nums">
                                {c.totals.purchased}
                              </td>
                              <td className="px-3 text-right tabular-nums">{c.totals.sold}</td>
                              <td className="px-3 text-right tabular-nums">{c.totals.closing}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ---------------- QUOTATION TAB ---------------- */}
          <TabsContent value="quotation" className="space-y-4">
            <Card className="p-5 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Company</label>
                  <select
                    value={quoteCompanyFilter}
                    onChange={(e) => setQuoteCompanyFilter(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="all">All companies</option>
                    {quotationAll.map((c) => (
                      <option key={c.company} value={c.company}>{c.company}</option>
                    ))}
                  </select>
                </div>
                <div className="relative flex-1 min-w-[200px]">
                  <label className="text-xs text-muted-foreground block mb-1">Search product</label>
                  <Search className="size-4 absolute left-3 top-[34px] text-muted-foreground" />
                  <Input
                    value={quoteSearch}
                    onChange={(e) => setQuoteSearch(e.target.value)}
                    placeholder="Filter products…"
                    className="pl-9"
                  />
                </div>
                <Button
                  onClick={() => setPrintPayload({ kind: "quotation", companies: quotationCompanies })}
                  disabled={quotationCompanies.length === 0}
                >
                  <Printer /> Print
                </Button>
              </div>

              {quotationCompanies.length === 0 ? (
                <p className="text-sm text-muted-foreground">No products for this filter.</p>
              ) : (
                <div className="space-y-4">
                  {quotationCompanies.map((c) => (
                    <div key={c.company} className="border border-border rounded-md">
                      <div className="flex items-center justify-between gap-3 p-3 bg-secondary/40 border-b border-border">
                        <div>
                          <h3 className="font-semibold">{c.company}</h3>
                          <p className="text-xs text-muted-foreground">{c.rows.length} products</p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => setPrintPayload({ kind: "quotation", companies: [c] })}
                        >
                          <Printer /> Print
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-muted-foreground">
                            <tr>
                              <th className="py-2 px-3">Product</th>
                              <th className="px-3">Pack</th>
                              <th className="px-3 text-right">Sale price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.rows.map((r) => (
                              <tr key={r.productId} className="border-t border-border">
                                <td className="py-2 px-3">{r.name}</td>
                                <td className="px-3 text-muted-foreground">{r.pack || "—"}</td>
                                <td className="px-3 text-right tabular-nums">{fmt(r.salePrice)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ---------------- PRINT AREA ---------------- */}
      {printPayload && typeof document !== "undefined" &&
        createPortal(
          <div className="print-area hidden print:block">
          <PrintContent payload={printPayload} company={db.company} />
          </div>,
          document.body,
        )}
    </>
  );
}

function PrintContent({
  payload,
  company,
}: {
  payload: PrintPayload;
  company: { name: string; address: string; phone: string };
}) {
  if (payload.kind === "area") {
    return <AreaSheet group={payload.group} company={company} />;
  }
  if (payload.kind === "area-all") {
    return (
      <>
        {payload.groups.map((g, i) => (
          <div key={g.area} style={{ pageBreakAfter: i === payload.groups.length - 1 ? "auto" : "always" }}>
            <AreaSheet group={g} company={company} />
          </div>
        ))}
      </>
    );
  }
  if (payload.kind === "monthly-stock") {
    return (
      <>
        {payload.companies.map((c, i) => (
          <div
            key={c.company}
            style={{ pageBreakAfter: i === payload.companies.length - 1 ? "auto" : "always" }}
          >
            <MonthlyStockSheet company={company} data={c} monthLabel={payload.monthLabel} />
          </div>
        ))}
      </>
    );
  }
  if (payload.kind === "collection") {
    return <CollectionSheet payload={payload} company={company} />;
  }
  if (payload.kind === "quotation") {
    return <QuotationSheet companies={payload.companies} company={company} />;
  }
  // sales-company
  const total = payload.rows.reduce((s, r) => s + r.total, 0);
  const qty = payload.rows.reduce((s, r) => s + r.qty, 0);
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#000", padding: "4mm" }}>
      <PrintHeader title="Sales by Company" company={company} />
      <p style={{ fontSize: 12, margin: "4px 0 12px" }}>
        Date range: <strong>{payload.from}</strong> to <strong>{payload.to}</strong>
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: "1.5px solid #000" }}>
            <th style={{ textAlign: "left", padding: "6px 4px" }}>Company / Item</th>
            <th style={{ textAlign: "right", padding: "6px 4px", width: "10%" }}>Qty</th>
            <th style={{ textAlign: "right", padding: "6px 4px", width: "15%" }}>Sale price</th>
            <th style={{ textAlign: "right", padding: "6px 4px", width: "18%" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {payload.rows.map((r) => (
            <Fragment key={r.company}>
              <tr style={{ background: "#eee", fontWeight: 700, borderBottom: "1px solid #000" }}>
                <td style={{ padding: "5px 4px" }}>{r.company}</td>
                <td style={{ padding: "5px 4px", textAlign: "right" }}>{r.qty}</td>
                <td></td>
                <td style={{ padding: "5px 4px", textAlign: "right" }}>{fmt(r.total)}</td>
              </tr>
              {r.items.map((it) => (
                <tr key={it.productId} style={{ borderBottom: "1px solid #ddd" }}>
                  <td style={{ padding: "4px 4px 4px 16px" }}>{it.name}</td>
                  <td style={{ padding: "4px", textAlign: "right" }}>{it.qty}</td>
                  <td style={{ padding: "4px", textAlign: "right" }}>{fmt(it.salePrice)}</td>
                  <td style={{ padding: "4px", textAlign: "right" }}>{fmt(it.total)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
          <tr style={{ borderTop: "1.5px solid #000", fontWeight: 700 }}>
            <td style={{ padding: "6px 4px" }}>Grand total</td>
            <td style={{ padding: "6px 4px", textAlign: "right" }}>{qty}</td>
            <td></td>
            <td style={{ padding: "6px 4px", textAlign: "right" }}>{fmt(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function AreaSheet({
  group,
  company,
}: {
  group: AreaGroup;
  company: { name: string; address: string; phone: string };
}) {
  const subtotal = group.rows.reduce((s, r) => s + r.balance, 0);
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#000", padding: "4mm" }}>
      <PrintHeader title="Outstanding Report" company={company} />
      <p style={{ fontSize: 13, margin: "4px 0 12px" }}>
        Area: <strong>{group.area}</strong> · {group.rows.length} customers
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1.5px solid #000" }}>
            <th style={{ textAlign: "left", padding: "6px 4px", width: "6%" }}>#</th>
            <th style={{ textAlign: "left", padding: "6px 4px" }}>Customer</th>
            <th style={{ textAlign: "left", padding: "6px 4px" }}>Phone</th>
            <th style={{ textAlign: "right", padding: "6px 4px", width: "18%" }}>Outstanding</th>
            <th style={{ textAlign: "right", padding: "6px 4px", width: "22%" }}>Payment received</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((r, i) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: "5px 4px" }}>{i + 1}</td>
              <td style={{ padding: "5px 4px" }}>{r.name}</td>
              <td style={{ padding: "5px 4px" }}>{r.phone || "—"}</td>
              <td style={{ padding: "5px 4px", textAlign: "right" }}>{fmt(r.balance)}</td>
              <td style={{ padding: "5px 4px", height: 26, borderLeft: "1px solid #bbb" }}></td>
            </tr>
          ))}
          <tr style={{ borderTop: "1.5px solid #000", fontWeight: 700 }}>
            <td colSpan={3} style={{ padding: "6px 4px", textAlign: "right" }}>
              Total
            </td>
            <td style={{ padding: "6px 4px", textAlign: "right" }}>{fmt(subtotal)}</td>
            <td style={{ padding: "6px 4px", borderLeft: "1px solid #bbb" }}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PrintHeader({
  title,
  company,
}: {
  title: string;
  company: { name: string; address: string; phone: string };
}) {
  return (
    <div style={{ borderBottom: "2px solid #000", paddingBottom: 8, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{company.name}</div>
          <div style={{ fontSize: 11 }}>
            {company.address}
            {company.phone ? ` · ${company.phone}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 10 }}>Printed: {fmtDateTime(new Date())}</div>
        </div>
      </div>
    </div>
  );
}

function MonthlyStockSheet({
  company,
  data,
  monthLabel,
}: {
  company: { name: string; address: string; phone: string };
  data: MonthlyStockCompany;
  monthLabel: string;
}) {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#000", padding: "4mm" }}>
      <PrintHeader title={`Stock Statement — ${monthLabel}`} company={company} />
      <p style={{ fontSize: 13, margin: "4px 0 12px" }}>
        Company: <strong>{data.company}</strong> · {data.rows.length} products
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: "1.5px solid #000" }}>
            <th style={{ textAlign: "left", padding: "6px 4px", width: "5%" }}>#</th>
            <th style={{ textAlign: "left", padding: "6px 4px" }}>Product</th>
            <th style={{ textAlign: "left", padding: "6px 4px", width: "14%" }}>Pack</th>
            <th style={{ textAlign: "right", padding: "6px 4px", width: "11%" }}>Opening</th>
            <th style={{ textAlign: "right", padding: "6px 4px", width: "12%" }}>Purchased</th>
            <th style={{ textAlign: "right", padding: "6px 4px", width: "11%" }}>Sold</th>
            <th style={{ textAlign: "right", padding: "6px 4px", width: "12%" }}>Closing</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={r.productId} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: "4px" }}>{i + 1}</td>
              <td style={{ padding: "4px" }}>{r.name}</td>
              <td style={{ padding: "4px" }}>{r.pack || "—"}</td>
              <td style={{ padding: "4px", textAlign: "right" }}>{r.opening}</td>
              <td style={{ padding: "4px", textAlign: "right" }}>{r.purchased}</td>
              <td style={{ padding: "4px", textAlign: "right" }}>{r.sold}</td>
              <td style={{ padding: "4px", textAlign: "right", fontWeight: 600 }}>
                {r.closing}
              </td>
            </tr>
          ))}
          <tr style={{ borderTop: "1.5px solid #000", fontWeight: 700 }}>
            <td colSpan={3} style={{ padding: "6px 4px", textAlign: "right" }}>
              Total
            </td>
            <td style={{ padding: "6px 4px", textAlign: "right" }}>{data.totals.opening}</td>
            <td style={{ padding: "6px 4px", textAlign: "right" }}>{data.totals.purchased}</td>
            <td style={{ padding: "6px 4px", textAlign: "right" }}>{data.totals.sold}</td>
            <td style={{ padding: "6px 4px", textAlign: "right" }}>{data.totals.closing}</td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: 9, marginTop: 16, color: "#555" }}>
        Opening = stock at start of {monthLabel}. Purchases & Sales are net of returns. Closing
        = Opening + Purchases − Sales.
      </p>
    </div>
  );
}

function CollectionSheet({
  payload,
  company,
}: {
  payload: { from: string; to: string; area: string | null; rows: CollectionRow[] };
  company: { name: string; address: string; phone: string };
}) {
  const total = payload.rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#000", padding: "4mm" }}>
      <PrintHeader title="Payment Collection" company={company} />
      <p style={{ fontSize: 12, margin: "4px 0 12px" }}>
        {payload.area && (<>Area: <strong>{payload.area}</strong> · </>)}
        Date range: <strong>{payload.from}</strong> to <strong>{payload.to}</strong> · {payload.rows.length} payments
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: "1.5px solid #000" }}>
            <th style={{ textAlign: "left", padding: "6px 4px", width: "5%" }}>#</th>
            <th style={{ textAlign: "left", padding: "6px 4px", width: "12%" }}>Date</th>
            <th style={{ textAlign: "left", padding: "6px 4px" }}>Customer</th>
            <th style={{ textAlign: "left", padding: "6px 4px", width: "14%" }}>Source</th>
            <th style={{ textAlign: "left", padding: "6px 4px", width: "12%" }}>Method</th>
            <th style={{ textAlign: "left", padding: "6px 4px" }}>Notes</th>
            <th style={{ textAlign: "right", padding: "6px 4px", width: "12%" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {payload.rows.map((r, i) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: "5px 4px" }}>{i + 1}</td>
              <td style={{ padding: "5px 4px" }}>{fmtDate(r.date)}</td>
              <td style={{ padding: "5px 4px" }}>{r.customerName}</td>
              <td style={{ padding: "5px 4px" }}>{r.source === "invoice" ? (r.reference || "Invoice") : "Payment"}</td>
              <td style={{ padding: "5px 4px" }}>{r.method || "—"}</td>
              <td style={{ padding: "5px 4px" }}>{r.notes || ""}</td>
              <td style={{ padding: "5px 4px", textAlign: "right" }}>{fmt(r.amount)}</td>
            </tr>
          ))}
          <tr style={{ borderTop: "1.5px solid #000", fontWeight: 700 }}>
            <td colSpan={6} style={{ padding: "6px 4px", textAlign: "right" }}>Total collected</td>
            <td style={{ padding: "6px 4px", textAlign: "right" }}>{fmt(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function QuotationSheet({
  companies,
  company,
}: {
  companies: QuotationCompany[];
  company: { name: string; address: string; phone: string };
}) {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#000", padding: "4mm" }}>
      <PrintHeader title="Quotation — Price List" company={company} />
      {companies.map((c, idx) => (
        <div
          key={c.company}
          style={{ pageBreakAfter: idx === companies.length - 1 ? "auto" : "always", marginBottom: 16 }}
        >
          <p style={{ fontSize: 13, margin: "4px 0 8px" }}>
            Company: <strong>{c.company}</strong> · {c.rows.length} products
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "1.5px solid #000" }}>
                <th style={{ textAlign: "left", padding: "6px 4px", width: "5%" }}>#</th>
                <th style={{ textAlign: "left", padding: "6px 4px" }}>Product</th>
                <th style={{ textAlign: "left", padding: "6px 4px", width: "20%" }}>Pack</th>
                <th style={{ textAlign: "right", padding: "6px 4px", width: "18%" }}>Sale price</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r, i) => (
                <tr key={r.productId} style={{ borderBottom: "1px solid #ddd" }}>
                  <td style={{ padding: "4px" }}>{i + 1}</td>
                  <td style={{ padding: "4px" }}>{r.name}</td>
                  <td style={{ padding: "4px" }}>{r.pack || "—"}</td>
                  <td style={{ padding: "4px", textAlign: "right" }}>{fmt(r.salePrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

