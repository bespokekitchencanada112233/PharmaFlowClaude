import { useCallback } from "react";
import { toast } from "sonner";
import { useStore, fmt, fmtDate } from "@/lib/store";
import { buildSmsMessage, useSendSms } from "@/lib/sms";
import type { Invoice, Payment } from "@/lib/types";

// Session-scoped dedupe so double-clicking Print doesn't re-send.
const sentInvoiceSms = new Set<string>();

export function useAutoPaymentSms() {
  const { db, customerBalance } = useStore();
  const { send } = useSendSms();

  const enabled = () =>
    (db.company.smsEnabled ?? false) &&
    (db.company.smsPaymentEnabled ?? true);

  const sendOne = useCallback(
    async (p: Payment): Promise<boolean> => {
      if (!enabled()) return false;
      if (p.amount <= 0) return false; // skip cash-out / refunds
      const customer = db.customers.find((c) => c.id === p.customerId);
      const phone = customer?.phone?.trim();
      if (!phone) return false;
      const message = buildSmsMessage(
        "payment",
        {
          invoice: db.company.smsInvoiceTemplate,
          payment: db.company.smsPaymentTemplate,
        },
        db.company.name,
        {
          customer: p.customerName,
          amount: fmt(p.amount),
          date: fmtDate(p.date),
          balance: fmt(customerBalance(p.customerId) - p.amount),
          method: p.method ?? "",
        },
      );
      const res = await send(phone, message, { silent: true });
      return res.ok;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.company, db.customers, customerBalance, send],
  );

  const sendPaymentSms = useCallback(
    async (p: Payment) => {
      const ok = await sendOne(p);
      if (ok) toast.success(`SMS sent to ${p.customerName}`);
    },
    [sendOne],
  );

  const sendBulkPaymentSms = useCallback(
    async (payments: Payment[]) => {
      if (!enabled()) return;
      const results = await Promise.all(payments.map(sendOne));
      const n = results.filter(Boolean).length;
      if (n > 0)
        toast.success(`SMS sent to ${n} customer${n === 1 ? "" : "s"}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sendOne, db.company],
  );

  return { sendPaymentSms, sendBulkPaymentSms };
}

export function useAutoInvoiceSms() {
  const { db } = useStore();
  const { send } = useSendSms();

  const sendInvoiceSmsOnce = useCallback(
    async (inv: Invoice) => {
      if (!(db.company.smsEnabled ?? false)) return;
      if (!(db.company.smsInvoiceEnabled ?? true)) return;
      if (sentInvoiceSms.has(inv.id)) return;
      const customer = db.customers.find((c) => c.id === inv.customerId);
      const phone = customer?.phone?.trim();
      if (!phone) return;
      sentInvoiceSms.add(inv.id);
      const message = buildSmsMessage(
        "invoice",
        {
          invoice: db.company.smsInvoiceTemplate,
          payment: db.company.smsPaymentTemplate,
        },
        db.company.name,
        {
          customer: inv.customerName,
          number: `INV-${inv.number}`,
          date: fmtDate(inv.date),
          total: fmt(inv.total),
          paid: fmt(inv.paid),
          due: fmt(inv.total - inv.paid),
        },
      );
      const res = await send(phone, message, { silent: true });
      if (res.ok) toast.success(`SMS sent to ${inv.customerName}`);
      else sentInvoiceSms.delete(inv.id); // allow retry on failure
    },
    [db.company, db.customers, send],
  );

  return { sendInvoiceSmsOnce };
}
