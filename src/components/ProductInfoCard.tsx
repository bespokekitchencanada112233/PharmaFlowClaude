import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import { fmt, fmtDate } from "@/lib/store";
import type { Product } from "@/lib/types";

export interface ProductInfoRecent {
  id: string;
  number: number;
  date: string;
  qty: number;
  price: number;
  numberPrefix?: string; // e.g. "INV-", "PUR-"
}

interface Props {
  product: Product | null;
  show: boolean;
  onToggle: () => void;
  /** Title for the recent section, e.g. "Last 3 invoices · this customer" */
  recentTitle: string;
  /** Last 3 lines (already filtered). */
  recent: ProductInfoRecent[];
  /** When party (customer/supplier) is not selected. */
  noPartyMessage: string;
  partySelected: boolean;
  /** Empty state when product not yet picked. */
  emptyMessage?: string;
}

export function ProductInfoCard({
  product,
  show,
  onToggle,
  recentTitle,
  recent,
  noPartyMessage,
  partySelected,
  emptyMessage = "Click a product row to see stock, cost and recent prices.",
}: Props) {
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">Product info</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onToggle}
          title={show ? "Hide product info" : "Show product info"}
        >
          {show ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      {!show ? (
        <p className="text-xs text-muted-foreground">Product info hidden.</p>
      ) : !product ? (
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <>
          <div className="text-sm font-medium">{product.name}</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Qty on hand</div>
              <div
                className={`text-base font-semibold tabular-nums ${
                  product.stock <= 0
                    ? "text-destructive"
                    : product.stock <= product.lowStockThreshold
                      ? "text-warning"
                      : ""
                }`}
              >
                {product.stock}
              </div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Cost</div>
              <div className="text-base font-semibold tabular-nums">{fmt(product.purchasePrice)}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Sale</div>
              <div className="text-base font-semibold tabular-nums">{fmt(product.salePrice)}</div>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-muted-foreground mb-1">{recentTitle}</div>
            {!partySelected ? (
              <p className="text-xs text-muted-foreground">{noPartyMessage}</p>
            ) : recent.length === 0 ? (
              <p className="text-xs text-muted-foreground">No prior records.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left font-normal py-0.5">Date</th>
                    <th className="text-left font-normal">#</th>
                    <th className="text-right font-normal">Qty</th>
                    <th className="text-right font-normal">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-1">{fmtDate(r.date)}</td>
                      <td>{r.numberPrefix ?? "#"}{r.number}</td>
                      <td className="text-right tabular-nums">{r.qty}</td>
                      <td className="text-right tabular-nums">{fmt(r.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
