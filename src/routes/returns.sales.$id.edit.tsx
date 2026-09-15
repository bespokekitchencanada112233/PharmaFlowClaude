import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
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
import { ProductCombobox, type ProductComboboxHandle } from "@/components/ProductCombobox";
import { CustomerCombobox } from "@/components/CustomerCombobox";

export const Route = createFileRoute("/returns/sales/$id/edit")({
  component: EditSalesReturn,
});

function EditSalesReturn() {
  const { id } = useParams({ from: "/returns/sales/$id/edit" });
  const { db, updateSalesReturn } = useStore();
  const navigate = useNavigate();
  const ret = db.salesReturns.find((r) => r.id === id);

  const [customerId, setCustomerId] = useState<string>(ret?.customerId ?? "");
  const [items, setItems] = useState<InvoiceItem[]>(ret?.items ?? []);
  const [notes, setNotes] = useState(ret?.notes ?? "");
  const [date, setDate] = useState((ret?.date ?? new Date().toISOString()).slice(0, 10));

  const [entry, setEntry] = useState<{ productId: string; productName: string; qty: string; price: string } | null>(null);
  const productRef = useRef<ProductComboboxHandle>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  const total = useMemo(() => items.reduce((s, it) => s + it.qty * it.price, 0), [items]);
  const excludeIds = useMemo(() => items.map((i) => i.productId), [items]);

  function pickProduct(p: Product) {
    if (items.some((i) => i.productId === p.id)) {
      toast.message(`${p.name} already added`);
      productRef.current?.clear(); productRef.current?.focus();
      return;
    }
    setEntry({ productId: p.id, productName: p.name, qty: "1", price: String(p.salePrice || 0) });
    setTimeout(() => { qtyRef.current?.focus(); qtyRef.current?.select(); }, 0);
  }
  function commitEntry() {
    if (!entry) return;
    const qty = parseFloat(entry.qty) || 0;
    const price = parseFloat(entry.price) || 0;
    if (qty <= 0) { toast.error("Qty must be > 0"); qtyRef.current?.focus(); return; }
    setItems((prev) => [...prev, { productId: entry.productId, productName: entry.productName, qty, price }]);
    setEntry(null);
    setTimeout(() => productRef.current?.focus(), 0);
  }
  function onPriceKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); commitEntry(); }
    else if (e.key === "Escape") { setEntry(null); setTimeout(() => productRef.current?.focus(), 0); }
  }
  function onQtyKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); priceRef.current?.focus(); priceRef.current?.select(); }
    else if (e.key === "Escape") { setEntry(null); setTimeout(() => productRef.current?.focus(), 0); }
  }
  function updateItem(idx: number, patch: Partial<InvoiceItem>) {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) { setItems(items.filter((_, i) => i !== idx)); }

  function save() {
    if (!ret) return;
    if (!customerId) return toast.error("Select a customer");
    if (items.length === 0) return toast.error("Add at least one product");
    for (const it of items) if (it.qty <= 0) return toast.error(`Qty must be > 0 for ${it.productName}`);
    const iso = new Date(date + "T00:00:00").toISOString();
    updateSalesReturn(ret.id, { customerId, items, notes: notes || undefined, date: iso });
    toast.success("Sales return updated");
    navigate({ to: "/returns/sales/$id", params: { id: ret.id } });
  }

  useEffect(() => {
    function handler(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, customerId, notes, date]);

  if (!ret) {
    return (
      <>
        <PageHeader title="Sales return not found" />
        <div className="p-8"><Link to="/returns"><Button variant="outline"><ArrowLeft /> Back</Button></Link></div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Edit Sales Return"
        subtitle="Update items, qty, price, date or notes · Ctrl+S save"
        actions={
          <Link to="/returns/sales/$id" params={{ id: ret.id }}>
            <Button variant="outline"><ArrowLeft /> Cancel</Button>
          </Link>
        }
      />
      <div className="p-8 grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5 block text-xs">Customer *</Label>
                <CustomerCombobox customers={db.customers} value={customerId} onChange={setCustomerId} placeholder="Search customer…" />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
          </Card>
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-secondary-foreground text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium w-24 text-right">Qty</th>
                  <th className="px-4 py-3 font-medium w-32 text-right">Price</th>
                  <th className="px-4 py-3 font-medium w-32 text-right">Amount</th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{it.productName}</td>
                    <td className="px-4 py-2 text-right">
                      <Input type="number" className="text-right" value={it.qty}
                        onChange={(e) => updateItem(idx, { qty: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Input type="number" className="text-right" value={it.price}
                        onChange={(e) => updateItem(idx, { price: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(it.qty * it.price)}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => removeItem(idx)}>
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-primary/40 bg-primary/5">
                  <td className="px-4 py-2">
                    {entry ? (
                      <div className="font-medium">{entry.productName}</div>
                    ) : (
                      <ProductCombobox ref={productRef} products={db.products} excludeIds={excludeIds}
                        onSelect={pickProduct} placeholder="Add product…" />
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Input ref={qtyRef} type="number" className="text-right" disabled={!entry}
                      value={entry?.qty ?? ""}
                      onChange={(e) => entry && setEntry({ ...entry, qty: e.target.value })}
                      onKeyDown={onQtyKey} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Input ref={priceRef} type="number" className="text-right" disabled={!entry}
                      value={entry?.price ?? ""}
                      onChange={(e) => entry && setEntry({ ...entry, price: e.target.value })}
                      onKeyDown={onPriceKey} />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {entry ? fmt((parseFloat(entry.qty) || 0) * (parseFloat(entry.price) || 0)) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {entry && (
                      <Button size="icon" variant="ghost" onClick={() => setEntry(null)}><Trash2 /></Button>
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
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Items</span><span>{items.length}</span></div>
            <div className="flex justify-between text-base font-semibold pt-2 border-t border-border">
              <span>Total</span><span className="tabular-nums">{fmt(total)}</span>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
            <Button onClick={save} className="w-full"><Save /> Save Changes (Ctrl+S)</Button>
          </Card>
        </div>
      </div>
    </>
  );
}
