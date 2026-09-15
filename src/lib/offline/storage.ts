import { get, set, del, createStore } from "idb-keyval";
import type { DBShape, Invoice } from "@/lib/types";

const store = createStore("medi-offline", "kv");

const SNAPSHOT_KEY = (userId: string) => `snapshot::${userId}`;
const QUEUE_KEY = (userId: string) => `queue::${userId}`;
const SYNC_KEY = (userId: string) => `lastSync::${userId}`;

// Generic queued operation. Kinds map 1:1 to store mutations.
export type QueuedOpKind =
  | "invoice.create"
  | "invoice.update"
  | "invoice.delete"
  | "payment.create"
  | "payment.delete"
  | "purchase.create"
  | "purchase.update"
  | "purchase.delete"
  | "supplier.create"
  | "supplier.update"
  | "supplier.delete"
  | "supplierPayment.create"
  | "supplierPayment.delete"
  | "salesReturn.create"
  | "salesReturn.update"
  | "salesReturn.delete"
  | "purchaseReturn.create"
  | "purchaseReturn.update"
  | "purchaseReturn.delete"
  | "customer.create"
  | "customer.update"
  | "customer.delete"
  | "product.create"
  | "product.update"
  | "product.delete"
  | "company.update";

export interface QueuedOp {
  id: string;
  kind: QueuedOpKind;
  payload: Record<string, unknown>;
  enqueuedAt: string;
  attempts: number;
  lastError?: string;
  skipped?: boolean;
}

// Back-compat: old queue items had shape { kind: "invoice", invoice, ... }.
// Legacy readers can still see `.invoice`; new dispatcher reads `.payload`.
export type LegacyInvoiceOp = {
  kind: "invoice";
  invoice: Invoice;
  enqueuedAt: string;
  attempts: number;
  lastError?: string;
};
export type QueuedInvoice = QueuedOp | LegacyInvoiceOp;

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export async function loadSnapshot(userId: string): Promise<DBShape | null> {
  try {
    return ((await get(SNAPSHOT_KEY(userId), store)) as DBShape) ?? null;
  } catch {
    return null;
  }
}

export async function saveSnapshot(userId: string, db: DBShape): Promise<void> {
  try {
    await set(SNAPSHOT_KEY(userId), db, store);
    await set(SYNC_KEY(userId), new Date().toISOString(), store);
  } catch (e) {
    console.warn("[offline] snapshot save failed", e);
  }
}

export async function getLastSync(userId: string): Promise<string | null> {
  try {
    return ((await get(SYNC_KEY(userId), store)) as string) ?? null;
  } catch {
    return null;
  }
}

/** Loads the queue and migrates legacy invoice-only items to the new op shape. */
export async function loadQueue(userId: string): Promise<QueuedOp[]> {
  try {
    const raw = ((await get(QUEUE_KEY(userId), store)) as QueuedInvoice[]) ?? [];
    let migrated = false;
    const ops: QueuedOp[] = raw.map((item) => {
      if ((item as LegacyInvoiceOp).kind === "invoice") {
        migrated = true;
        const legacy = item as LegacyInvoiceOp;
        return {
          id: uid(),
          kind: "invoice.create",
          payload: { invoice: legacy.invoice },
          enqueuedAt: legacy.enqueuedAt,
          attempts: legacy.attempts,
          lastError: legacy.lastError,
        };
      }
      return item as QueuedOp;
    });
    if (migrated) await set(QUEUE_KEY(userId), ops, store);
    return ops;
  } catch {
    return [];
  }
}

export async function saveQueue(userId: string, q: QueuedOp[]): Promise<void> {
  await set(QUEUE_KEY(userId), q, store);
}

export async function enqueueOp(
  userId: string,
  kind: QueuedOpKind,
  payload: Record<string, unknown>,
): Promise<QueuedOp[]> {
  const q = await loadQueue(userId);
  q.push({
    id: uid(),
    kind,
    payload,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
  });
  await saveQueue(userId, q);
  return q;
}

/** Back-compat helper — still used by createInvoice offline path. */
export async function enqueueInvoice(userId: string, invoice: Invoice): Promise<QueuedOp[]> {
  return enqueueOp(userId, "invoice.create", { invoice });
}

export async function clearAll(userId: string): Promise<void> {
  await del(SNAPSHOT_KEY(userId), store);
  await del(QUEUE_KEY(userId), store);
  await del(SYNC_KEY(userId), store);
}

export const QUEUE_SOFT_LIMIT = 500;
export const QUEUE_HARD_LIMIT = 5000;
export const MAX_ATTEMPTS = 5;
