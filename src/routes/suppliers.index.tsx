import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useStore, fmt } from "@/lib/store";
import { useRole } from "@/lib/roles";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Search, FileText } from "lucide-react";
import type { Supplier } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/suppliers/")({
  component: Suppliers,
});

function emptyForm(): Omit<Supplier, "id" | "createdAt"> {
  return { name: "", phone: "", address: "", area: "", company: "", openingBalance: 0 };
}

function Suppliers() {
  const { db, addSupplier, updateSupplier, deleteSupplier, supplierBalance } = useStore();
  const { isAdmin } = useRole();
  const [q, setQ] = usePersistedState("suppliers:q", "");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm());

  const list = db.suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(q.toLowerCase()) ||
      (s.area ?? "").toLowerCase().includes(q.toLowerCase()) ||
      (s.phone ?? "").includes(q),
  );

  function startNew() {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  }
  function startEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name, phone: s.phone ?? "", address: s.address ?? "",
      area: s.area ?? "", company: s.company ?? "",
      openingBalance: s.openingBalance,
    });
    setOpen(true);
  }
  function submit() {
    if (!form.name.trim()) return toast.error("Name is required");
    if (editing) {
      updateSupplier(editing.id, form);
      toast.success("Supplier updated");
    } else {
      addSupplier(form);
      toast.success("Supplier added");
    }
    setOpen(false);
  }

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle={`${db.suppliers.length} total`}
        actions={
          <Button onClick={startNew}>
            <Plus /> Add Supplier
          </Button>
        }
      />
      <div className="p-8 space-y-4">
        <div className="relative max-w-sm">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, area or phone…"
            className="pl-9"
          />
        </div>

        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Area</th>
                <th className="px-4 py-3 font-medium text-right">Balance Owed</th>
                {isAdmin && <th className="px-4 py-3 w-32"></th>}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="px-4 py-10 text-center text-muted-foreground">
                    No suppliers yet.
                  </td>
                </tr>
              )}
              {list.map((s) => (
                <tr key={s.id} className="border-t border-border hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link
                      to="/suppliers/$id"
                      params={{ id: s.id }}
                      className="font-medium text-accent hover:underline"
                    >
                      {s.name}
                    </Link>
                    {s.company && <div className="text-xs text-muted-foreground">{s.company}</div>}
                  </td>
                  <td className="px-4 py-3">{s.phone || "—"}</td>
                  <td className="px-4 py-3">{s.area || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(supplierBalance(s.id))}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <Link to="/suppliers/$id/statement" params={{ id: s.id }}>
                        <Button size="icon" variant="ghost" title="Statement">
                          <FileText />
                        </Button>
                      </Link>
                      <Button size="icon" variant="ghost" onClick={() => startEdit(s)}>
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete ${s.name}?`)) {
                            deleteSupplier(s.id);
                            toast.success("Deleted");
                          }
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  )}

                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit supplier" : "Add supplier"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name *">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Area">
              <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
            </Field>
            <Field label="Company">
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </Field>
            <Field label="Address" className="col-span-2">
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="Opening Balance (we owe)">
              <Input
                type="number"
                value={form.openingBalance}
                onChange={(e) => setForm({ ...form, openingBalance: parseFloat(e.target.value) || 0 })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>{editing ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs">{label}</Label>
      {children}
    </div>
  );
}
