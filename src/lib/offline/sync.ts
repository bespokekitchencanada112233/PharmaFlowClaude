import { supabase } from "@/integrations/supabase/client";
import { loadQueue, saveQueue, MAX_ATTEMPTS, type QueuedOp } from "./storage";
import type {
  Invoice,
  InvoiceItem,
  Payment,
  Purchase,
  Supplier,
  SupplierPayment,
  SalesReturn,
  PurchaseReturn,
  Customer,
  Product,
  DBShape,
} from "@/lib/types";

export interface SyncResult {
  succeeded: number;
  failed: QueuedOp[];
  skipped: number;
}

type Ctx = { userId: string };

async function handleOp(op: QueuedOp, ctx: Ctx): Promise<void> {
  const uid = ctx.userId;
  const p = op.payload as Record<string, unknown>;

  switch (op.kind) {
    case "invoice.create": {
      const inv = p.invoice as Invoice;
      const { error } = await supabase.from("invoices").insert({
        id: inv.id,
        user_id: uid,
        number: inv.number,
        customer_id: inv.customerId,
        customer_name: inv.customerName,
        date: inv.date,
        items: inv.items as never,
        total: inv.total,
        paid: inv.paid,
        notes: inv.notes ?? null,
      });
      if (error) {
        const msg = String(error.message || "");
        if (msg.includes("duplicate") || msg.includes("unique")) {
          const { data: maxRow } = await supabase
            .from("invoices")
            .select("number")
            .eq("user_id", uid)
            .order("number", { ascending: false })
            .limit(1)
            .maybeSingle();
          const newNumber = (maxRow?.number ?? 1000) + 1;
          inv.number = newNumber;
          const retry = await supabase.from("invoices").insert({
            id: inv.id,
            user_id: uid,
            number: newNumber,
            customer_id: inv.customerId,
            customer_name: inv.customerName,
            date: inv.date,
            items: inv.items as never,
            total: inv.total,
            paid: inv.paid,
            notes: inv.notes ?? null,
          });
          if (retry.error) throw retry.error;
        } else {
          throw error;
        }
      }
      await supabase
        .from("company_settings")
        .update({ invoice_counter: inv.number })
        .eq("user_id", uid);
      for (const it of inv.items) {
        const { data: prod } = await supabase
          .from("products")
          .select("stock")
          .eq("id", it.productId)
          .maybeSingle();
        if (prod) {
          await supabase
            .from("products")
            .update({ stock: Number(prod.stock) - it.qty })
            .eq("id", it.productId);
        }
      }
      await supabase.from("last_prices").upsert(
        inv.items.map((it: InvoiceItem) => ({
          user_id: uid,
          customer_id: inv.customerId,
          product_id: it.productId,
          price: it.price,
        })),
        { onConflict: "user_id,customer_id,product_id" },
      );
      return;
    }

    case "invoice.update": {
      const inv = p.invoice as Invoice;
      const oldItems = (p.oldItems as InvoiceItem[]) ?? [];
      const { error } = await supabase
        .from("invoices")
        .update({
          customer_id: inv.customerId,
          customer_name: inv.customerName,
          date: inv.date,
          items: inv.items as never,
          total: inv.total,
          paid: inv.paid,
          notes: inv.notes ?? null,
        })
        .eq("id", inv.id);
      if (error) throw error;
      const delta = stockDelta(oldItems, inv.items, +1);
      await applyStockDeltas(delta, -1);
      await supabase.from("last_prices").upsert(
        inv.items.map((it: InvoiceItem) => ({
          user_id: uid,
          customer_id: inv.customerId,
          product_id: it.productId,
          price: it.price,
        })),
        { onConflict: "user_id,customer_id,product_id" },
      );
      return;
    }

    case "invoice.delete": {
      const inv = p.invoice as Invoice;
      const { error } = await supabase.from("invoices").delete().eq("id", inv.id);
      if (error) throw error;
      for (const it of inv.items) {
        const { data: prod } = await supabase
          .from("products").select("stock").eq("id", it.productId).maybeSingle();
        if (prod) {
          await supabase.from("products")
            .update({ stock: Number(prod.stock) + it.qty }).eq("id", it.productId);
        }
      }
      return;
    }

    case "payment.create": {
      const pay = p.payment as Payment;
      const { error } = await supabase.from("payments").insert({
        id: pay.id, user_id: uid, customer_id: pay.customerId,
        customer_name: pay.customerName, date: pay.date, amount: pay.amount,
        method: pay.method ?? null, notes: pay.notes ?? null,
      });
      if (error) throw error;
      return;
    }
    case "payment.delete": {
      const { error } = await supabase.from("payments").delete().eq("id", p.id as string);
      if (error) throw error;
      return;
    }

    case "purchase.create": {
      const pur = p.purchase as Purchase;
      const { error } = await supabase.from("purchases").insert({
        id: pur.id, user_id: uid, number: pur.number,
        supplier_id: pur.supplierId, supplier_name: pur.supplierName,
        date: pur.date, items: pur.items as never, total: pur.total, paid: pur.paid,
        notes: pur.notes ?? null,
      });
      if (error) throw error;
      await supabase.from("company_settings")
        .update({ purchase_counter: pur.number }).eq("user_id", uid);
      for (const it of pur.items) {
        const { data: prod } = await supabase
          .from("products").select("stock").eq("id", it.productId).maybeSingle();
        if (prod) {
          await supabase.from("products")
            .update({ stock: Number(prod.stock) + it.qty }).eq("id", it.productId);
        }
      }
      return;
    }
    case "purchase.update": {
      const pur = p.purchase as Purchase;
      const oldItems = (p.oldItems as InvoiceItem[]) ?? [];
      const { error } = await supabase.from("purchases").update({
        supplier_id: pur.supplierId, supplier_name: pur.supplierName,
        date: pur.date, items: pur.items as never, total: pur.total, paid: pur.paid,
        notes: pur.notes ?? null,
      }).eq("id", pur.id);
      if (error) throw error;
      const delta = stockDelta(oldItems, pur.items, +1);
      await applyStockDeltas(delta, +1);
      return;
    }
    case "purchase.delete": {
      const pur = p.purchase as Purchase;
      const { error } = await supabase.from("purchases").delete().eq("id", pur.id);
      if (error) throw error;
      for (const it of pur.items) {
        const { data: prod } = await supabase
          .from("products").select("stock").eq("id", it.productId).maybeSingle();
        if (prod) {
          await supabase.from("products")
            .update({ stock: Number(prod.stock) - it.qty }).eq("id", it.productId);
        }
      }
      return;
    }

    case "supplier.create": {
      const s = p.supplier as Supplier;
      const { error } = await supabase.from("suppliers").insert({
        id: s.id, user_id: uid, name: s.name,
        phone: s.phone ?? null, address: s.address ?? null,
        area: s.area ?? null, company: s.company ?? null,
        opening_balance: s.openingBalance,
      });
      if (error) throw error;
      return;
    }
    case "supplier.update": {
      const { error } = await supabase.from("suppliers")
        .update(p.row as never).eq("id", p.id as string);
      if (error) throw error;
      return;
    }
    case "supplier.delete": {
      const { error } = await supabase.from("suppliers").delete().eq("id", p.id as string);
      if (error) throw error;
      return;
    }

    case "supplierPayment.create": {
      const pay = p.payment as SupplierPayment;
      const { error } = await supabase.from("supplier_payments").insert({
        id: pay.id, user_id: uid,
        supplier_id: pay.supplierId, supplier_name: pay.supplierName,
        date: pay.date, amount: pay.amount,
        method: pay.method ?? null, notes: pay.notes ?? null,
      });
      if (error) throw error;
      return;
    }
    case "supplierPayment.delete": {
      const { error } = await supabase.from("supplier_payments").delete().eq("id", p.id as string);
      if (error) throw error;
      return;
    }

    case "salesReturn.create": {
      const r = p.ret as SalesReturn;
      const { error } = await supabase.from("sales_returns").insert({
        id: r.id, user_id: uid, customer_id: r.customerId, customer_name: r.customerName,
        date: r.date, items: r.items as never, total: r.total, notes: r.notes ?? null,
      });
      if (error) throw error;
      for (const it of r.items) {
        const { data: prod } = await supabase
          .from("products").select("stock").eq("id", it.productId).maybeSingle();
        if (prod) await supabase.from("products").update({ stock: Number(prod.stock) + it.qty }).eq("id", it.productId);
      }
      return;
    }
    case "salesReturn.update": {
      const r = p.ret as SalesReturn;
      const oldItems = (p.oldItems as InvoiceItem[]) ?? [];
      const { error } = await supabase.from("sales_returns").update({
        customer_id: r.customerId, customer_name: r.customerName,
        date: r.date, items: r.items as never, total: r.total, notes: r.notes ?? null,
      }).eq("id", r.id);
      if (error) throw error;
      const delta = stockDelta(oldItems, r.items, +1);
      await applyStockDeltas(delta, +1);
      return;
    }
    case "salesReturn.delete": {
      const r = p.ret as SalesReturn;
      const { error } = await supabase.from("sales_returns").delete().eq("id", r.id);
      if (error) throw error;
      for (const it of r.items) {
        const { data: prod } = await supabase
          .from("products").select("stock").eq("id", it.productId).maybeSingle();
        if (prod) await supabase.from("products").update({ stock: Number(prod.stock) - it.qty }).eq("id", it.productId);
      }
      return;
    }

    case "purchaseReturn.create": {
      const r = p.ret as PurchaseReturn;
      const { error } = await supabase.from("purchase_returns").insert({
        id: r.id, user_id: uid, supplier_id: r.supplierId, supplier_name: r.supplierName,
        date: r.date, items: r.items as never, total: r.total, notes: r.notes ?? null,
      });
      if (error) throw error;
      for (const it of r.items) {
        const { data: prod } = await supabase
          .from("products").select("stock").eq("id", it.productId).maybeSingle();
        if (prod) await supabase.from("products").update({ stock: Number(prod.stock) - it.qty }).eq("id", it.productId);
      }
      return;
    }
    case "purchaseReturn.update": {
      const r = p.ret as PurchaseReturn;
      const oldItems = (p.oldItems as InvoiceItem[]) ?? [];
      const { error } = await supabase.from("purchase_returns").update({
        supplier_id: r.supplierId, supplier_name: r.supplierName,
        date: r.date, items: r.items as never, total: r.total, notes: r.notes ?? null,
      }).eq("id", r.id);
      if (error) throw error;
      const delta = stockDelta(oldItems, r.items, +1);
      await applyStockDeltas(delta, -1);
      return;
    }
    case "purchaseReturn.delete": {
      const r = p.ret as PurchaseReturn;
      const { error } = await supabase.from("purchase_returns").delete().eq("id", r.id);
      if (error) throw error;
      for (const it of r.items) {
        const { data: prod } = await supabase
          .from("products").select("stock").eq("id", it.productId).maybeSingle();
        if (prod) await supabase.from("products").update({ stock: Number(prod.stock) + it.qty }).eq("id", it.productId);
      }
      return;
    }

    case "customer.create": {
      const c = p.customer as Customer;
      const { error } = await supabase.from("customers").insert({
        id: c.id, user_id: uid, name: c.name,
        phone: c.phone ?? null, address: c.address ?? null,
        area: c.area ?? null, company: c.company ?? null,
        opening_balance: c.openingBalance,
      });
      if (error) throw error;
      return;
    }
    case "customer.update": {
      const { error } = await supabase.from("customers")
        .update(p.row as never).eq("id", p.id as string);
      if (error) throw error;
      return;
    }
    case "customer.delete": {
      const { error } = await supabase.from("customers").delete().eq("id", p.id as string);
      if (error) throw error;
      return;
    }

    case "product.create": {
      const pr = p.product as Product;
      const { error } = await supabase.from("products").insert({
        id: pr.id, user_id: uid, name: pr.name,
        company: pr.company ?? null, pack: pr.pack ?? null, unit: pr.unit ?? null,
        stock: pr.stock, purchase_price: pr.purchasePrice, sale_price: pr.salePrice,
        low_stock_threshold: pr.lowStockThreshold,
      });
      if (error) throw error;
      return;
    }
    case "product.update": {
      const { error } = await supabase.from("products")
        .update(p.row as never).eq("id", p.id as string);
      if (error) throw error;
      const bumped = p.bumpedLastPrices as Array<{ customer_id: string; product_id: string; price: number }> | undefined;
      if (bumped?.length) {
        await supabase.from("last_prices").upsert(
          bumped.map((r) => ({ ...r, user_id: uid })),
          { onConflict: "user_id,customer_id,product_id" },
        );
      }
      return;
    }
    case "product.delete": {
      const { error } = await supabase.from("products").delete().eq("id", p.id as string);
      if (error) throw error;
      return;
    }

    case "company.update": {
      const { error } = await supabase.from("company_settings")
        .upsert({ user_id: uid, ...(p.row as Record<string, unknown>) });
      if (error) throw error;
      return;
    }

    default: {
      throw new Error(`Unknown op kind: ${op.kind}`);
    }
  }
}

function stockDelta(oldItems: InvoiceItem[], newItems: InvoiceItem[], sign: 1 | -1): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of oldItems) m.set(it.productId, (m.get(it.productId) ?? 0) - it.qty * sign);
  for (const it of newItems) m.set(it.productId, (m.get(it.productId) ?? 0) + it.qty * sign);
  return m;
}

async function applyStockDeltas(delta: Map<string, number>, sign: 1 | -1): Promise<void> {
  // sign +1 → add delta to stock (purchases); sign -1 → subtract (sales)
  for (const [pid, d] of delta.entries()) {
    if (!d) continue;
    const { data: prod } = await supabase
      .from("products").select("stock").eq("id", pid).maybeSingle();
    if (prod) {
      await supabase.from("products")
        .update({ stock: Number(prod.stock) + d * sign }).eq("id", pid);
    }
  }
}

export async function processQueue(userId: string): Promise<SyncResult> {
  let queue = await loadQueue(userId);
  let succeeded = 0;
  let skipped = 0;
  const failed: QueuedOp[] = [];

  // Skip items already flagged as needs-attention
  const active = queue.filter((op) => !op.skipped);
  const inactive = queue.filter((op) => op.skipped);

  while (active.length > 0) {
    const item = active[0];
    try {
      await handleOp(item, { userId });
      active.shift();
      queue = [...active, ...inactive];
      await saveQueue(userId, queue);
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      item.attempts += 1;
      item.lastError = msg;
      if (item.attempts >= MAX_ATTEMPTS) {
        item.skipped = true;
        active.shift();
        inactive.push(item);
        skipped++;
        queue = [...active, ...inactive];
        await saveQueue(userId, queue);
        failed.push(item);
        continue; // don't block — try next op
      }
      queue = [...active, ...inactive];
      await saveQueue(userId, queue);
      failed.push(item);
      break; // stop to preserve order for transient errors
    }
  }

  return { succeeded, failed, skipped };
}

// Legacy export retained for imports that referenced the old type name.
export type { QueuedOp as QueuedInvoice } from "./storage";
export type { DBShape };
