import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Search, Download } from "lucide-react";
import type { Customer } from "@/lib/types";
import { toast } from "sonner";
import { toCSV, downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/customers/")({
  component: Customers,
});

function emptyForm(): Omit<Customer, "id" | "createdAt"> {
  return {
    name: "",
    phone: "",
    address: "",
    area: "",
    company: "",
    openingBalance: 0,
  };
}

function Customers() {
  const { db, addCustomer, updateCustomer, deleteCustomer, customerBalance } =
    useStore();
  const [q, setQ] = usePersistedState("customers:q", "");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm());

  const list = db.customers.filter(
    (c) =>
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      (c.area ?? "").toLowerCase().includes(q.toLowerCase()) ||
      (c.phone ?? "").includes(q),
  );

  function startNew() {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  }
  function startEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      address: c.address ?? "",
      area: c.area ?? "",
      company: c.company ?? "",
      openingBalance: c.openingBalance,
    });
    setOpen(true);
  }
  function submit() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (editing) {
      updateCustomer(editing.id, form);
      toast.success("Customer updated");
    } else {
      addCustomer(form);
      toast.success("Customer added");
    }
    setOpen(false);
  }

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={`${db.customers.length} total`}
        actions={
          <>
            <Button variant="outline" onClick={() => {
              const rows = list.map((c) => ({
                Name: c.name,
                Company: c.company ?? "",
                Phone: c.phone ?? "",
                Area: c.area ?? "",
                Address: c.address ?? "",
                "Opening Balance": c.openingBalance,
                "Outstanding Balance": customerBalance(c.id),
              }));
              if (rows.length === 0) { toast.error("No customers to export"); return; }
              downloadCSV(`customers-${new Date().toISOString().slice(0,10)}.csv`, toCSV(rows));
              toast.success("Exported");
            }}>
              <Download /> Export CSV
            </Button>
            <Button onClick={startNew}>
              <Plus /> Add Customer
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
                <th className="px-4 py-3 font-medium text-right">Balance</th>
                <th className="px-4 py-3 font-medium w-32"></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    No customers yet.
                  </td>
                </tr>
              )}
              {list.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-border hover:bg-muted/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      to="/customers/$id"
                      params={{ id: c.id }}
                      className="font-medium text-accent hover:underline"
                    >
                      {c.name}
                    </Link>
                    {c.company && (
                      <div className="text-xs text-muted-foreground">
                        {c.company}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{c.phone || "—"}</td>
                  <td className="px-4 py-3">{c.area || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmt(customerBalance(c.id))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => startEdit(c)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete ${c.name}?`)) {
                          deleteCustomer(c.id);
                          toast.success("Deleted");
                        }
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit customer" : "Add customer"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name *">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Area">
              <Input
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
              />
            </Field>
            <Field label="Company">
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Umar Medine Company"
              />
            </Field>
            <Field label="Address" className="col-span-2">
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
            <Field label="Opening Balance">
              <Input
                type="number"
                value={form.openingBalance}
                onChange={(e) =>
                  setForm({
                    ...form,
                    openingBalance: parseFloat(e.target.value) || 0,
                  })
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
