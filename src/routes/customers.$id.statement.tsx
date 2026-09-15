import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useStore, fmtRound, fmtDate } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { buildStatementPdf } from "@/lib/pdf";

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export const Route = createFileRoute("/customers/$id/statement")({
  component: Statement,
});

type Row = {
  date: string;
  type: "Opening" | "Invoice" | "Payment" | "Cash Out" | "Sales Return";
  ref: string;
  debit: number;
  credit: number;
  notes?: string;
};

function Statement() {
  const { id } = useParams({ from: "/customers/$id/statement" });
  const { db, online, pendingCount, refreshData } = useStore();
  const [refreshing, setRefreshing] = useState(online && pendingCount === 0);
  const c = db.customers.find((x) => x.id === id);

  useEffect(() => {
    if (!online || pendingCount > 0) {
      setRefreshing(false);
      return;
    }
    let active = true;
    setRefreshing(true);
    void refreshData().finally(() => {
      if (active) setRefreshing(false);
    });
    return () => {
      active = false;
    };
  }, [id, online, pendingCount, refreshData]);

  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const [from, setFrom] = useState(firstOfMonth.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);

  const { rows, openingBefore, totalDebit, totalCredit } = useMemo(() => {
    if (!c) return { rows: [] as Row[], openingBefore: 0, totalDebit: 0, totalCredit: 0 };
    const fromTs = new Date(from + "T00:00:00").getTime();
    const toTs = new Date(to + "T23:59:59.999").getTime();

    const invs = db.invoices.filter((i) => i.customerId === id);
    const pays = db.payments.filter((p) => p.customerId === id);
    const rets = db.salesReturns.filter((r) => r.customerId === id);

    // Opening = original opening balance + everything before "from"
    let opening = c.openingBalance;
    for (const i of invs) {
      const t = new Date(i.date).getTime();
      if (t < fromTs) opening += i.total - i.paid;
    }
    for (const p of pays) {
      const t = new Date(p.date).getTime();
      if (t < fromTs) opening -= p.amount;
    }
    for (const r of rets) {
      const t = new Date(r.date).getTime();
      if (t < fromTs) opening -= r.total;
    }

    const inRange: Row[] = [];
    for (const i of invs) {
      const t = new Date(i.date).getTime();
      if (t >= fromTs && t <= toTs) {
        inRange.push({
          date: i.date,
          type: "Invoice",
          ref: `INV-${i.number}`,
          debit: i.total,
          credit: i.paid,
          notes: i.notes,
        });
      }
    }
    for (const p of pays) {
      const t = new Date(p.date).getTime();
      if (t >= fromTs && t <= toTs) {
        if (p.amount < 0) {
          inRange.push({
            date: p.date,
            type: "Cash Out",
            ref: p.method ?? "Cash given",
            debit: -p.amount,
            credit: 0,
            notes: p.notes,
          });
        } else {
          inRange.push({
            date: p.date,
            type: "Payment",
            ref: p.method ?? "Payment",
            debit: 0,
            credit: p.amount,
            notes: p.notes,
          });
        }
      }
    }

    for (const r of rets) {
      const t = new Date(r.date).getTime();
      if (t >= fromTs && t <= toTs) {
        inRange.push({
          date: r.date,
          type: "Sales Return",
          ref: `Return (${r.items.length} item${r.items.length === 1 ? "" : "s"})`,
          debit: 0,
          credit: r.total,
          notes: r.notes,
        });
      }
    }
    inRange.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totalDebit = inRange.reduce((s, r) => s + r.debit, 0);
    const totalCredit = inRange.reduce((s, r) => s + r.credit, 0);
    return { rows: inRange, openingBefore: opening, totalDebit, totalCredit };
  }, [c, db.invoices, db.payments, db.salesReturns, from, to, id]);

  if (refreshing) {
    return (
      <>
        <PageHeader title="Account Statement" subtitle="Refreshing saved records…" />
        <div className="p-8 text-sm text-muted-foreground">Loading the latest balance…</div>
      </>
    );
  }

  if (!c) {
    return (
      <>
        <PageHeader title="Customer not found" />
        <div className="p-8">
          <Link to="/customers">
            <Button variant="outline">
              <ArrowLeft /> Back
            </Button>
          </Link>
        </div>
      </>
    );
  }

  const closing = openingBefore + totalDebit - totalCredit;
  let running = openingBefore;

  function buildBodyHtml() {
    const rowsHtml = rows
      .map((r, idx) => {
        const run =
          openingBefore + rows.slice(0, idx + 1).reduce((s, x) => s + x.debit - x.credit, 0);
        return `<tr>
          <td>${fmtDate(r.date)}</td>
          <td>${r.type}</td>
          <td>${escapeHtml(r.ref)}${r.notes ? ` <span class="muted">· ${escapeHtml(r.notes)}</span>` : ""}</td>
          <td class="r">${r.debit ? fmtRound(r.debit) : "—"}</td>
          <td class="r">${r.credit ? fmtRound(r.credit) : "—"}</td>
          <td class="r">${fmtRound(run)}</td>
        </tr>`;
      })
      .join("");
    return `
      <div class="head">
        <div>
          <h1>${escapeHtml(db.company.name)}</h1>
          <div class="muted">${escapeHtml(db.company.address ?? "")}</div>
          ${db.company.phone ? `<div class="muted">${escapeHtml(db.company.phone)}</div>` : ""}
        </div>
        <div style="text-align:right">
          <div class="label">Account Statement</div>
          <div>${fmtDate(from)} — ${fmtDate(to)}</div>
        </div>
      </div>
      <div class="grid2">
        <div>
          <div class="label">Customer</div>
          <div style="font-weight:600">${escapeHtml(c!.name)}</div>
          ${c!.company ? `<div>${escapeHtml(c!.company)}</div>` : ""}
          ${c!.address ? `<div class="muted">${escapeHtml(c!.address)}</div>` : ""}
          ${c!.phone ? `<div class="muted">${escapeHtml(c!.phone)}</div>` : ""}
        </div>
        <div style="text-align:right">
          <div class="label">Opening balance</div>
          <div class="value">${fmtRound(openingBefore)}</div>
        </div>
      </div>
      <div class="grid3">
        <div class="box"><div class="label">Debit (Invoices)</div><div class="value">${fmtRound(totalDebit)}</div></div>
        <div class="box"><div class="label">Credit (Payments)</div><div class="value">${fmtRound(totalCredit)}</div></div>
        <div class="box"><div class="label">Closing Balance</div><div class="strong">${fmtRound(closing)}</div></div>
      </div>
      <table>
        <thead><tr>
          <th>Date</th><th>Type</th><th>Reference</th>
          <th class="r">Debit</th><th class="r">Credit</th><th class="r">Balance</th>
        </tr></thead>
        <tbody>
          <tr class="opening"><td colspan="5">Opening Balance</td><td class="r">${fmtRound(openingBefore)}</td></tr>
          ${rowsHtml || `<tr><td colspan="6" style="text-align:center;padding:20px" class="muted">No transactions in this period.</td></tr>`}
        </tbody>
        <tfoot>
          <tr class="totals"><td colspan="3">Period Totals</td>
            <td class="r">${fmtRound(totalDebit)}</td>
            <td class="r">${fmtRound(totalCredit)}</td><td></td></tr>
          <tr class="closing"><td colspan="5">Closing Balance</td>
            <td class="r">${fmtRound(closing)}</td></tr>
        </tfoot>
      </table>
      <div class="foot">
        <span>Generated on ${fmtDate(new Date())}</span>
        <span>Authorised Signatory</span>
      </div>`;
  }

  const printCss = `
    * { box-sizing: border-box; }
    body, .pdf-root { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#111; margin:0; font-size:12px; background:#fff; }
    h1 { font-size: 20px; margin:0; }
    table { width:100%; border-collapse: collapse; margin-top:6px; }
    th, td { padding:6px 8px; text-align:left; border-bottom:1px solid #e5e7eb; vertical-align:top; }
    thead th { background:#f3f4f6; font-weight:600; font-size:10px; text-transform:uppercase; letter-spacing:.04em; }
    .r { text-align:right; font-variant-numeric: tabular-nums; }
    .muted { color:#6b7280; }
    .head { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:10px; border-bottom:1px solid #e5e7eb; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:24px; padding:12px 0; }
    .grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:8px 0 12px; }
    .box { border:1px solid #e5e7eb; border-radius:6px; padding:8px 10px; }
    .label { font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:#6b7280; }
    .value { font-size:16px; font-weight:600; margin-top:2px; font-variant-numeric: tabular-nums; }
    .strong { font-size:18px; font-weight:700; font-variant-numeric: tabular-nums; }
    .opening td { background:#fafafa; font-weight:600; }
    .totals td { border-top:2px solid #111; font-weight:600; }
    .closing td { font-weight:700; font-size:13px; background:#f3f4f6; }
    .foot { margin-top:24px; padding-top:10px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; font-size:10px; color:#6b7280; }`;

  async function downloadPdf() {
    // Offscreen container with plain (sRGB) colors so html2canvas works
    const container = document.createElement("div");
    container.className = "pdf-root";
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "0";
    container.style.width = "794px"; // ~A4 @96dpi
    container.style.padding = "32px";
    container.style.background = "#fff";
    const style = document.createElement("style");
    style.textContent = printCss;
    container.appendChild(style);
    const body = document.createElement("div");
    body.innerHTML = buildBodyHtml();
    container.appendChild(body);
    document.body.appendChild(container);

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(container, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = 210;
      const pageH = 297;
      const imgH = (canvas.height * pageW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, pageW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pageW, imgH);
        heightLeft -= pageH;
      }
      const safeName = c!.name.replace(/[^a-z0-9-_ ]/gi, "_");
      pdf.save(`Statement_${safeName}_${from}_${to}.pdf`);
    } finally {
      container.remove();
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <PageHeader
        title={`Statement — ${c.name}`}
        subtitle="Customer account statement"
        actions={
          <>
            <Link to="/customers/$id" params={{ id: c.id }}>
              <Button variant="outline">
                <ArrowLeft /> Back
              </Button>
            </Link>
            <Button variant="outline" onClick={downloadPdf}>
              <Download /> PDF
            </Button>
            <WhatsAppButton
              kind="statement"
              customerId={c.id}
              vars={{
                customer: c.name,
                date: fmtDate(to),
                balance: fmtRound(closing),
              }}
              fileName={`Statement_${c.name.replace(/[^a-z0-9-_ ]/gi, "_")}_${from}_${to}.pdf`}
              buildPdf={() =>
                buildStatementPdf({
                  company: db.company,
                  customerName: c.name,
                  customerCompany: c.company,
                  customerAddress: c.address,
                  customerPhone: c.phone,
                  from,
                  to,
                  opening: openingBefore,
                  rows: rows.map((r) => ({
                    date: r.date,
                    type: r.type,
                    ref: r.ref,
                    debit: r.debit,
                    credit: r.credit,
                  })),
                  totalDebit,
                  totalCredit,
                  closing,
                })
              }
            />
            <Button onClick={handlePrint}>
              <Printer /> Print
            </Button>
          </>
        }
      />
      <div className="p-8 space-y-4">
        <div className="no-print flex flex-wrap items-end justify-between gap-3 rounded-md border border-border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="mb-1.5 block text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadPdf}>
              <Download /> Download PDF
            </Button>
            <Button onClick={handlePrint}>
              <Printer /> Print Statement
            </Button>
          </div>
        </div>

        <div className="print-area mx-auto bg-card text-card-foreground border border-border rounded-md p-10 print:border-0 print:rounded-none print:p-0 max-w-[210mm] print:max-w-none print:w-full">
          <div className="flex justify-between items-start pb-4 border-b border-border">
            <div>
              <h1 className="text-2xl font-bold">{db.company.name}</h1>
              <div className="text-sm text-muted-foreground mt-1">{db.company.address}</div>
              {db.company.phone && (
                <div className="text-sm text-muted-foreground">{db.company.phone}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Account Statement
              </div>
              <div className="text-sm mt-1">
                {fmtDate(from)} — {fmtDate(to)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 py-5">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Customer
              </div>
              <div className="font-semibold">{c.name}</div>
              {c.company && <div className="text-sm">{c.company}</div>}
              {c.address && <div className="text-sm text-muted-foreground">{c.address}</div>}
              {c.phone && <div className="text-sm text-muted-foreground">{c.phone}</div>}
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Opening balance
              </div>
              <div className="text-xl font-semibold tabular-nums">{fmtRound(openingBefore)}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pb-5">
            <SummaryBox
              label="Debit Balance"
              hint="Total sales in period"
              value={fmtRound(totalDebit)}
            />
            <SummaryBox
              label="Credit Balance"
              hint="Total received in period"
              value={fmtRound(totalCredit)}
              tone="text-success"
            />
            <SummaryBox
              label="Balance"
              hint="Closing balance"
              value={fmtRound(closing)}
              tone={closing > 0 ? "text-warning" : "text-success"}
              strong
            />
          </div>

          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Reference</th>
                <th className="px-3 py-2 font-medium text-right">Debit</th>
                <th className="px-3 py-2 font-medium text-right">Credit</th>
                <th className="px-3 py-2 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border bg-muted/40">
                <td className="px-3 py-2" colSpan={5}>
                  <span className="font-medium">Opening Balance</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {fmtRound(openingBefore)}
                </td>
              </tr>
              {rows.length === 0 ? (
                <tr className="border-t border-border">
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={6}>
                    No transactions in this period.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => {
                  running = running + r.debit - r.credit;
                  return (
                    <tr key={idx} className="border-t border-border">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {fmtDate(r.date)}
                      </td>
                      <td className="px-3 py-2">{r.type}</td>
                      <td className="px-3 py-2">
                        {r.ref}
                        {r.notes && <span className="text-muted-foreground"> · {r.notes}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.debit ? fmtRound(r.debit) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.credit ? fmtRound(r.credit) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtRound(running)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40">
                <td className="px-3 py-2 font-semibold" colSpan={3}>
                  Period Totals
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {fmtRound(totalDebit)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {fmtRound(totalCredit)}
                </td>
                <td className="px-3 py-2"></td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-3 py-3 font-semibold" colSpan={5}>
                  Closing Balance
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-bold text-base">
                  {fmtRound(closing)}
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-10 pt-6 border-t border-border flex justify-between text-xs text-muted-foreground">
            <span>Generated on {fmtDate(new Date())}</span>
            <span>Authorised Signatory</span>
          </div>
        </div>
      </div>
    </>
  );
}

function SummaryBox({
  label,
  hint,
  value,
  tone,
  strong,
}: {
  label: string;
  hint?: string;
  value: string;
  tone?: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground/70">{hint}</div>}
      <div
        className={`mt-1 tabular-nums ${strong ? "text-xl font-bold" : "text-lg font-semibold"} ${tone ?? ""}`}
      >
        {value}
      </div>
    </div>
  );
}
