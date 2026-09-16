// Electron-only replacement for offline/storage.ts (aliased in
// electron.vite.config.ts). Backs the same snapshot/queue/lastSync
// key-value shape with a real SQLite file on disk (see electron/db.cjs)
// instead of the web build's IndexedDB, via the `window.electronDB` bridge
// exposed by electron/preload.cjs. sync.ts and every data hook are
// unchanged -- they only ever went through this module's exported API.
import type { DBShape, Invoice } from "@/lib/types";
import type { QueuedOp, QueuedOpKind, QueuedInvoice, LegacyInvoiceOp } from "./storage";

export type { QueuedOp, QueuedOpKind, QueuedInvoice, LegacyInvoiceOp } from "./storage";
export { QUEUE_SOFT_LIMIT, QUEUE_HARD_LIMIT, MAX_ATTEMPTS } from "./storage";

declare global {
  interface Window {
    electronDB: {
      get: (key: string) => Promise<unknown>;
      set: (key: string, value: unknown) => Promise<void>;
      del: (key: string) => Promise<void>;
    };
  }
}

const SNAPSHOT_KEY = (userId: string) => `snapshot::${userId}`;
const QUEUE_KEY = (userId: string) => `queue::${userId}`;
const SYNC_KEY = (userId: string) => `lastSync::${userId}`;

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export async function loadSnapshot(userId: string): Promise<DBShape | null> {
  try {
    return ((await window.electronDB.get(SNAPSHOT_KEY(userId))) as DBShape) ?? null;
  } catch {
    return null;
  }
}

export async function saveSnapshot(userId: string, db: DBShape): Promise<void> {
  try {
    await window.electronDB.set(SNAPSHOT_KEY(userId), db);
    await window.electronDB.set(SYNC_KEY(userId), new Date().toISOString());
  } catch (e) {
    console.warn("[offline] snapshot save failed", e);
  }
}

export async function getLastSync(userId: string): Promise<string | null> {
  try {
    return ((await window.electronDB.get(SYNC_KEY(userId))) as string) ?? null;
  } catch {
    return null;
  }
}

/** Loads the queue and migrates legacy invoice-only items to the new op shape. */
export async function loadQueue(userId: string): Promise<QueuedOp[]> {
  try {
    const raw = ((await window.electronDB.get(QUEUE_KEY(userId))) as QueuedInvoice[]) ?? [];
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
    if (migrated) await window.electronDB.set(QUEUE_KEY(userId), ops);
    return ops;
  } catch {
    return [];
  }
}

export async function saveQueue(userId: string, q: QueuedOp[]): Promise<void> {
  await window.electronDB.set(QUEUE_KEY(userId), q);
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
  await window.electronDB.del(SNAPSHOT_KEY(userId));
  await window.electronDB.del(QUEUE_KEY(userId));
  await window.electronDB.del(SYNC_KEY(userId));
}
