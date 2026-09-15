import { createFileRoute, useNavigate, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useStore, fmt } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Save, Trash2, ArrowLeft } from "lucide-react";
import type { InvoiceItem, Product } from "@/lib/types";
import { toast } from "sonner";
import { useRole, isToday } from "@/lib/roles";
import {
  ProductCombobox,
  type ProductComboboxHandle,
} from "@/components/ProductCombobox";
import { SupplierCombobox } from "@/components/SupplierCombobox";
import { ProductInfoCard, type ProductInfoRecent } from "@/components/ProductInfoCard";

export const Route = createFileRoute("/purchases/$id/edit")({
  component: EditPurchase,
});

function EditPurchase() {
  const { id } = useParams({ from: "/purchases/$id/edit" });
  const { db, updatePurchase } = useStore();
  const { isAdmin, loading: roleLoading } = useRole();
  const navigate = useNavigate();
  const pur = db.purchases.find((p) => p.id === id);

  const [supplierId, setSupplierId] = useState<string>(pur?.supplierId ?? "");
  const [items, setItems] = useState<InvoiceItem[]>(pur?.items ?? []);
  const [paid, setPaid] = useState(pur ? String(pur.paid) : "");
  const [notes, setNotes] = useState(pur?.notes ?? "");
  const [date, setDate] = useState(pur ? pur.date.slice(0, 10) : "");
  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);
  const [showProductInfo, setShowProductInfo] = useState(true);

  const [entry, setEntry] = useState<{
    productId: string;
    productName: string;
    qty: string;
    price: string;
  } | null>(null);

  const productRef = useRef<ProductComboboxHandle>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  const total = useMemo(
    () => items.reduce((s, it) => s + it.qty * it.price, 0),
    [items],
  );
  const excludeIds = useMemo(() => items.map((i) => i.productId), [items]);

  function pickProduct(p: Product) {
    if (items.some((i) => i.productId === p.id)) {
      toast.message(`${p.name} already added`);
      productRef.current?.clear();
      productRef.current?.focus();
      return;
    }
    setFocusedProductId(p.id);
    setEntry({
      productId: p.id,
      productName: p.name,
      qty: "0",
      price: String(p.purchasePrice || 0),
    });
    setTimeout(() => {
      qtyRef.current?.focus();
      qtyRef.current?.select();
    }, 0);
  }

  function commitEntry() {
    if (!entry) return;
    const qty = parseFloat(entry.qty) || 0;
    const price = parseFloat(entry.price) || 0;
    if (qty <= 0) {
      toast.error("Qty must be > 0");
      qtyRef.current?.focus();
      return;
    }
    setItems((prev) => [
      ...prev,
      { productId: entry.productId, productName: entry.productName, qty, price },
    ]);
    setEntry(null);
    setTimeout(() => productRef.current?.focus(), 0);
  }

  function onPriceKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      commitEntry();
    } else if (e.key === "Escape") {
      setEntry(null);
      setTimeout(() => productRef.current?.focus(), 0);
    }
  }

  function onQtyKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      priceRef.current?.focus();
      priceRef.current?.select();
    } else if (e.key === "Escape") {
      setEntry(null);
      setTimeout(() => productRef.current?.focus(), 0);
    }
  }

  function updateItem(idx: number, patch: Partial<InvoiceItem>) {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  function save() {
    if (!pur) return;
    if (!supplierId) return toast.error("Select a supplier");
    if (items.length === 0) return toast.error("Add at least one product");
    for (const it of items) {
      if (it.qty <= 0)
        return toast.error(`Qty must be > 0 for ${it.productName}`);
    }
    const timePart = pur.date.length >= 19 ? pur.date.slice(10) : "T00:00:00";
    const isoDate = date ? new Date(date + timePart).toISOString() : pur.date;
    updatePurchase(pur.id, {
      supplierId,
      items,
      paid: parseFloat(paid) || 0,
      notes,
      date: isoDate,
    });
    toast.success(`PUR-${pur.number} updated`);
    navigate({ to: "/purchases/$id", params: { id: pur.id } });
  }

  useEffect(() => {
    function handler(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        productRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, supplierId, paid, notes, date]);

  const focusedProduct = useMemo(
    () => focusedProductId ? db.products.find((p) => p.id === focusedProductId) ?? null : null,
    [focusedProductId, db.products],
  );

  const recent: ProductInfoRecent[] = useMemo(() => {
    if (!focusedProductId || !supplierId) return [];
    return db.purchases
      .filter((p) => p.id !== id && p.supplierId === supplierId && p.items.some((it) => it.productId === focusedProductId))
      .sort((a, b) => +new Date(b.date) - +new Date(a.date))
      .slice(0, 3)
      .map((p) => {
        const line = p.items.find((it) => it.productId === focusedProductId)!;
        return { id: p.id, number: p.number, date: p.date, qty: line.qty, price: line.price, numberPrefix: "PUR-" };
      });
  }, [focusedProductId, supplierId, db.purchases, id]);


  const allowed = isAdmin || isToday(pur?.date ?? "");

  if (!pur) {
    return (
      <>
        <PageHeader title="Purchase not found" />
        <div className="p-8">
          <Link to="/purchases">
            <Button variant="outline"><ArrowLeft /> Back</Button>
          </Link>
        </div>
      </>
    );
  }

  if (roleLoading) {
    return (
      <>
        <PageHeader title={`PUR-${pur.number}`} subtitle="Loading…" />
        <div className="p-8 text-sm text-muted-foreground">Checking permissions…</div>
      </>
    );
  }

  if (!allowed) {
    return (
      <>
        <PageHeader title={`PUR-${pur.number}`} subtitle="Editing not allowed" />
        <div className="p-8 space-y-4">
          <Card className="p-6 text-sm">
            Salesmen can only edit purchases dated today. Ask an admin to edit older purchases.
          </Card>
          <Link to="/purchases/$id" params={{ id: pur.id }}>
            <Button variant="outline"><ArrowLeft /> Back</Button>
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Edit Purchase PUR-${pur.number}`}
        subtitle="Tab through Product → Qty → Cost · Ctrl+K focus search · Ctrl+S save"
        actions={
          <Link to="/purchases/$id" params={{ id: pur.id }}>
            <Button variant="outline">
              <ArrowLeft /> Cancel
            </Button>
          </Link>
        }
      />
      <div className="p-8 grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card className="p-5 space-y-4">
            <div>
              <Label className="mb-1.5 block text-xs">Supplier *</Label>
              <SupplierCombobox
                suppliers={db.suppliers}
                value={supplierId}
                onChange={setSupplierId}
                placeholder="Search supplier…"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-secondary-foreground text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium w-24 text-right">Qty</th>
                  <th className="px-4 py-3 font-medium w-32 text-right">Cost</th>
                  <th className="px-4 py-3 font-medium w-32 text-right">Amount</th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.productId} className="border-t border-border cursor-pointer hover:bg-muted/30"
                      onClick={() => setFocusedProductId(it.productId)}>
                    <td className="px-4 py-2 font-medium">{it.productName}</td>
                    <td className="px-4 py-2 text-right">
                      <Input
                        type="number"
                        className="text-right"
                        value={it.qty === 0 ? "" : it.qty}
                        onChange={(e) =>
                          updateItem(idx, { qty: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Input
                        type="number"
                        className="text-right"
                        value={it.price}
                        onChange={(e) =>
                          updateItem(idx, { price: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      {fmt(it.qty * it.price)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); removeItem(idx); }}>
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}

                {/* Fast entry row */}
                <tr className="border-t-2 border-primary/40 bg-primary/5">
                  <td className="px-4 py-2">
                    {entry ? (
                      <div className="font-medium">{entry.productName}</div>
                    ) : (
                      <ProductCombobox
                        ref={productRef}
                        products={db.products}
                        excludeIds={excludeIds}
                        onSelect={pickProduct}
                        placeholder="Type product name… (Ctrl+K)"
                      />
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Input
                      ref={qtyRef}
                      type="number"
                      className="text-right"
                      disabled={!entry}
                      value={entry?.qty ?? ""}
                      onChange={(e) =>
                        entry && setEntry({ ...entry, qty: e.target.value })
                      }
                      onKeyDown={onQtyKey}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Input
                      ref={priceRef}
                      type="number"
                      className="text-right"
                      disabled={!entry}
                      value={entry?.price ?? ""}
                      onChange={(e) =>
                        entry && setEntry({ ...entry, price: e.target.value })
                      }
                      onKeyDown={onPriceKey}
                    />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {entry
                      ? fmt(
                          (parseFloat(entry.qty) || 0) *
                            (parseFloat(entry.price) || 0),
                        )
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {entry && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEntry(null);
                          setTimeout(() => productRef.current?.focus(), 0);
                        }}
                        title="Cancel (Esc)"
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>
        </div>

        <div className="space-y-4 h-fit sticky top-4">
          <Card className="p-5 space-y-4">
            <h2 className="font-semibold">Summary</h2>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Items</span>
              <span>{items.length}</span>
            </div>
            <div className="flex justify-between text-base font-semibold pt-2 border-t border-border">
              <span>Total</span>
              <span className="tabular-nums">{fmt(total)}</span>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Amount paid</Label>
              <Input
                type="number"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
              />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Balance owed</span>
              <span className="tabular-nums font-medium text-warning">
                {fmt(Math.max(total - (parseFloat(paid) || 0), 0))}
              </span>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <Button onClick={save} className="w-full">
              <Save /> Save Changes (Ctrl+S)
            </Button>
          </Card>

          <ProductInfoCard
            product={focusedProduct}
            show={showProductInfo}
            onToggle={() => setShowProductInfo((v) => !v)}
            recentTitle="Last 3 purchases · this supplier"
            recent={recent}
            partySelected={Boolean(supplierId)}
            noPartyMessage="Select a supplier first."
            emptyMessage="Click a product row to see stock, cost and recent purchases for this supplier."
          />
        </div>
      </div>
    </>
  );
}
