import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";

const PAGE_SIZE = 50;
import { useStore, fmt } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Search, AlertTriangle, History, Download } from "lucide-react";
import type { Product } from "@/lib/types";
import { toast } from "sonner";
import { toCSV, downloadCSV } from "@/lib/csv";
import { useRole } from "@/lib/roles";

export const Route = createFileRoute("/products/")({
  component: Products,
});

type ProductForm = {
  name: string;
  company: string;
  pack: string;
  unit: string;
  stock: string;
  purchasePrice: string;
  salePrice: string;
  lowStockThreshold: string;
};

function emptyForm(): ProductForm {
  return {
    name: "",
    company: "",
    pack: "",
    unit: "Box",
    stock: "",
    purchasePrice: "",
    salePrice: "",
    lowStockThreshold: "10",
  };
}

function Products() {
  const { db, addProduct, updateProduct, deleteProduct } = useStore();
  const { isSalesman } = useRole();
  const [q, setQ] = usePersistedState("products:q", "");
  const [page, setPage] = usePersistedState("products:page", 1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm());

  const list = db.products.filter(
    (p) =>
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      (p.company ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  useEffect(() => { setPage(1); }, [q]);

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = list.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  const startIdx = list.length === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(pageSafe * PAGE_SIZE, list.length);

  function startNew() {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  }
  function startEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      company: p.company ?? "",
      pack: p.pack ?? "",
      unit: p.unit ?? "",
      stock: String(p.stock),
      purchasePrice: String(p.purchasePrice),
      salePrice: String(p.salePrice),
      lowStockThreshold: String(p.lowStockThreshold),
    });
    setOpen(true);
  }
  function toNum(v: string): number {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function submit() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const payload = {
      name: form.name,
      company: form.company || undefined,
      pack: form.pack || undefined,
      unit: form.unit || undefined,
      stock: isSalesman && editing ? editing.stock : toNum(form.stock),
      purchasePrice: toNum(form.purchasePrice),
      salePrice: toNum(form.salePrice),
      lowStockThreshold: toNum(form.lowStockThreshold),
    };
    if (editing) {
      updateProduct(editing.id, payload);
      toast.success("Product updated");
    } else {
      addProduct(payload);
      toast.success("Product added");
    }
    setOpen(false);
  }

  return (
    <>
      <PageHeader
        title="Products"
        subtitle={`${db.products.length} items`}
        actions={
          <>
            <Button variant="outline" onClick={() => {
              const rows = list.map((p) => ({
                Name: p.name,
                Company: p.company ?? "",
                Pack: p.pack ?? "",
                Unit: p.unit ?? "",
                Stock: p.stock,
                "Purchase Price": p.purchasePrice,
                "Sale Price": p.salePrice,
                "Stock Value (Purchase)": p.stock * p.purchasePrice,
                "Stock Value (Sale)": p.stock * p.salePrice,
                "Low Stock Threshold": p.lowStockThreshold,
              }));
              if (rows.length === 0) { toast.error("No products to export"); return; }
              downloadCSV(`products-${new Date().toISOString().slice(0,10)}.csv`, toCSV(rows));
              toast.success("Exported");
            }}>
              <Download /> Export CSV
            </Button>
            <Button onClick={startNew}>
              <Plus /> Add Product
            </Button>
          </>
        }
      />
      <div className="p-8 space-y-4">
        <div className="relative max-w-sm">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or company…"
            className="pl-9"
          />
        </div>

        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Pack</th>
                <th className="px-4 py-3 font-medium text-right">Purchase</th>
                <th className="px-4 py-3 font-medium text-right">Sale</th>
                <th className="px-4 py-3 font-medium text-right">Stock</th>
                <th className="px-4 py-3 w-36"></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    No products yet.
                  </td>
                </tr>
              )}
              {paged.map((p) => {
                const low = p.stock <= p.lowStockThreshold;
                return (
                  <tr
                    key={p.id}
                    className="border-t border-border hover:bg-muted/50"
                  >
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3">{p.company || "—"}</td>
                    <td className="px-4 py-3">{p.pack || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmt(p.purchasePrice)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmt(p.salePrice)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span
                        className={
                          low
                            ? "text-destructive font-medium inline-flex items-center gap-1"
                            : ""
                        }
                      >
                        {low && <AlertTriangle className="size-3.5" />}
                        {p.stock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to="/products/$id/history" params={{ id: p.id }}>
                        <Button size="icon" variant="ghost" title="History">
                          <History />
                        </Button>
                      </Link>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(p)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete ${p.name}?`)) {
                            deleteProduct(p.id);
                            toast.success("Deleted");
                          }
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        {list.length > 0 && (
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">
              Showing {startIdx}–{endIdx} of {list.length}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
              >
                Prev
              </Button>
              <span className="tabular-nums">
                Page {pageSafe} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit product" : "Add product"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name *" className="col-span-2">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Company">
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Umar Medine Company"
              />
            </Field>
            <Field label="Pack">
              <Input
                value={form.pack}
                onChange={(e) => setForm({ ...form, pack: e.target.value })}
                placeholder="e.g. 10x10"
              />
            </Field>
            <Field label="Unit">
              <Input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="Box / Strip / Btl"
              />
            </Field>
            <Field label="Stock">
              <Input
                type="number"
                value={form.stock}
                onChange={(e) =>
                  setForm({ ...form, stock: e.target.value })
                }
                disabled={isSalesman}
                className={isSalesman ? "bg-muted text-muted-foreground cursor-not-allowed" : undefined}
              />
            </Field>
            <Field label="Purchase price">
              <Input
                type="number"
                value={form.purchasePrice}
                onChange={(e) =>
                  setForm({ ...form, purchasePrice: e.target.value })
                }
              />
            </Field>
            <Field label="Sale price">
              <Input
                type="number"
                value={form.salePrice}
                onChange={(e) =>
                  setForm({ ...form, salePrice: e.target.value })
                }
              />
            </Field>
            <Field label="Low stock alert at" className="col-span-2">
              <Input
                type="number"
                value={form.lowStockThreshold}
                onChange={(e) =>
                  setForm({ ...form, lowStockThreshold: e.target.value })
                }
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit}>{editing ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs">{label}</Label>
      {children}
    </div>
  );
}
