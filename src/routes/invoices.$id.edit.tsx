import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useStore, fmt, fmtClean, fmtRound, fmtDate, fmtDateTime } from "@/lib/store";
import { useRole, isToday } from "@/lib/roles";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Save, X, ArrowLeft, History, Eye, EyeOff } from "lucide-react";
import type { InvoiceItem, Product } from "@/lib/types";
import { toast } from "sonner";
import {
  ProductCombobox, type ProductComboboxHandle,
} from "@/components/ProductCombobox";
import { CustomerCombobox } from "@/components/CustomerCombobox";
import { useResizableColumns, ColResizeGrip } from "@/hooks/useResizableColumns";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const COL_DEFAULTS = { num: 40, product: 280, qty: 90, price: 110, amount: 110 };
const COL_MINS = { num: 32, product: 120, qty: 60, price: 70, amount: 70 };

export const Route = createFileRoute("/invoices/$id/edit")({
  component: EditInvoice,
});

type Row = InvoiceItem & { lastUsed?: boolean };

function EditInvoice() {
  const { id } = useParams({ from: "/invoices/$id/edit" });
  const { db, updateInvoice, getLastPrice } = useStore();
  const { isAdmin, loading: roleLoading } = useRole();
  const navigate = useNavigate();

  const inv = db.invoices.find((i) => i.id === id);

  const [customerId, setCustomerId] = useState<string>(inv?.customerId ?? "");
  const [items, setItems] = useState<Row[]>(
    inv?.items.map((it) => ({ ...it })) ?? [],
  );
  const [paid, setPaid] = useState<string>(inv ? String(inv.paid ?? "") : "");
  const [notes, setNotes] = useState(inv?.notes ?? "");
  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);
  const [showProductInfo, setShowProductInfo] = useState(true);

  const productRef = useRef<ProductComboboxHandle>(null);
  const rowRefs = useRef<Array<{ qty: HTMLInputElement | null; price: HTMLInputElement | null; tr: HTMLTableRowElement | null }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyAddRowRef = useRef<HTMLTableRowElement>(null);
  const { widths, onMouseDown: onColDown, reset: resetCol } = useResizableColumns(
    "invoice:cols:v1",
    COL_DEFAULTS,
    COL_MINS,
  );

  function scrollRowAboveSticky(idx: number) {
    const container = scrollRef.current;
    const row = rowRefs.current[idx]?.tr;
    if (!container || !row) return;
    const stickyH = stickyAddRowRef.current?.offsetHeight ?? 48;
    const rowBottom = row.offsetTop + row.offsetHeight;
    const visibleBottom = container.scrollTop + container.clientHeight - stickyH;
    if (rowBottom > visibleBottom) {
      container.scrollTop += rowBottom - visibleBottom + 8;
    } else if (row.offsetTop < container.scrollTop) {
      container.scrollTop = row.offsetTop - 8;
    }
  }

  const total = useMemo(
    () => items.reduce((s, it) => s + it.qty * it.price, 0),
    [items],
  );
  const excludeIds = useMemo(() => items.map((i) => i.productId), [items]);

  const justSavedRef = useRef(false);
  const isDirty = useMemo(() => {
    if (!inv || justSavedRef.current) return false;
    if (customerId !== inv.customerId) return true;
    if ((parseFloat(paid) || 0) !== (inv.paid ?? 0)) return true;
    if ((notes ?? "") !== (inv.notes ?? "")) return true;
    if (items.length !== inv.items.length) return true;
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      const b = inv.items[i];
      if (a.productId !== b.productId || a.qty !== b.qty || a.price !== b.price) return true;
    }
    return false;
  }, [inv, customerId, items, paid, notes]);
  const blocker = useUnsavedChangesGuard(() => isDirty);
  const [pendingCancel, setPendingCancel] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const pendingFocusAfterDelete = useRef<"qty" | "price" | null>(null);

  useEffect(() => {
    function handler(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, customerId, paid, notes]);

  const focusedProduct = useMemo(
    () =>
      focusedProductId
        ? db.products.find((p) => p.id === focusedProductId) ?? null
        : null,
    [focusedProductId, db.products],
  );

  const lastThree = useMemo(() => {
    if (!focusedProductId || !customerId) return [];
    return db.invoices
      .filter(
        (i) =>
          i.id !== id &&
          i.customerId === customerId &&
          i.items.some((it) => it.productId === focusedProductId),
      )
      .sort((a, b) => +new Date(b.date) - +new Date(a.date))
      .slice(0, 3)
      .map((i) => {
        const line = i.items.find((it) => it.productId === focusedProductId)!;
        return { id: i.id, number: i.number, date: i.date, qty: line.qty, price: line.price };
      });
  }, [focusedProductId, customerId, db.invoices, id]);

  if (!inv) {
    return (
      <>
        <PageHeader title="Invoice not found" />
        <div className="p-8">
          <Link to="/invoices"><Button variant="outline"><ArrowLeft /> Back</Button></Link>
        </div>
      </>
    );
  }

  const allowed = isAdmin || isToday(inv.date);
  if (roleLoading) {
    return (
      <>
        <PageHeader title={`INV-${inv.number}`} subtitle="Loading…" />
        <div className="p-8 text-sm text-muted-foreground">Checking permissions…</div>
      </>
    );
  }
  if (!allowed) {
    return (
      <>
        <PageHeader title={`INV-${inv.number}`} subtitle="Editing not allowed" />
        <div className="p-8">
          <Card className="p-6 text-sm">
            Salesmen can only edit invoices dated today. Ask an admin to edit older invoices.
          </Card>
          <div className="mt-4">
            <Link to="/invoices/$id" params={{ id: inv.id }}>
              <Button variant="outline"><ArrowLeft /> Back</Button>
            </Link>
          </div>
        </div>
      </>
    );
  }

  function pickProduct(p: Product) {
    if (items.some((i) => i.productId === p.id)) {
      toast.message(`${p.name} already added`);
      productRef.current?.clear();
      productRef.current?.focus();
      return;
    }
    const last = customerId ? getLastPrice(customerId, p.id) : null;
    const price = last ?? p.salePrice;
    const newRow: Row = {
      productId: p.id, productName: p.name, qty: 0, price, lastUsed: last !== null,
    };
    setItems((prev) => {
      const next = [...prev, newRow];
      setTimeout(() => {
        const qtyInput = rowRefs.current[next.length - 1]?.qty;
        qtyInput?.focus({ preventScroll: true });
        qtyInput?.select();
        scrollRowAboveSticky(next.length - 1);
      }, 0);
      return next;
    });
    setFocusedProductId(p.id);
  }

  function swapProduct(idx: number, p: Product) {
    if (items.some((it, i) => i !== idx && it.productId === p.id)) {
      toast.message(`${p.name} already added`);
      return;
    }
    const last = customerId ? getLastPrice(customerId, p.id) : null;
    const price = last ?? p.salePrice;
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx
          ? { ...it, productId: p.id, productName: p.name, price, lastUsed: last !== null }
          : it,
      ),
    );
    setFocusedProductId(p.id);
    setEditingRowIdx(null);
    setTimeout(() => {
      const ref = rowRefs.current[idx];
      ref?.qty?.focus();
      ref?.qty?.select();
    }, 0);
  }



  function onCellKey(
    e: KeyboardEvent<HTMLInputElement>,
    idx: number,
    col: "qty" | "price",
  ) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      pendingFocusAfterDelete.current = col;
      setItemToDelete(idx);
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      if (col === "qty") {
        e.preventDefault();
        rowRefs.current[idx]?.price?.focus({ preventScroll: true });
        rowRefs.current[idx]?.price?.select();
        scrollRowAboveSticky(idx);
      } else {
        e.preventDefault();
        const nextRow = rowRefs.current[idx + 1];
        if (nextRow?.qty) {
          nextRow.qty.focus({ preventScroll: true });
          nextRow.qty.select();
          scrollRowAboveSticky(idx + 1);
        } else {
          productRef.current?.focus();
          scrollRowAboveSticky(idx);
        }
      }
    }
  }

  function updateItem(idx: number, patch: Partial<InvoiceItem>) {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch, lastUsed: false } : it)));
  }
  function removeItem(idx: number) { setItems(items.filter((_, i) => i !== idx)); }

  function save() {
    if (!inv) return toast.error("Invoice not found");
    if (!customerId) return toast.error("Select a customer");
    if (items.length === 0) return toast.error("Add at least one product");
    let negative = false;
    const oldQty = new Map<string, number>();
    inv.items.forEach((it) => oldQty.set(it.productId, (oldQty.get(it.productId) ?? 0) + it.qty));
    for (const it of items) {
      if (it.qty <= 0) return toast.error(`Qty must be > 0 for ${it.productName}`);
      const p = db.products.find((x) => x.id === it.productId);
      if (!p) continue;
      const delta = it.qty - (oldQty.get(it.productId) ?? 0);
      if (delta > 0 && delta > p.stock) negative = true;
    }
    updateInvoice(inv.id, {
      customerId,
      items: items.map(({ lastUsed: _l, ...rest }) => rest),
      paid: parseFloat(paid) || 0,
      notes,
    });
    if (negative) toast.warning(`INV-${inv.number} updated — some items went negative stock`);
    else toast.success(`INV-${inv.number} updated`);
    justSavedRef.current = true;
    navigate({ to: "/invoices/$id", params: { id: inv.id } });
  }

  function handleCancel() {
    if (isDirty) {
      setPendingCancel(true);
    } else {
      navigate({ to: "/invoices/$id", params: { id: inv!.id } });
    }
  }

  return (
    <>
      <PageHeader
        title={`Edit INV-${inv.number}`}
        subtitle={fmtDateTime(inv.date)}
        actions={
          <Button variant="outline" onClick={handleCancel}>
            <ArrowLeft /> Cancel
          </Button>
        }
      />

      <div className="p-8 grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card className="p-5 space-y-4">
            <div>
              <Label className="mb-1.5 block text-xs">Customer *</Label>
              <CustomerCombobox
                customers={db.customers}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Search customer by name…"
              />
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div ref={scrollRef} className="max-h-[calc(100vh-16rem)] overflow-auto">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: widths.num }} />
                <col style={{ width: widths.product }} />
                <col style={{ width: widths.qty }} />
                <col style={{ width: widths.price }} />
                <col style={{ width: widths.amount }} />
              </colgroup>
              <thead className="bg-secondary text-secondary-foreground text-left sticky top-0 z-10">
                <tr>
                  <th className="relative px-2 py-2 font-medium text-center">#
                    <ColResizeGrip onMouseDown={onColDown("num")} onDoubleClick={() => resetCol("num")} />
                  </th>
                  <th className="relative px-3 py-2 font-medium">Product
                    <ColResizeGrip onMouseDown={onColDown("product")} onDoubleClick={() => resetCol("product")} />
                  </th>
                  <th className="relative px-2 py-2 font-medium text-right">Qty
                    <ColResizeGrip onMouseDown={onColDown("qty")} onDoubleClick={() => resetCol("qty")} />
                  </th>
                  <th className="relative px-2 py-2 font-medium text-right">Price
                    <ColResizeGrip onMouseDown={onColDown("price")} onDoubleClick={() => resetCol("price")} />
                  </th>
                  <th className="relative px-2 py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  if (!rowRefs.current[idx]) rowRefs.current[idx] = { qty: null, price: null, tr: null };
                  return (
                    <tr
                      key={it.productId}
                      ref={(el) => {
                        rowRefs.current[idx] = {
                          ...(rowRefs.current[idx] ?? { qty: null, price: null, tr: null }),
                          tr: el,
                        };
                      }}
                      className="border-t border-border group scroll-mb-16"
                    >
                      <td className="px-1 py-0.5 text-center text-xs text-muted-foreground tabular-nums">
                        <span className="group-hover:hidden">{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => setItemToDelete(idx)}
                          title="Delete row (Ctrl+Del)"
                          className="hidden group-hover:inline-flex items-center justify-center h-5 w-5 rounded text-destructive hover:bg-destructive/10 mx-auto"
                        >
                          <X className="size-3.5" />
                        </button>
                      </td>
                      <td className="px-3 py-0.5">
                        {editingRowIdx === idx ? (
                          <ProductCombobox
                            products={db.products}
                            excludeIds={items
                              .filter((_, i) => i !== idx)
                              .map((i) => i.productId)}
                            onSelect={(p) => swapProduct(idx, p)}
                            placeholder="Search to replace product…"
                            autoFocus
                            initialQuery={it.productName}
                            onCancel={() => setEditingRowIdx(null)}
                          />
                        ) : (
                          <div
                            className="cursor-pointer truncate"
                            onClick={() => {
                              setFocusedProductId(it.productId);
                              setEditingRowIdx(idx);
                            }}
                          >
                            <div className="font-medium leading-tight truncate">{it.productName}</div>
                            {it.lastUsed && (
                              <div className="text-[10px] text-accent flex items-center gap-1">
                                <History className="size-3" /> Last sold price
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-0.5 text-right">
                        <Input
                          ref={(el) => {
                            rowRefs.current[idx] = {
                              ...(rowRefs.current[idx] ?? { qty: null, price: null, tr: null }),
                              qty: el,
                            };
                          }}
                          type="number"
                          className="text-right h-7 px-2"
                          value={it.qty === 0 ? "" : it.qty}
                          onFocus={(e) => { setFocusedProductId(it.productId); e.target.select(); }}
                          onChange={(e) => updateItem(idx, { qty: parseFloat(e.target.value) || 0 })}
                          onKeyDown={(e) => onCellKey(e, idx, "qty")}
                        />
                      </td>
                      <td className="px-2 py-0.5 text-right">
                        <Input
                          ref={(el) => {
                            rowRefs.current[idx] = {
                              ...(rowRefs.current[idx] ?? { qty: null, price: null, tr: null }),
                              price: el,
                            };
                          }}
                          type="number"
                          className="text-right h-7 px-2"
                          value={it.price}
                          onFocus={(e) => { setFocusedProductId(it.productId); e.target.select(); }}
                          onChange={(e) => updateItem(idx, { price: parseFloat(e.target.value) || 0 })}
                          onKeyDown={(e) => onCellKey(e, idx, "price")}
                        />
                      </td>
                      <td className="px-2 py-0.5 text-right tabular-nums font-medium">
                        {fmtClean(it.qty * it.price)}
                      </td>
                    </tr>
                  );
                })}

                {items.length > 0 && (
                  <tr aria-hidden className="h-14">
                    <td colSpan={5} className="p-0" />
                  </tr>
                )}

                <tr ref={stickyAddRowRef} className="border-t-2 border-primary/40 bg-background sticky bottom-0 z-10 shadow-[0_-4px_6px_-4px_rgba(0,0,0,0.1)]">
                  <td className="px-3 py-1.5" colSpan={5}>
                    <ProductCombobox
                      ref={productRef}
                      products={db.products}
                      excludeIds={excludeIds}
                      onSelect={pickProduct}
                      placeholder="Type product name to add a line…"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
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
              <span className="tabular-nums">{fmtRound(total)}</span>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Amount received</Label>
              <Input type="number" value={paid} onChange={(e) => setPaid(e.target.value)} />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Balance</span>
              <span className="tabular-nums font-medium text-warning">
                {fmtRound(Math.max(total - (parseFloat(paid) || 0), 0))}
              </span>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
            <Button onClick={save} className="w-full">
              <Save /> Save Changes (Ctrl+S)
            </Button>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Product info</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowProductInfo((v) => !v)}
                title={showProductInfo ? "Hide product info" : "Show product info"}
              >
                {showProductInfo ? <EyeOff /> : <Eye />}
              </Button>
            </div>
            {!showProductInfo ? (
              <p className="text-xs text-muted-foreground">Product info hidden.</p>
            ) : !focusedProduct ? (
              <p className="text-xs text-muted-foreground">
                Click a product row to see stock, cost and recent prices for this customer.
              </p>
            ) : (
              <>
                <div className="text-sm font-medium">{focusedProduct.name}</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase text-muted-foreground">Qty on hand</div>
                    <div
                      className={`text-base font-semibold tabular-nums ${
                        focusedProduct.stock <= 0
                          ? "text-destructive"
                          : focusedProduct.stock <= focusedProduct.lowStockThreshold
                            ? "text-warning"
                            : ""
                      }`}
                    >
                      {focusedProduct.stock}
                    </div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase text-muted-foreground">Cost</div>
                    <div className="text-base font-semibold tabular-nums">{fmt(focusedProduct.purchasePrice)}</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-[10px] uppercase text-muted-foreground">Sale</div>
                    <div className="text-base font-semibold tabular-nums">{fmt(focusedProduct.salePrice)}</div>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground mb-1">
                    Last 3 invoices · this customer
                  </div>
                  {!customerId ? (
                    <p className="text-xs text-muted-foreground">Select a customer first.</p>
                  ) : lastThree.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No prior sales.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="text-left font-normal py-0.5">Date</th>
                          <th className="text-left font-normal">INV</th>
                          <th className="text-right font-normal">Qty</th>
                          <th className="text-right font-normal">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lastThree.map((r) => (
                          <tr key={r.id} className="border-t border-border">
                            <td className="py-1">{fmtDate(r.date)}</td>
                            <td>#{r.number}</td>
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
        </div>
      </div>
      <UnsavedChangesDialog
        open={blocker.status === "blocked"}
        onLeave={() => blocker.proceed?.()}
        onStay={() => blocker.reset?.()}
      />
      <UnsavedChangesDialog
        open={pendingCancel}
        onLeave={() => {
          setPendingCancel(false);
          justSavedRef.current = true;
          navigate({ to: "/invoices/$id", params: { id: inv!.id } });
        }}
        onStay={() => setPendingCancel(false)}
      />
      <AlertDialog
        open={itemToDelete !== null}
        onOpenChange={(v) => { if (!v) { setItemToDelete(null); pendingFocusAfterDelete.current = null; } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove product from invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              {itemToDelete !== null && items[itemToDelete]
                ? `"${items[itemToDelete].productName}" will be removed from this invoice.`
                : "This product will be removed from this invoice."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const idx = itemToDelete;
                const col = pendingFocusAfterDelete.current;
                if (idx !== null) removeItem(idx);
                setItemToDelete(null);
                pendingFocusAfterDelete.current = null;
                if (idx !== null && col) {
                  setTimeout(() => {
                    const nextRow = rowRefs.current[idx];
                    const target = col === "qty" ? nextRow?.qty : nextRow?.price;
                    if (target) { target.focus(); target.select(); }
                    else productRef.current?.focus();
                  }, 0);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
