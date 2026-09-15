import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { checkSmsConnection, SMS_DEFAULTS, SMS_TEMPLATE_VARS } from "@/lib/sms";
import { Loader2 } from "lucide-react";


// ---- CSV helpers ----
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && s[i + 1] === "\n") i++;
        row.push(cur); cur = "";
        if (row.some((c) => c.trim() !== "")) rows.push(row);
        row = [];
      } else cur += ch;
    }
  }
  if (cur !== "" || row.length) { row.push(cur); if (row.some((c) => c.trim() !== "")) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
    return o;
  });
}

function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const CUSTOMERS_TEMPLATE =
  "name,phone,area,company,address,opening_balance\nABC Pharmacy,03001234567,Main Bazaar,,Shop 12,0\n";
const PRODUCTS_TEMPLATE =
  "name,company,pack,unit,purchase_price,sale_price,stock,low_stock_threshold\nPanadol 500mg,GSK,10x10,Tab,180,200,500,50\n";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

function Settings() {
  const { db, updateCompany, resetAll, importAll, signOut, addCustomer, addProduct } = useStore();

  const handleImportCustomers = async (file: File) => {
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) { toast.error("CSV is empty"); return; }
    const existing = new Set(db.customers.map((c) => c.name.trim().toLowerCase()));
    let added = 0, skipped = 0, blank = 0;
    for (const r of rows) {
      const name = (r.name || "").trim();
      if (!name) { blank++; continue; }
      const key = name.toLowerCase();
      if (existing.has(key)) { skipped++; continue; }
      existing.add(key);
      addCustomer({
        name,
        phone: r.phone || "",
        area: r.area || "",
        company: r.company || "",
        address: r.address || "",
        openingBalance: parseFloat(r.opening_balance || "0") || 0,
      });
      added++;
      if (added % 25 === 0) await new Promise((res) => setTimeout(res, 0));
    }
    toast.success(`Imported ${added} customers${skipped ? `, skipped ${skipped} duplicate${skipped > 1 ? "s" : ""}` : ""}${blank ? `, ${blank} blank row(s) ignored` : ""}`);
  };

  const handleImportProducts = async (file: File) => {
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) { toast.error("CSV is empty"); return; }
    const existing = new Set(db.products.map((p) => p.name.trim().toLowerCase()));
    let added = 0, skipped = 0, blank = 0;
    for (const r of rows) {
      const name = (r.name || "").trim();
      if (!name) { blank++; continue; }
      const key = name.toLowerCase();
      if (existing.has(key)) { skipped++; continue; }
      existing.add(key);
      addProduct({
        name,
        company: r.company || "",
        pack: r.pack || "",
        unit: r.unit || "",
        purchasePrice: parseFloat(r.purchase_price || "0") || 0,
        salePrice: parseFloat(r.sale_price || "0") || 0,
        stock: parseFloat(r.stock || "0") || 0,
        lowStockThreshold: parseFloat(r.low_stock_threshold || "0") || 0,
      });
      added++;
      if (added % 25 === 0) await new Promise((res) => setTimeout(res, 0));
    }
    toast.success(`Imported ${added} products${skipped ? `, skipped ${skipped} duplicate${skipped > 1 ? "s" : ""}` : ""}${blank ? `, ${blank} blank row(s) ignored` : ""}`);
  };
  const [form, setForm] = useState(db.company);

  useEffect(() => setForm(db.company), [db.company]);

  const handleBackup = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `wms-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded");
  };

  const handleRestore = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data.customers || !data.products || !data.invoices) {
          throw new Error("Invalid backup file");
        }
        if (
          !confirm(
            "This will REPLACE all current data with the backup. Continue?",
          )
        )
          return;
        importAll(data);
        toast.success("Data restored");
      } catch (e) {
        toast.error("Invalid backup file");
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Company info & data" />
      <div className="p-8 max-w-2xl space-y-6">
        <Card className="p-5 space-y-4">
          <h2 className="font-semibold">Company details</h2>
          <div>
            <Label className="mb-1.5 block text-xs">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Address</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <Button
            onClick={() => {
              updateCompany(form);
              toast.success("Saved");
            }}
          >
            Save
          </Button>
        </Card>

        <SmsSettingsCard />


        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">Import data (CSV)</h2>
          <p className="text-sm text-muted-foreground">
            Bulk-import your existing customers and products from Excel. Save
            each sheet as CSV first (File → Save As → CSV in Excel). Duplicate
            names are skipped.
          </p>
          <div className="space-y-2">
            <div className="text-sm font-medium">Customers</div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => downloadCSV("customers-template.csv", CUSTOMERS_TEMPLATE)}
              >
                Download template
              </Button>
              <Button asChild>
                <label className="cursor-pointer">
                  Upload CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImportCustomers(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </Button>
            </div>
          </div>
          <div className="space-y-2 pt-2">
            <div className="text-sm font-medium">Products</div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => downloadCSV("products-template.csv", PRODUCTS_TEMPLATE)}
              >
                Download template
              </Button>
              <Button asChild>
                <label className="cursor-pointer">
                  Upload CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImportProducts(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Only the <code>name</code> column is required. Empty cells become
            blank or 0.
          </p>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">Backup & Restore</h2>
          <p className="text-sm text-muted-foreground">
            Export all your data (customers, products, invoices, settings) as a
            JSON file. Keep it safe — you can restore it later on any device.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleBackup}>Download backup</Button>
            <Button variant="outline" asChild>
              <label className="cursor-pointer">
                Restore from file
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleRestore(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: download a backup weekly and keep a copy in Google Drive / email.
          </p>
        </Card>

        <Card className="p-5 space-y-3 border-destructive/40">
          <h2 className="font-semibold text-destructive">Danger zone</h2>
          <p className="text-sm text-muted-foreground">
            Wipes all customers, products, invoices and settings on this device.
          </p>
          <Button
            variant="destructive"
            onClick={() => {
              if (confirm("Erase ALL data? This cannot be undone.")) {
                resetAll();
                toast.success("All data cleared");
              }
            }}
          >
            Reset all data
          </Button>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">Account</h2>
          <Button variant="outline" onClick={() => signOut()}>
            Sign out
          </Button>
        </Card>
      </div>
    </>
  );
}

function SmsSettingsCard() {
  const { db, updateCompany } = useStore();
  const [enabled, setEnabled] = useState(db.company.smsEnabled ?? false);
  const [invoiceEnabled, setInvoiceEnabled] = useState(
    db.company.smsInvoiceEnabled ?? true,
  );
  const [paymentEnabled, setPaymentEnabled] = useState(
    db.company.smsPaymentEnabled ?? true,
  );
  const [cc, setCc] = useState(db.company.defaultCountryCode || "+92");
  const [invoiceTpl, setInvoiceTpl] = useState(
    db.company.smsInvoiceTemplate || SMS_DEFAULTS.invoice,
  );
  const [paymentTpl, setPaymentTpl] = useState(
    db.company.smsPaymentTemplate || SMS_DEFAULTS.payment,
  );
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setEnabled(db.company.smsEnabled ?? false);
    setInvoiceEnabled(db.company.smsInvoiceEnabled ?? true);
    setPaymentEnabled(db.company.smsPaymentEnabled ?? true);
    setCc(db.company.defaultCountryCode || "+92");
    setInvoiceTpl(db.company.smsInvoiceTemplate || SMS_DEFAULTS.invoice);
    setPaymentTpl(db.company.smsPaymentTemplate || SMS_DEFAULTS.payment);
  }, [
    db.company.smsEnabled,
    db.company.smsInvoiceEnabled,
    db.company.smsPaymentEnabled,
    db.company.defaultCountryCode,
    db.company.smsInvoiceTemplate,
    db.company.smsPaymentTemplate,
  ]);

  const varsHint = SMS_TEMPLATE_VARS.map((v) => `{${v}}`).join(" ");

  async function runCheck() {
    setChecking(true);
    try {
      const r = await checkSmsConnection();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">SMS (SMS Gateway for Android — Cloud)</h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="sms-enabled" className="text-xs">
            Enabled
          </Label>
          <Switch id="sms-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Sends via api.sms-gate.app using the Cloud server credentials shown
        inside the SMS Gateway Android app. Credentials are stored server-side
        as secrets.
      </p>
      <div>
        <Label className="mb-1.5 block text-xs">Default country code</Label>
        <Input
          value={cc}
          onChange={(e) => setCc(e.target.value)}
          placeholder="+92"
        />
      </div>
      <div className="rounded-md border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="sms-invoice-enabled" className="text-sm font-medium">
              Invoice SMS
            </Label>
            <p className="text-xs text-muted-foreground">
              Sent automatically when you print an invoice, and from the SMS button.
            </p>
          </div>
          <Switch
            id="sms-invoice-enabled"
            checked={invoiceEnabled}
            onCheckedChange={setInvoiceEnabled}
            disabled={!enabled}
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Invoice template</Label>
          <Textarea
            value={invoiceTpl}
            onChange={(e) => setInvoiceTpl(e.target.value)}
            rows={3}
          />
        </div>
      </div>
      <div className="rounded-md border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="sms-payment-enabled" className="text-sm font-medium">
              Payment SMS
            </Label>
            <p className="text-xs text-muted-foreground">
              Sent automatically when you record a payment (single or bulk).
            </p>
          </div>
          <Switch
            id="sms-payment-enabled"
            checked={paymentEnabled}
            onCheckedChange={setPaymentEnabled}
            disabled={!enabled}
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Payment template</Label>
          <Textarea
            value={paymentTpl}
            onChange={(e) => setPaymentTpl(e.target.value)}
            rows={3}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Variables: {varsHint}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            updateCompany({
              smsEnabled: enabled,
              smsInvoiceEnabled: invoiceEnabled,
              smsPaymentEnabled: paymentEnabled,
              defaultCountryCode: cc || "+92",
              smsInvoiceTemplate: invoiceTpl,
              smsPaymentTemplate: paymentTpl,
            });
            toast.success("SMS settings saved");
          }}
        >
          Save
        </Button>
        <Button variant="outline" onClick={runCheck} disabled={checking}>
          {checking && <Loader2 className="animate-spin" />}
          Check connection
        </Button>
      </div>
    </Card>
  );
}

