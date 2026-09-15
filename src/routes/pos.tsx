import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, fmt } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Zap, Trash2, Printer, X } from "lucide-react";
import type { Product } from "@/lib/types";
import { toast } from "sonner";
import {
  ProductCombobox,
  type ProductComboboxHandle,
} from "@/components/ProductCombobox";

export const Route = createFileRoute("/pos")({
  component: POSPage,
});

const WALKIN_NAME = "Walk-in Customer";

interface CartItem {
  productId: string;
  productName: string;
  qty: number;
  price: number;
  stock: number;
}

function POSPage() {
  const { db, addCustomer, createInvoice } = useStore();
  const navigate = useNavigate();

  const [items, setItems] = useState<CartItem[]>([]);
  const [received, setReceived] = useState<string>("");
  const productRef = useRef<ProductComboboxHandle>(null);
  const receivedRef = useRef<HTMLInputElement>(null);

  const total = useMemo(
    () => items.reduce((s, it) => s + it.qty * it.price, 0),
    [items],
  );

  useEffect(() => {
    setReceived(total.toString());
  }, [total]);

  const recv = parseFloat(received) || 0;
  const change = Math.max(recv - total, 0);

  const excludeIds = useMemo(() => items.map((i) => i.productId), [items]);

  function addProduct(p: Product) {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === p.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === p.id ? { ...i, qty: i.qty + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          productName: p.name,
          qty: 1,
          price: p.salePrice,
          stock: p.stock,
        },
      ];
    });
    setTimeout(() => productRef.current?.focus(), 0);
  }

  function updateQty(idx: number, qty: number) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, qty: Math.max(qty, 0) } : it)),
    );
  }
  function updatePrice(idx: number, price: number) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, price: Math.max(price, 0) } : it)),
    );
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function clearCart() {
    setItems([]);
    setReceived("");
    setTimeout(() => productRef.current?.focus(), 0);
  }

  function getOrCreateWalkIn(): string {
    const existing = db.customers.find(
      (c) => c.name.toLowerCase() === WALKIN_NAME.toLowerCase(),
    );
    if (existing) return existing.id;
    const c = addCustomer({
      name: WALKIN_NAME,
      openingBalance: 0,
    });
    return c.id;
  }

  function checkout(printAfter: boolean) {
    if (items.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    for (const it of items) {
      if (it.qty <= 0) {
        toast.error(`Qty must be > 0 for ${it.productName}`);
        return;
      }
      const p = db.products.find((x) => x.id === it.productId);
      if (p && it.qty > p.stock) {
        toast.error(`Insufficient stock for ${it.productName} (have ${p.stock})`);
        return;
      }
    }
    const customerId = getOrCreateWalkIn();
    const inv = createInvoice({
      customerId,
      items: items.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        qty: it.qty,
        price: it.price,
      })),
      paid: total, // cash sale — fully paid
    });
    toast.success(`Sale INV-${inv.number} · ${fmt(total)}`);
    if (printAfter) {
      navigate({ to: "/invoices/$id", params: { id: inv.id } });
    } else {
      clearCart();
    }
  }

  // Shortcuts: F9 = checkout, Ctrl+K = focus product, Esc = clear cart, Ctrl+P = checkout + print
  useEffect(() => {
    function handler(e: globalThis.KeyboardEvent) {
      if (e.key === "F9") {
        e.preventDefault();
        checkout(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        productRef.current?.focus();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        checkout(true);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, received]);

  useEffect(() => {
    productRef.current?.focus();
  }, []);

  return (
    <>
      <PageHeader
        title="Quick Sale (POS)"
        subtitle="Cash sales · Type product → Enter to add · F9 checkout · Ctrl+P checkout & print"
        actions={
          <Button variant="outline" onClick={clearCart} disabled={items.length === 0}>
            <X /> Clear
          </Button>
        }
      />
      <div className="p-4 sm:p-8 grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <Card className="p-4">
            <Label className="mb-1.5 block text-xs">Scan / Search product</Label>
            <ProductCombobox
              ref={productRef}
              products={db.products}
              excludeIds={excludeIds}
              onSelect={addProduct}
              placeholder="Type product name… (Ctrl+K)"
            />
          </Card>

          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-secondary-foreground text-left">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Product</th>
                  <th className="px-3 py-2.5 font-medium w-24 text-right">Qty</th>
                  <th className="px-3 py-2.5 font-medium w-28 text-right">Price</th>
                  <th className="px-3 py-2.5 font-medium w-28 text-right">Amount</th>
                  <th className="px-3 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">
                      Cart is empty — search a product above to start.
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => {
                    const over = it.qty > it.stock;
                    return (
                      <tr key={it.productId} className="border-t border-border">
                        <td className="px-3 py-2">
                          <div className="font-medium">{it.productName}</div>
                          <div className={`text-[11px] ${over ? "text-destructive" : "text-muted-foreground"}`}>
                            Stock: {it.stock}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            className="text-right h-8"
                            value={it.qty}
                            onChange={(e) => updateQty(idx, parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            className="text-right h-8"
                            value={it.price}
                            onChange={(e) => updatePrice(idx, parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {fmt(it.qty * it.price)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="icon" variant="ghost" onClick={() => removeItem(idx)}>
                            <Trash2 />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </Card>
        </div>

        <Card className="p-5 space-y-4 h-fit xl:sticky xl:top-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Zap className="size-4 text-primary" /> Checkout
          </h2>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Items</span>
            <span>{items.length}</span>
          </div>
          <div className="flex justify-between text-2xl font-semibold pt-2 border-t border-border">
            <span>Total</span>
            <span className="tabular-nums">{fmt(total)}</span>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Cash received</Label>
            <Input
              ref={receivedRef}
              type="number"
              inputMode="decimal"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              placeholder="0"
              className="text-right text-lg h-11"
            />
          </div>
          <div className="flex justify-between text-base">
            <span className="text-muted-foreground">Change</span>
            <span className="tabular-nums font-semibold text-success">
              {fmt(change)}
            </span>
          </div>
          {recv > 0 && recv < total && (
            <div className="text-xs text-warning">
              Short by {fmt(total - recv)} — sale will still be recorded as fully paid cash.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="outline" onClick={() => checkout(true)} disabled={items.length === 0}>
              <Printer /> Print
            </Button>
            <Button onClick={() => checkout(false)} disabled={items.length === 0}>
              <Zap /> Save (F9)
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            Saved under "{WALKIN_NAME}" as a fully-paid cash invoice.
          </p>
        </Card>
      </div>
    </>
  );
}
