import type { DBShape } from "@/lib/types";

export interface MonthlyStockRow {
  productId: string;
  name: string;
  pack: string;
  opening: number;
  purchased: number; // net (purchases - purchase returns)
  sold: number; // net (sales - sales returns)
  closing: number;
}

export interface MonthlyStockCompany {
  company: string;
  rows: MonthlyStockRow[];
  totals: { opening: number; purchased: number; sold: number; closing: number };
}

// year (e.g. 2026), month (1-12)
export function computeMonthlyStock(
  db: DBShape,
  year: number,
  month: number,
): MonthlyStockCompany[] {
  const monthStart = new Date(year, month - 1, 1).getTime();
  const monthEnd = new Date(year, month, 1).getTime(); // exclusive (start of next month)

  // per product: in-month purchased(net), in-month sold(net), and net movement AFTER month end
  type Acc = { purchasedIn: number; soldIn: number; afterDelta: number };
  const acc = new Map<string, Acc>();
  const get = (id: string): Acc => {
    let a = acc.get(id);
    if (!a) {
      a = { purchasedIn: 0, soldIn: 0, afterDelta: 0 };
      acc.set(id, a);
    }
    return a;
  };

  const apply = (
    dateStr: string,
    items: { productId: string; qty: number }[],
    stockDelta: 1 | -1, // +1 = adds to stock (purchase / sales return), -1 = reduces stock (sale / purchase return)
    bucket: "purchase" | "sale",
  ) => {
    const t = new Date(dateStr).getTime();
    if (isNaN(t)) return;
    const inMonth = t >= monthStart && t < monthEnd;
    const afterMonth = t >= monthEnd;
    for (const it of items) {
      const qty = Number(it.qty) || 0;
      if (!qty) continue;
      const a = get(it.productId);
      if (inMonth) {
        if (bucket === "purchase") a.purchasedIn += stockDelta * qty;
        else a.soldIn += -stockDelta * qty; // sold(net) is positive when stock leaves
      }
      if (afterMonth) {
        a.afterDelta += stockDelta * qty;
      }
    }
  };

  for (const p of db.purchases) apply(p.date, p.items, +1, "purchase");
  for (const r of db.purchaseReturns) apply(r.date, r.items, -1, "purchase");
  for (const inv of db.invoices) apply(inv.date, inv.items, -1, "sale");
  for (const r of db.salesReturns) apply(r.date, r.items, +1, "sale");

  // group products by company
  const byCompany = new Map<string, MonthlyStockRow[]>();
  for (const p of db.products) {
    const a = acc.get(p.id) ?? { purchasedIn: 0, soldIn: 0, afterDelta: 0 };
    const current = Number(p.stock) || 0;
    // closing at end of month = current - afterDelta
    const closing = current - a.afterDelta;
    // opening = closing - purchasedIn + soldIn
    const opening = closing - a.purchasedIn + a.soldIn;
    const company = (p.company || "— No company —").trim() || "— No company —";
    const row: MonthlyStockRow = {
      productId: p.id,
      name: p.name,
      pack: p.pack || "",
      opening,
      purchased: a.purchasedIn,
      sold: a.soldIn,
      closing,
    };
    if (!byCompany.has(company)) byCompany.set(company, []);
    byCompany.get(company)!.push(row);
  }

  const out: MonthlyStockCompany[] = [];
  for (const [company, rows] of byCompany) {
    rows.sort((a, b) => a.name.localeCompare(b.name));
    const totals = rows.reduce(
      (s, r) => ({
        opening: s.opening + r.opening,
        purchased: s.purchased + r.purchased,
        sold: s.sold + r.sold,
        closing: s.closing + r.closing,
      }),
      { opening: 0, purchased: 0, sold: 0, closing: 0 },
    );
    out.push({ company, rows, totals });
  }
  out.sort((a, b) => a.company.localeCompare(b.company));
  return out;
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}
