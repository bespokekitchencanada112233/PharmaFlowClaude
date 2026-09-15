import type { DBShape, Invoice, Product } from "./types";
import { inRange, type DateRangeValue } from "@/components/DateRangeFilter";

export type InvoiceProfit = {
  id: string;
  number: number;
  date: string;
  customerName: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number; // 0..1
};

export type CompanyProfit = {
  company: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
};

export type ProfitTotals = {
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
};

const UNBRANDED = "Unbranded";

function costOf(p: Product | undefined): number {
  return Number(p?.purchasePrice ?? 0);
}

function lineRevenue(qty: number, price: number) {
  return Number(qty) * Number(price);
}

function lineCost(qty: number, p: Product | undefined) {
  return Number(qty) * costOf(p);
}

export function computeProfit(db: DBShape, range: DateRangeValue) {
  const productMap = new Map(db.products.map((p) => [p.id, p]));
  const invoiceRows: InvoiceProfit[] = [];
  const byCompany = new Map<string, CompanyProfit>();
  const bump = (
    key: string,
    units: number,
    revenue: number,
    cost: number,
  ) => {
    const cur =
      byCompany.get(key) ?? {
        company: key,
        units: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: 0,
      };
    cur.units += units;
    cur.revenue += revenue;
    cur.cost += cost;
    cur.profit = cur.revenue - cur.cost;
    cur.margin = cur.revenue > 0 ? cur.profit / cur.revenue : 0;
    byCompany.set(key, cur);
  };

  const consider = (
    items: Invoice["items"],
    sign: 1 | -1,
  ): { revenue: number; cost: number } => {
    let rev = 0;
    let cst = 0;
    for (const it of items) {
      const p = productMap.get(it.productId);
      const r = lineRevenue(it.qty, it.price) * sign;
      const c = lineCost(it.qty, p) * sign;
      rev += r;
      cst += c;
      const key = (p?.company || "").trim() || UNBRANDED;
      bump(key, Number(it.qty) * sign, r, c);
    }
    return { revenue: rev, cost: cst };
  };

  for (const inv of db.invoices) {
    if (!inRange(inv.date, range)) continue;
    const { revenue, cost } = consider(inv.items, 1);
    const profit = revenue - cost;
    invoiceRows.push({
      id: inv.id,
      number: inv.number,
      date: inv.date,
      customerName: inv.customerName,
      revenue,
      cost,
      profit,
      margin: revenue > 0 ? profit / revenue : 0,
    });
  }

  for (const ret of db.salesReturns) {
    if (!inRange(ret.date, range)) continue;
    consider(ret.items, -1);
  }

  const totals: ProfitTotals = { revenue: 0, cost: 0, profit: 0, margin: 0 };
  for (const r of invoiceRows) {
    totals.revenue += r.revenue;
    totals.cost += r.cost;
  }
  // subtract returns from totals
  for (const ret of db.salesReturns) {
    if (!inRange(ret.date, range)) continue;
    for (const it of ret.items) {
      const p = productMap.get(it.productId);
      totals.revenue -= lineRevenue(it.qty, it.price);
      totals.cost -= lineCost(it.qty, p);
    }
  }
  totals.profit = totals.revenue - totals.cost;
  totals.margin = totals.revenue > 0 ? totals.profit / totals.revenue : 0;

  const companyRows = Array.from(byCompany.values()).sort(
    (a, b) => b.profit - a.profit,
  );
  invoiceRows.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  return { totals, companyRows, invoiceRows };
}

export async function hashPin(pin: string, userId: string): Promise<string> {
  const enc = new TextEncoder().encode(`${pin}::${userId}`);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const PIN_SESSION_KEY = "profit_pin_unlocked_v1";
