import { fmtDate, fmtDateTime } from "./store";
// Lightweight, text-based PDF generation using jsPDF + autoTable.
// Used for WhatsApp share so files stay small and crisp.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

type Company = { name: string; address: string; phone: string };

type InvoiceItem = { productName: string; qty: number; price: number };

export type InvoicePdfInput = {
  company: Company;
  number: number;
  date: string;
  customerName: string;
  customerCompany?: string;
  customerAddress?: string;
  customerPhone?: string;
  items: InvoiceItem[];
  total: number;
  paid: number;
  notes?: string;
};

function money(n: number): string {
  const v = Number(n) || 0;
  const rounded = Math.round(v * 100) / 100;
  const hasDecimals = rounded !== Math.round(rounded);
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

function moneyRound(n: number): string {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function header(doc: jsPDF, company: Company, rightTitle: string, rightLines: string[]) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(company.name, 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  let y = 24;
  if (company.address) {
    doc.text(company.address, 14, y);
    y += 4.5;
  }
  if (company.phone) {
    doc.text(company.phone, 14, y);
  }

  doc.setTextColor(110);
  doc.setFontSize(8);
  doc.text(rightTitle.toUpperCase(), 196, 14, { align: "right" });
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(rightLines[0] ?? "", 196, 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  rightLines.slice(1).forEach((line, i) => {
    doc.text(line, 196, 25 + i * 4.5, { align: "right" });
  });

  doc.setDrawColor(220);
  doc.line(14, 34, 196, 34);
  doc.setTextColor(20);
}

function footer(doc: jsPDF) {
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220);
  doc.line(14, h - 18, 196, h - 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Generated ${fmtDate(new Date())}`, 14, h - 12);
  doc.text("Authorised Signatory", 196, h - 12, { align: "right" });
  doc.setTextColor(20);
}

export function buildInvoicePdf(input: InvoicePdfInput): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(doc, input.company, "Invoice", [
    `INV-${input.number}`,
    fmtDate(input.date),
  ]);

  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text("BILL TO", 14, 41);
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(input.customerName, 14, 47);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let by = 52;
  if (input.customerCompany) {
    doc.text(input.customerCompany, 14, by);
    by += 4.5;
  }
  if (input.customerAddress) {
    doc.setTextColor(110);
    doc.text(input.customerAddress, 14, by);
    by += 4.5;
    doc.setTextColor(20);
  }
  if (input.customerPhone) {
    doc.setTextColor(110);
    doc.text(input.customerPhone, 14, by);
    by += 4.5;
    doc.setTextColor(20);
  }

  autoTable(doc, {
    startY: Math.max(by + 2, 62),
    head: [["#", "Product", "Qty", "Price", "Amount"]],
    body: input.items.map((it, i) => [
      String(i + 1),
      it.productName,
      money(it.qty),
      money(it.price),
      money(it.qty * it.price),
    ]),
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [240, 240, 245], textColor: 40, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 10 },
      2: { halign: "right", cellWidth: 22 },
      3: { halign: "right", cellWidth: 28 },
      4: { halign: "right", cellWidth: 32 },
    },
    margin: { left: 14, right: 14 },
  });

  // Totals box
  // @ts-expect-error autotable adds lastAutoTable on jsPDF runtime
  const endY: number = (doc.lastAutoTable?.finalY ?? 70) + 8;
  const balance = input.total - input.paid;
  const totalsX = 130;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Total", totalsX, endY);
  doc.text(moneyRound(input.total), 196, endY, { align: "right" });
  doc.text("Paid", totalsX, endY + 6);
  doc.text(moneyRound(input.paid), 196, endY + 6, { align: "right" });
  doc.setDrawColor(200);
  doc.line(totalsX, endY + 9, 196, endY + 9);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Balance Due", totalsX, endY + 14);
  doc.text(moneyRound(balance), 196, endY + 14, { align: "right" });
  doc.setFont("helvetica", "normal");

  if (input.notes) {
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text("NOTES", 14, endY);
    doc.setTextColor(40);
    doc.setFontSize(9);
    const wrapped = doc.splitTextToSize(input.notes, 110);
    doc.text(wrapped, 14, endY + 5);
  }

  footer(doc);
  return doc.output("blob");
}

export type StatementRow = {
  date: string;
  type: string;
  ref: string;
  debit: number;
  credit: number;
};

export type StatementPdfInput = {
  company: Company;
  customerName: string;
  customerCompany?: string;
  customerAddress?: string;
  customerPhone?: string;
  partyLabel?: string; // defaults to "CUSTOMER"
  from: string; // ISO date
  to: string; // ISO date
  opening: number;
  rows: StatementRow[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
};


export function buildStatementPdf(input: StatementPdfInput): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(doc, input.company, "Account Statement", [
    input.customerName,
    `${fmtDate(input.from)} — ${fmtDate(input.to)}`,
  ]);

  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(input.partyLabel ?? "CUSTOMER", 14, 41);
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(input.customerName, 14, 47);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let by = 52;
  if (input.customerCompany) {
    doc.text(input.customerCompany, 14, by);
    by += 4.5;
  }
  doc.setTextColor(110);
  if (input.customerAddress) {
    doc.text(input.customerAddress, 14, by);
    by += 4.5;
  }
  if (input.customerPhone) {
    doc.text(input.customerPhone, 14, by);
    by += 4.5;
  }
  doc.setTextColor(20);

  // Summary box
  const sx = 130;
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text("OPENING", sx, 41);
  doc.text("DEBIT", sx + 22, 41);
  doc.text("CREDIT", sx + 44, 41);
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(moneyRound(input.opening), sx, 47);
  doc.text(moneyRound(input.totalDebit), sx + 22, 47);
  doc.text(moneyRound(input.totalCredit), sx + 44, 47);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text("CLOSING BALANCE", sx, 55);
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(moneyRound(input.closing), sx, 62);
  doc.setFont("helvetica", "normal");

  let running = input.opening;
  const body = [
    ["", "Opening Balance", "", "", "", moneyRound(input.opening)],
    ...input.rows.map((r) => {
      running = running + r.debit - r.credit;
      return [
        fmtDate(r.date),
        r.type,
        r.ref,
        r.debit ? moneyRound(r.debit) : "—",
        r.credit ? moneyRound(r.credit) : "—",
        moneyRound(running),
      ];
    }),
  ];

  autoTable(doc, {
    startY: Math.max(by + 4, 70),
    head: [["Date", "Type", "Reference", "Debit", "Credit", "Balance"]],
    body,
    foot: [
      [
        "",
        "",
        "Period Totals",
        moneyRound(input.totalDebit),
        moneyRound(input.totalCredit),
        "",
      ],
      ["", "", "Closing Balance", "", "", moneyRound(input.closing)],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [240, 240, 245], textColor: 40, fontStyle: "bold" },
    footStyles: { fillColor: [245, 245, 250], textColor: 20, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 24 },
      3: { halign: "right", cellWidth: 25 },
      4: { halign: "right", cellWidth: 25 },
      5: { halign: "right", cellWidth: 28 },
    },
    margin: { left: 14, right: 14 },
  });

  footer(doc);
  return doc.output("blob");
}

export type ReturnPdfInput = {
  company: Company;
  kind: "sales" | "purchase";
  refLabel: string; // e.g. "SR-2025-0001" or just shortened id
  date: string;
  partyName: string;
  partyCompany?: string;
  partyAddress?: string;
  partyPhone?: string;
  items: InvoiceItem[];
  total: number;
  notes?: string;
};

export function buildReturnPdf(input: ReturnPdfInput): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const title = input.kind === "sales" ? "Sales Return" : "Purchase Return";
  header(doc, input.company, title, [input.refLabel, fmtDate(input.date)]);

  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(input.kind === "sales" ? "FROM CUSTOMER" : "TO SUPPLIER", 14, 41);
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(input.partyName, 14, 47);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let by = 52;
  if (input.partyCompany) { doc.text(input.partyCompany, 14, by); by += 4.5; }
  if (input.partyAddress) { doc.setTextColor(110); doc.text(input.partyAddress, 14, by); by += 4.5; doc.setTextColor(20); }
  if (input.partyPhone) { doc.setTextColor(110); doc.text(input.partyPhone, 14, by); by += 4.5; doc.setTextColor(20); }

  autoTable(doc, {
    startY: Math.max(by + 2, 62),
    head: [["#", "Product", "Qty", "Price", "Amount"]],
    body: input.items.map((it, i) => [
      String(i + 1),
      it.productName,
      money(it.qty),
      money(it.price),
      money(it.qty * it.price),
    ]),
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [240, 240, 245], textColor: 40, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 10 },
      2: { halign: "right", cellWidth: 22 },
      3: { halign: "right", cellWidth: 28 },
      4: { halign: "right", cellWidth: 32 },
    },
    margin: { left: 14, right: 14 },
  });

  // @ts-expect-error autotable adds lastAutoTable on jsPDF runtime
  const endY: number = (doc.lastAutoTable?.finalY ?? 70) + 8;
  const totalsX = 130;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Total", totalsX, endY + 6);
  doc.text(money(input.total), 196, endY + 6, { align: "right" });
  doc.setFont("helvetica", "normal");

  if (input.notes) {
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text("NOTES", 14, endY);
    doc.setTextColor(40);
    doc.setFontSize(9);
    const wrapped = doc.splitTextToSize(input.notes, 110);
    doc.text(wrapped, 14, endY + 5);
  }

  footer(doc);
  return doc.output("blob");
}

