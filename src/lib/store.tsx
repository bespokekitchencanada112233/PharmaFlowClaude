import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, AuthProvider } from "./auth";
import { LoginPage } from "@/components/LoginPage";
import { toast } from "sonner";
import type {
  Customer,
  DBShape,
  Invoice,
  InvoiceItem,
  Payment,
  Product,
  Supplier,
  Purchase,
  SupplierPayment,
  PurchaseReturn,
  SalesReturn,
} from "./types";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  loadSnapshot, saveSnapshot, loadQueue, enqueueOp,
  getLastSync, QUEUE_HARD_LIMIT, QUEUE_SOFT_LIMIT, saveQueue,
  type QueuedOpKind,
} from "./offline/storage";
import { processQueue } from "./offline/sync";

const initial: DBShape = {
  customers: [],
  products: [],
  invoices: [],
  payments: [],
  suppliers: [],
  purchases: [],
  supplierPayments: [],
  purchaseReturns: [],
  salesReturns: [],
  lastPrices: {},
  invoiceCounter: 1000,
  purchaseCounter: 1000,
  company: { name: "Your Pharma Distributors", address: "Main Market", phone: "" },
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

interface StoreCtx {
  db: DBShape;
  loading: boolean;
  addCustomer: (c: Omit<Customer, "id" | "createdAt">) => Customer;
  updateCustomer: (id: string, patch: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  addProduct: (p: Omit<Product, "id" | "createdAt">) => Product;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  createInvoice: (input: {
    customerId: string;
    items: InvoiceItem[];
    paid: number;
    notes?: string;
    date?: string;
  }) => Invoice;
  deleteInvoice: (id: string) => void;
  updateInvoice: (
    id: string,
    input: { customerId: string; items: InvoiceItem[]; paid: number; notes?: string; date?: string },
  ) => void;
  addPayment: (p: Omit<Payment, "id" | "customerName">) => Payment;
  deletePayment: (id: string) => void;
  getLastPrice: (customerId: string, productId: string) => number | null;
  updateCompany: (patch: Partial<DBShape["company"]>) => void;
  customerBalance: (customerId: string) => number;
  // Suppliers
  addSupplier: (s: Omit<Supplier, "id" | "createdAt">) => Supplier;
  updateSupplier: (id: string, patch: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
  supplierBalance: (supplierId: string) => number;
  // Purchases
  createPurchase: (input: {
    supplierId: string;
    items: InvoiceItem[];
    paid: number;
    notes?: string;
    date?: string;
  }) => Purchase;
  deletePurchase: (id: string) => void;
  updatePurchase: (
    id: string,
    input: { supplierId: string; items: InvoiceItem[]; paid: number; notes?: string; date?: string },
  ) => void;
  // Supplier payments
  addSupplierPayment: (p: Omit<SupplierPayment, "id" | "supplierName">) => SupplierPayment;
  deleteSupplierPayment: (id: string) => void;
  // Purchase returns
  createPurchaseReturn: (input: {
    supplierId: string;
    items: InvoiceItem[];
    notes?: string;
    date?: string;
  }) => PurchaseReturn;
  updatePurchaseReturn: (
    id: string,
    input: { supplierId: string; items: InvoiceItem[]; notes?: string; date?: string },
  ) => void;
  deletePurchaseReturn: (id: string) => void;
  // Sales returns
  createSalesReturn: (input: {
    customerId: string;
    items: InvoiceItem[];
    notes?: string;
    date?: string;
  }) => SalesReturn;
  updateSalesReturn: (
    id: string,
    input: { customerId: string; items: InvoiceItem[]; notes?: string; date?: string },
  ) => void;
  deleteSalesReturn: (id: string) => void;
  resetAll: () => Promise<void>;
  importAll: (data: DBShape) => Promise<void>;
  signOut: () => Promise<void>;
  // offline
  online: boolean;
  pendingCount: number;
  syncing: boolean;
  lastSyncAt: string | null;
  syncNow: () => Promise<void>;
  pendingError: string | null;
  discardPending: () => Promise<void>;
  refreshData: () => Promise<void>;
}

const Ctx = createContext<StoreCtx | null>(null);

// ---------- mapping helpers ----------
type CustomerRow = {
  id: string; name: string; phone: string | null; address: string | null;
  area: string | null; company: string | null; opening_balance: number;
  created_at: string;
};
type ProductRow = {
  id: string; name: string; company: string | null; pack: string | null;
  unit: string | null; stock: number; purchase_price: number; sale_price: number;
  low_stock_threshold: number; created_at: string;
};
type InvoiceRow = {
  id: string; number: number; customer_id: string; customer_name: string;
  date: string; items: InvoiceItem[]; total: number; paid: number;
  notes: string | null; updated_at?: string | null;
};
type LastPriceRow = { customer_id: string; product_id: string; price: number };
type PaymentRow = {
  id: string; customer_id: string; customer_name: string; date: string;
  amount: number; method: string | null; notes: string | null;
};
type SettingsRow = {
  name: string; address: string; phone: string;
  invoice_counter: number; purchase_counter: number;
};
type SupplierRow = {
  id: string; name: string; phone: string | null; address: string | null;
  area: string | null; company: string | null; opening_balance: number;
  created_at: string;
};
type PurchaseRow = {
  id: string; number: number; supplier_id: string; supplier_name: string;
  date: string; items: InvoiceItem[]; total: number; paid: number;
  notes: string | null;
};
type SupplierPaymentRow = {
  id: string; supplier_id: string; supplier_name: string; date: string;
  amount: number; method: string | null; notes: string | null;
};
type PurchaseReturnRow = {
  id: string; supplier_id: string; supplier_name: string;
  date: string; items: InvoiceItem[]; total: number; notes: string | null;
};
type SalesReturnRow = {
  id: string; customer_id: string; customer_name: string;
  date: string; items: InvoiceItem[]; total: number; notes: string | null;
};

const mapCustomer = (r: CustomerRow): Customer => ({
  id: r.id, name: r.name, phone: r.phone ?? undefined,
  address: r.address ?? undefined, area: r.area ?? undefined,
  company: r.company ?? undefined, openingBalance: Number(r.opening_balance),
  createdAt: r.created_at,
});
const mapProduct = (r: ProductRow): Product => ({
  id: r.id, name: r.name, company: r.company ?? undefined,
  pack: r.pack ?? undefined, unit: r.unit ?? undefined,
  stock: Number(r.stock), purchasePrice: Number(r.purchase_price),
  salePrice: Number(r.sale_price),
  lowStockThreshold: Number(r.low_stock_threshold), createdAt: r.created_at,
});
const mapInvoice = (r: InvoiceRow): Invoice => ({
  id: r.id, number: r.number, customerId: r.customer_id,
  customerName: r.customer_name, date: r.date, items: r.items,
  total: Number(r.total), paid: Number(r.paid), notes: r.notes ?? undefined,
  updatedAt: r.updated_at ?? undefined,
});
const mapPayment = (r: PaymentRow): Payment => ({
  id: r.id, customerId: r.customer_id, customerName: r.customer_name,
  date: r.date, amount: Number(r.amount),
  method: r.method ?? undefined, notes: r.notes ?? undefined,
});
const mapSupplier = (r: SupplierRow): Supplier => ({
  id: r.id, name: r.name, phone: r.phone ?? undefined,
  address: r.address ?? undefined, area: r.area ?? undefined,
  company: r.company ?? undefined, openingBalance: Number(r.opening_balance),
  createdAt: r.created_at,
});
const mapPurchase = (r: PurchaseRow): Purchase => ({
  id: r.id, number: r.number, supplierId: r.supplier_id,
  supplierName: r.supplier_name, date: r.date, items: r.items,
  total: Number(r.total), paid: Number(r.paid), notes: r.notes ?? undefined,
});
const mapSupplierPayment = (r: SupplierPaymentRow): SupplierPayment => ({
  id: r.id, supplierId: r.supplier_id, supplierName: r.supplier_name,
  date: r.date, amount: Number(r.amount),
  method: r.method ?? undefined, notes: r.notes ?? undefined,
});
const mapPurchaseReturn = (r: PurchaseReturnRow): PurchaseReturn => ({
  id: r.id, supplierId: r.supplier_id, supplierName: r.supplier_name,
  date: r.date, items: r.items, total: Number(r.total),
  notes: r.notes ?? undefined,
});
const mapSalesReturn = (r: SalesReturnRow): SalesReturn => ({
  id: r.id, customerId: r.customer_id, customerName: r.customer_name,
  date: r.date, items: r.items, total: Number(r.total),
  notes: r.notes ?? undefined,
});

// ---------- inner provider (auth-gated) ----------
function InnerStoreProvider({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const [db, setDb] = useState<DBShape>(initial);
  const [loading, setLoading] = useState(true);
  const online = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const [pendingError, setPendingError] = useState<string | null>(null);

  const refreshPending = useCallback(async () => {
    if (!user) { setPendingCount(0); setPendingError(null); return; }
    const q = await loadQueue(user.id);
    setPendingCount(q.length);
    setPendingError(q.find((op) => op.lastError)?.lastError ?? null);
  }, [user]);

  // (discardPending is defined after loadAll so it can re-pull server data)


  const loadAll = useCallback(async (skipSnapshot = false) => {
    if (!user) return;
    setLoading(true);

    // 1. Hydrate from local snapshot first so the UI is usable instantly
    if (!skipSnapshot) {
      const snap = await loadSnapshot(user.id);
      if (snap) {
        setDb(snap);
        setLoading(false);
        const ls = await getLastSync(user.id);
        if (ls) setLastSyncAt(ls);
      }
    }
    await refreshPending();

    // 2. If offline, stop here — we'll keep using the snapshot
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setLoading(false);
      return;
    }

    try {
      // Paginated fetch — PostgREST caps each request at 1000 rows
      const fetchAll = async <T,>(
        table: string,
        select: string,
        order?: { column: string; ascending?: boolean },
      ): Promise<{ data: T[] | null; error: unknown }> => {
        const pageSize = 1000;
        const out: T[] = [];
        let from = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          let q = (supabase.from(table as never) as any).select(select).range(from, from + pageSize - 1);
          if (order) {
            // A unique tie-breaker is required for pagination. Ordering only by
            // date/name lets equal values move between pages and duplicates a
            // row when a table has more than 1,000 records.
            q = q
              .order(order.column, { ascending: order.ascending ?? true })
              .order("id", { ascending: true });
          }
          const { data, error } = await q;
          if (error) return { data: null, error };
          const rows = (data ?? []) as unknown as T[];
          out.push(...rows);
          if (rows.length < pageSize) break;
          from += pageSize;
        }
        return { data: out, error: null };
      };

      const [c, p, i, lp, st, pay, sup, pur, supPay, pRet, sRet] = await Promise.all([
        fetchAll("customers", "*", { column: "name" }),
        fetchAll("products", "*", { column: "name" }),
        fetchAll("invoices", "*", { column: "date", ascending: false }),
        fetchAll("last_prices", "customer_id,product_id,price"),
        supabase.from("company_settings").select("*").eq("user_id", user.id).maybeSingle(),
        fetchAll("payments", "*", { column: "date", ascending: false }),
        fetchAll("suppliers", "*", { column: "name" }),
        fetchAll("purchases", "*", { column: "date", ascending: false }),
        fetchAll("supplier_payments", "*", { column: "date", ascending: false }),
        fetchAll("purchase_returns", "*", { column: "date", ascending: false }),
        fetchAll("sales_returns", "*", { column: "date", ascending: false }),
      ]);

      const lastPrices: Record<string, number> = {};
      ((lp.data ?? []) as LastPriceRow[]).forEach((r) => {
        lastPrices[`${r.customer_id}::${r.product_id}`] = Number(r.price);
      });
      const s = (st.data ?? null) as SettingsRow | null;

      const fresh: DBShape = {
        customers: ((c.data ?? []) as unknown as CustomerRow[]).map(mapCustomer),
        products: ((p.data ?? []) as unknown as ProductRow[]).map(mapProduct),
        invoices: ((i.data ?? []) as unknown as InvoiceRow[]).map(mapInvoice),
        payments: ((pay.data ?? []) as unknown as PaymentRow[]).map(mapPayment),
        suppliers: ((sup.data ?? []) as unknown as SupplierRow[]).map(mapSupplier),
        purchases: ((pur.data ?? []) as unknown as PurchaseRow[]).map(mapPurchase),
        supplierPayments: ((supPay.data ?? []) as unknown as SupplierPaymentRow[]).map(mapSupplierPayment),
        purchaseReturns: ((pRet.data ?? []) as unknown as PurchaseReturnRow[]).map(mapPurchaseReturn),
        salesReturns: ((sRet.data ?? []) as unknown as SalesReturnRow[]).map(mapSalesReturn),
        lastPrices,
        invoiceCounter: s?.invoice_counter ?? 1000,
        purchaseCounter: s?.purchase_counter ?? 1000,
        company: s
          ? {
              name: s.name,
              address: s.address,
              phone: s.phone,
              waInvoiceTemplate: (s as { wa_invoice_template?: string | null }).wa_invoice_template ?? undefined,
              waStatementTemplate: (s as { wa_statement_template?: string | null }).wa_statement_template ?? undefined,
              defaultCountryCode: (s as { default_country_code?: string | null }).default_country_code ?? undefined,
              smsEnabled: (s as { sms_enabled?: boolean | null }).sms_enabled ?? false,
              smsInvoiceEnabled: (s as { sms_invoice_enabled?: boolean | null }).sms_invoice_enabled ?? true,
              smsPaymentEnabled: (s as { sms_payment_enabled?: boolean | null }).sms_payment_enabled ?? true,
              smsInvoiceTemplate: (s as { sms_template_invoice?: string | null }).sms_template_invoice ?? undefined,
              smsPaymentTemplate: (s as { sms_template_payment?: string | null }).sms_template_payment ?? undefined,
            }
          : initial.company,
      };

      // Merge: keep any locally-queued invoices (not yet on server) at the top
      const queue = await loadQueue(user.id);
      const queuedInvoices = queue
        .filter((op) => op.kind === "invoice.create")
        .map((op) => (op.payload as { invoice: Invoice }).invoice);
      const serverIds = new Set(fresh.invoices.map((x) => x.id));
      const mergedInvoices = [
        ...queuedInvoices.filter((x) => !serverIds.has(x.id)),
        ...fresh.invoices,
      ];
      const merged: DBShape = { ...fresh, invoices: mergedInvoices };

      setDb(merged);
      await saveSnapshot(user.id, merged);
      setLastSyncAt(new Date().toISOString());
    } catch (err) {
      console.warn("[store] loadAll failed (likely offline)", err);
    } finally {
      setLoading(false);
    }
  }, [user, refreshPending]);

  const refreshData = useCallback(() => loadAll(true), [loadAll]);

  // Clearing the queue must also re-pull server data, otherwise the discarded
  // rows stay visible in the local copy and inflate balances/statements.
  const discardPending = useCallback(async () => {
    if (!user) return;
    await saveQueue(user.id, []);
    setPendingCount(0);
    setPendingError(null);
    await loadAll();
    toast.success("Pending changes discarded and data refreshed");
  }, [user, loadAll]);


  const syncNow = useCallback(async () => {
    if (!user || syncing) return;
    const q = await loadQueue(user.id);
    if (q.length === 0) return;
    setSyncing(true);
    try {
      const result = await processQueue(user.id);
      if (result.succeeded > 0) {
        toast.success(`${result.succeeded} change${result.succeeded > 1 ? "s" : ""} synced`);
      }
      if (result.failed.length > 0) {
        toast.error(`Sync stopped: ${result.failed[0].lastError ?? "unknown error"}`);
      }
      await refreshPending();
      await loadAll();
    } finally {
      setSyncing(false);
    }
  }, [user, syncing, refreshPending, loadAll]);

  useEffect(() => {
    if (user) {
      loadAll();
    } else {
      setDb(initial);
      setLoading(false);
    }
  }, [user, loadAll]);

  // Auto-sync when we come back online
  useEffect(() => {
    if (online && user && pendingCount > 0 && !syncing) {
      syncNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, user, pendingCount]);

  // Warn before unload if there are pending invoices
  useEffect(() => {
    if (pendingCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [pendingCount]);

  // Legacy — kept for a couple of remaining callers (resetAll/importAll).
  const reportError = (label: string, err: unknown) => {
    console.error(label, err);
    toast.error(`${label} failed — refreshing data`);
    loadAll();
  };

  // Enqueue an op and refresh the pending-count badge.
  const enqueue = useCallback(
    async (kind: QueuedOpKind, payload: Record<string, unknown>) => {
      if (!user) return;
      const q = await enqueueOp(user.id, kind, payload);
      setPendingCount(q.length);
      if (q.length === QUEUE_SOFT_LIMIT) {
        toast.warning(`${QUEUE_SOFT_LIMIT} actions waiting to sync. Please reconnect soon.`);
      }
    },
    [user],
  );

  /**
   * Offline-first mutation dispatcher.
   * - Offline: enqueue immediately, skip Supabase.
   * - Online: run Supabase; if it errors or throws, enqueue for retry.
   */
  const persist = useCallback(
    (
      kind: QueuedOpKind,
      payload: Record<string, unknown>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exec: () => PromiseLike<any> | any,
    ) => {
      if (!user) return;
      if (!online) {
        void enqueue(kind, payload);
        return;
      }
      Promise.resolve()
        .then(() => exec())
        .then((res: unknown) => {
          const err =
            res && typeof res === "object" && "error" in res
              ? (res as { error: unknown }).error
              : null;
          if (err) {
            console.warn(`[store] ${kind} failed, queueing`, err);
            void enqueue(kind, payload);
          }
        })
        .catch((err: unknown) => {
          console.warn(`[store] ${kind} threw, queueing`, err);
          void enqueue(kind, payload);
        });
    },
    [user, online, enqueue],
  );

  // Snapshot db to IndexedDB whenever it changes (debounced) so multi-day
  // offline sessions can reload the tab and see accurate lists/balances.
  useEffect(() => {
    if (!user || loading) return;
    const t = setTimeout(() => {
      void saveSnapshot(user.id, db);
    }, 400);
    return () => clearTimeout(t);
  }, [db, user, loading]);

  const logAudit = (
    action: "created" | "updated" | "deleted",
    entityType: "invoice" | "payment" | "purchase",
    entityId: string,
    entityLabel: string,
    details: Record<string, unknown> = {},
  ) => {
    if (!user) return;
    supabase
      .from("audit_logs")
      .insert({
        user_id: user.id,
        action,
        entity_type: entityType,
        entity_id: entityId,
        entity_label: entityLabel,
        details: details as never,
      })
      .then(({ error }) => error && console.warn("audit log:", error.message));
  };

  const value = useMemo<StoreCtx>(() => {
    return {
      db,
      loading,
      signOut,


      addCustomer: (c) => {
        const customer: Customer = {
          ...c,
          id: uid(),
          createdAt: new Date().toISOString(),
        };
        setDb((d) => ({ ...d, customers: [...d.customers, customer] }));
        persist("customer.create", { customer }, () =>
          supabase.from("customers").insert({
            id: customer.id,
            user_id: user!.id,
            name: customer.name,
            phone: customer.phone ?? null,
            address: customer.address ?? null,
            area: customer.area ?? null,
            company: customer.company ?? null,
            opening_balance: customer.openingBalance,
          }),
        );
        return customer;
      },

      updateCustomer: (cid, patch) => {
        setDb((d) => ({
          ...d,
          customers: d.customers.map((c) =>
            c.id === cid ? { ...c, ...patch } : c,
          ),
        }));
        const row: Record<string, unknown> = {};
        if ("name" in patch) row.name = patch.name;
        if ("phone" in patch) row.phone = patch.phone ?? null;
        if ("address" in patch) row.address = patch.address ?? null;
        if ("area" in patch) row.area = patch.area ?? null;
        if ("company" in patch) row.company = patch.company ?? null;
        if ("openingBalance" in patch) row.opening_balance = patch.openingBalance;
        persist("customer.update", { id: cid, row }, () =>
          supabase.from("customers").update(row as never).eq("id", cid),
        );
      },

      deleteCustomer: (cid) => {
        setDb((d) => ({
          ...d,
          customers: d.customers.filter((c) => c.id !== cid),
        }));
        persist("customer.delete", { id: cid }, () =>
          supabase.from("customers").delete().eq("id", cid),
        );
      },

      addProduct: (p) => {
        const product: Product = {
          ...p,
          id: uid(),
          createdAt: new Date().toISOString(),
        };
        setDb((d) => ({ ...d, products: [...d.products, product] }));
        persist("product.create", { product }, () =>
          supabase.from("products").insert({
            id: product.id,
            user_id: user!.id,
            name: product.name,
            company: product.company ?? null,
            pack: product.pack ?? null,
            unit: product.unit ?? null,
            stock: product.stock,
            purchase_price: product.purchasePrice,
            sale_price: product.salePrice,
            low_stock_threshold: product.lowStockThreshold,
          }),
        );
        return product;
      },

      updateProduct: (pid, patch) => {
        const oldProduct = db.products.find((p) => p.id === pid);
        const oldSale = oldProduct?.salePrice ?? 0;
        const newSale = patch.salePrice;
        const bumpedKeys: string[] =
          typeof newSale === "number" && newSale > oldSale
            ? Object.keys(db.lastPrices).filter(
                (k) =>
                  k.endsWith(`::${pid}`) && db.lastPrices[k] < newSale,
              )
            : [];
        setDb((d) => {
          const nextLastPrices = { ...d.lastPrices };
          if (bumpedKeys.length && typeof newSale === "number") {
            for (const k of bumpedKeys) nextLastPrices[k] = newSale;
          }
          return {
            ...d,
            products: d.products.map((p) =>
              p.id === pid ? { ...p, ...patch } : p,
            ),
            lastPrices: nextLastPrices,
          };
        });
        const row: Record<string, unknown> = {};
        if ("name" in patch) row.name = patch.name;
        if ("company" in patch) row.company = patch.company ?? null;
        if ("pack" in patch) row.pack = patch.pack ?? null;
        if ("unit" in patch) row.unit = patch.unit ?? null;
        if ("stock" in patch) row.stock = patch.stock;
        if ("purchasePrice" in patch) row.purchase_price = patch.purchasePrice;
        if ("salePrice" in patch) row.sale_price = patch.salePrice;
        if ("lowStockThreshold" in patch)
          row.low_stock_threshold = patch.lowStockThreshold;
        const bumpedLastPrices =
          bumpedKeys.length && typeof newSale === "number"
            ? bumpedKeys.map((k) => {
                const [customer_id] = k.split("::");
                return { customer_id, product_id: pid, price: newSale };
              })
            : undefined;
        persist("product.update", { id: pid, row, bumpedLastPrices }, async () => {
          const { error } = await supabase.from("products").update(row as never).eq("id", pid);
          if (error) return { error };
          if (bumpedLastPrices && user) {
            await supabase.from("last_prices").upsert(
              bumpedLastPrices.map((r) => ({ ...r, user_id: user.id })),
              { onConflict: "user_id,customer_id,product_id" },
            );
          }
          return { error: null };
        });
      },

      deleteProduct: (pid) => {
        setDb((d) => ({
          ...d,
          products: d.products.filter((p) => p.id !== pid),
        }));
        persist("product.delete", { id: pid }, () =>
          supabase.from("products").delete().eq("id", pid),
        );
      },

      createInvoice: ({ customerId, items, paid, notes, date }) => {
        const customer = db.customers.find((c) => c.id === customerId);
        const total = Math.round(items.reduce((s, it) => s + it.qty * it.price, 0));
        paid = Math.round(paid);
        const nextNumber =
          Math.max(
            db.invoiceCounter,
            ...db.invoices.map((i) => i.number),
            1000,
          ) + 1;
        const invoice: Invoice = {
          id: uid(),
          number: nextNumber,
          customerId,
          customerName: customer?.name ?? "Unknown",
          date: date ?? new Date().toISOString(),
          items,
          total,
          paid,
          notes,
        };

        // Hard cap when offline queue is full
        if (!online && pendingCount >= QUEUE_HARD_LIMIT) {
          toast.error(`Offline queue full (${QUEUE_HARD_LIMIT} actions). Reconnect to sync before creating more.`);
          throw new Error("Offline queue full");
        }

        // optimistic local update (both online and offline)
        setDb((d) => {
          const products = d.products.map((p) => {
            const it = items.find((i) => i.productId === p.id);
            return it ? { ...p, stock: p.stock - it.qty } : p;
          });
          const lastPrices = { ...d.lastPrices };
          for (const it of items) {
            lastPrices[`${customerId}::${it.productId}`] = it.price;
          }
          return {
            ...d,
            invoices: [invoice, ...d.invoices],
            invoiceCounter: invoice.number,
            products,
            lastPrices,
          };
        });

        if (!online) {
          toast.success(`INV-${invoice.number} saved offline · will sync when online`);
        }

        persist("invoice.create", { invoice }, async () => {
          const { error: invErr } = await supabase.from("invoices").insert({
            id: invoice.id,
            user_id: user!.id,
            number: invoice.number,
            customer_id: customerId,
            customer_name: invoice.customerName,
            date: invoice.date,
            items: items as never,
            total,
            paid,
            notes: notes ?? null,
          });
          if (invErr) return { error: invErr };
          await supabase
            .from("company_settings")
            .update({ invoice_counter: invoice.number })
            .eq("user_id", user!.id);
          await Promise.all(
            items.map((it) => {
              const p = db.products.find((x) => x.id === it.productId);
              if (!p) return Promise.resolve();
              return supabase
                .from("products")
                .update({ stock: p.stock - it.qty })
                .eq("id", it.productId);
            }),
          );
          await supabase.from("last_prices").upsert(
            items.map((it) => ({
              user_id: user!.id,
              customer_id: customerId,
              product_id: it.productId,
              price: it.price,
            })),
            { onConflict: "user_id,customer_id,product_id" },
          );
          return { error: null };
        });

        logAudit("created", "invoice", invoice.id, `INV-${invoice.number}`, {
          customer: invoice.customerName,
          total,
          paid,
          items: items.length,
        });
        return invoice;
      },

      deleteInvoice: (iid) => {
        const inv = db.invoices.find((i) => i.id === iid);
        if (!inv) return;
        setDb((d) => {
          const products = d.products.map((p) => {
            const it = inv.items.find((i) => i.productId === p.id);
            return it ? { ...p, stock: p.stock + it.qty } : p;
          });
          return {
            ...d,
            invoices: d.invoices.filter((i) => i.id !== iid),
            products,
          };
        });
        persist("invoice.delete", { invoice: inv }, async () => {
          const { error } = await supabase.from("invoices").delete().eq("id", iid);
          if (error) return { error };
          await Promise.all(
            inv.items.map((it) => {
              const p = db.products.find((x) => x.id === it.productId);
              if (!p) return Promise.resolve();
              return supabase
                .from("products")
                .update({ stock: p.stock + it.qty })
                .eq("id", it.productId);
            }),
          );
          return { error: null };
        });
        logAudit("deleted", "invoice", inv.id, `INV-${inv.number}`, {
          customer: inv.customerName,
          total: inv.total,
        });
      },

      updateInvoice: (iid, { customerId, items, paid, notes, date }) => {
        const old = db.invoices.find((i) => i.id === iid);
        if (!old) return;
        const customer = db.customers.find((c) => c.id === customerId);
        const total = Math.round(items.reduce((s, it) => s + it.qty * it.price, 0));
        paid = Math.round(paid);
        const updated: Invoice = {
          ...old,
          customerId,
          customerName: customer?.name ?? old.customerName,
          date: date ?? old.date,
          items,
          total,
          paid,
          notes,
        };
        const deltaByProduct = new Map<string, number>();
        for (const it of old.items) {
          deltaByProduct.set(it.productId, (deltaByProduct.get(it.productId) ?? 0) - it.qty);
        }
        for (const it of items) {
          deltaByProduct.set(it.productId, (deltaByProduct.get(it.productId) ?? 0) + it.qty);
        }
        setDb((d) => {
          const products = d.products.map((p) => {
            const delta = deltaByProduct.get(p.id);
            return delta ? { ...p, stock: p.stock - delta } : p;
          });
          const lastPrices = { ...d.lastPrices };
          for (const it of items) {
            lastPrices[`${customerId}::${it.productId}`] = it.price;
          }
          return {
            ...d,
            invoices: d.invoices.map((i) => (i.id === iid ? updated : i)),
            products,
            lastPrices,
          };
        });
        persist("invoice.update", { invoice: updated, oldItems: old.items }, async () => {
          const { error } = await supabase
            .from("invoices")
            .update({
              customer_id: customerId,
              customer_name: updated.customerName,
              date: updated.date,
              items: items as never,
              total,
              paid,
              notes: notes ?? null,
            })
            .eq("id", iid);
          if (error) return { error };
          await Promise.all(
            Array.from(deltaByProduct.entries()).map(([pid, delta]) => {
              if (!delta) return Promise.resolve();
              const p = db.products.find((x) => x.id === pid);
              if (!p) return Promise.resolve();
              return supabase
                .from("products")
                .update({ stock: p.stock - delta })
                .eq("id", pid);
            }),
          );
          await supabase.from("last_prices").upsert(
            items.map((it) => ({
              user_id: user!.id,
              customer_id: customerId,
              product_id: it.productId,
              price: it.price,
            })),
            { onConflict: "user_id,customer_id,product_id" },
          );
          return { error: null };
        });
        logAudit("updated", "invoice", iid, `INV-${old.number}`, {
          customer: updated.customerName,
          total,
          paid,
          oldTotal: old.total,
          oldPaid: old.paid,
        });
      },

      addPayment: (p) => {
        const customer = db.customers.find((c) => c.id === p.customerId);
        const payment: Payment = {
          ...p,
          amount: Math.sign(p.amount) * Math.round(Math.abs(p.amount)),
          id: uid(),
          customerName: customer?.name ?? "Unknown",
        };

        setDb((d) => ({ ...d, payments: [payment, ...d.payments] }));
        persist("payment.create", { payment }, () =>
          supabase.from("payments").insert({
            id: payment.id,
            user_id: user!.id,
            customer_id: payment.customerId,
            customer_name: payment.customerName,
            date: payment.date,
            amount: payment.amount,
            method: payment.method ?? null,
            notes: payment.notes ?? null,
          }),
        );
        logAudit("created", "payment", payment.id, payment.customerName, {
          amount: payment.amount,
          method: payment.method,
        });
        return payment;
      },

      deletePayment: (pid) => {
        const old = db.payments.find((x) => x.id === pid);
        setDb((d) => ({
          ...d,
          payments: d.payments.filter((x) => x.id !== pid),
        }));
        persist("payment.delete", { id: pid }, () =>
          supabase.from("payments").delete().eq("id", pid),
        );
        if (old) {
          logAudit("deleted", "payment", old.id, old.customerName, {
            amount: old.amount,
            method: old.method,
          });
        }
      },

      getLastPrice: (cid, pid) => {
        const v = db.lastPrices[`${cid}::${pid}`];
        return typeof v === "number" ? v : null;
      },

      updateCompany: (patch) => {
        setDb((d) => ({ ...d, company: { ...d.company, ...patch } }));
        const row: Record<string, unknown> = {};
        if (patch.name !== undefined) row.name = patch.name;
        if (patch.address !== undefined) row.address = patch.address;
        if (patch.phone !== undefined) row.phone = patch.phone;
        if (patch.waInvoiceTemplate !== undefined) row.wa_invoice_template = patch.waInvoiceTemplate || null;
        if (patch.waStatementTemplate !== undefined) row.wa_statement_template = patch.waStatementTemplate || null;
        if (patch.defaultCountryCode !== undefined) row.default_country_code = patch.defaultCountryCode || "+92";
        if (patch.smsEnabled !== undefined) row.sms_enabled = patch.smsEnabled;
        if (patch.smsInvoiceEnabled !== undefined) row.sms_invoice_enabled = patch.smsInvoiceEnabled;
        if (patch.smsPaymentEnabled !== undefined) row.sms_payment_enabled = patch.smsPaymentEnabled;
        if (patch.smsInvoiceTemplate !== undefined) row.sms_template_invoice = patch.smsInvoiceTemplate || null;
        if (patch.smsPaymentTemplate !== undefined) row.sms_template_payment = patch.smsPaymentTemplate || null;
        persist("company.update", { row }, () =>
          supabase.from("company_settings").upsert({ user_id: user!.id, ...row }),
        );
      },

      customerBalance: (cid) => {
        const c = db.customers.find((x) => x.id === cid);
        if (!c) return 0;
        const invs = db.invoices.filter((i) => i.customerId === cid);
        const owed = invs.reduce((s, i) => s + (i.total - i.paid), 0);
        const received = db.payments
          .filter((p) => p.customerId === cid)
          .reduce((s, p) => s + p.amount, 0);
        const returns = db.salesReturns
          .filter((r) => r.customerId === cid)
          .reduce((s, r) => s + r.total, 0);
        return c.openingBalance + owed - received - returns;
      },

      // ---------- Suppliers ----------
      addSupplier: (s) => {
        const sup: Supplier = { ...s, id: uid(), createdAt: new Date().toISOString() };
        setDb((d) => ({ ...d, suppliers: [...d.suppliers, sup] }));
        persist("supplier.create", { supplier: sup }, () =>
          supabase.from("suppliers").insert({
            id: sup.id, user_id: user!.id, name: sup.name,
            phone: sup.phone ?? null, address: sup.address ?? null,
            area: sup.area ?? null, company: sup.company ?? null,
            opening_balance: sup.openingBalance,
          }),
        );
        return sup;
      },
      updateSupplier: (sid, patch) => {
        setDb((d) => ({
          ...d, suppliers: d.suppliers.map((x) => x.id === sid ? { ...x, ...patch } : x),
        }));
        const row: Record<string, unknown> = {};
        if ("name" in patch) row.name = patch.name;
        if ("phone" in patch) row.phone = patch.phone ?? null;
        if ("address" in patch) row.address = patch.address ?? null;
        if ("area" in patch) row.area = patch.area ?? null;
        if ("company" in patch) row.company = patch.company ?? null;
        if ("openingBalance" in patch) row.opening_balance = patch.openingBalance;
        persist("supplier.update", { id: sid, row }, () =>
          supabase.from("suppliers").update(row as never).eq("id", sid),
        );
      },
      deleteSupplier: (sid) => {
        setDb((d) => ({ ...d, suppliers: d.suppliers.filter((x) => x.id !== sid) }));
        persist("supplier.delete", { id: sid }, () =>
          supabase.from("suppliers").delete().eq("id", sid),
        );
      },
      supplierBalance: (sid) => {
        const s = db.suppliers.find((x) => x.id === sid);
        if (!s) return 0;
        const purs = db.purchases.filter((p) => p.supplierId === sid);
        const owed = purs.reduce((sum, p) => sum + (p.total - p.paid), 0);
        const paid = db.supplierPayments
          .filter((p) => p.supplierId === sid)
          .reduce((sum, p) => sum + p.amount, 0);
        const returns = db.purchaseReturns
          .filter((r) => r.supplierId === sid)
          .reduce((sum, r) => sum + r.total, 0);
        return s.openingBalance + owed - paid - returns;
      },

      // ---------- Purchases ----------
      createPurchase: ({ supplierId, items, paid, notes, date }) => {
        const supplier = db.suppliers.find((s) => s.id === supplierId);
        const total = Math.round(items.reduce((s, it) => s + it.qty * it.price, 0));
        paid = Math.round(paid);
        const nextNumber =
          Math.max(
            db.purchaseCounter,
            ...db.purchases.map((p) => p.number),
            1000,
          ) + 1;
        const purchase: Purchase = {
          id: uid(),
          number: nextNumber,
          supplierId,
          supplierName: supplier?.name ?? "Unknown",
          date: date ?? new Date().toISOString(),
          items, total, paid, notes,
        };
        setDb((d) => {
          const products = d.products.map((p) => {
            const it = items.find((i) => i.productId === p.id);
            return it ? { ...p, stock: p.stock + it.qty } : p;
          });
          return {
            ...d,
            purchases: [purchase, ...d.purchases],
            purchaseCounter: purchase.number,
            products,
          };
        });
        persist("purchase.create", { purchase }, async () => {
          const { error } = await supabase.from("purchases").insert({
            id: purchase.id, user_id: user!.id, number: purchase.number,
            supplier_id: supplierId, supplier_name: purchase.supplierName,
            date: purchase.date, items: items as never, total, paid,
            notes: notes ?? null,
          });
          if (error) return { error };
          await supabase.from("company_settings")
            .update({ purchase_counter: purchase.number }).eq("user_id", user!.id);
          await Promise.all(items.map((it) => {
            const p = db.products.find((x) => x.id === it.productId);
            if (!p) return Promise.resolve();
            return supabase.from("products")
              .update({ stock: p.stock + it.qty }).eq("id", it.productId);
          }));
          return { error: null };
        });
        logAudit("created", "purchase", purchase.id, `PUR-${purchase.number}`, {
          supplier: purchase.supplierName,
          total,
          paid,
          items: items.length,
        });
        return purchase;
      },
      deletePurchase: (pid) => {
        const pur = db.purchases.find((p) => p.id === pid);
        if (!pur) return;
        setDb((d) => {
          const products = d.products.map((p) => {
            const it = pur.items.find((i) => i.productId === p.id);
            return it ? { ...p, stock: p.stock - it.qty } : p;
          });
          return {
            ...d,
            purchases: d.purchases.filter((p) => p.id !== pid),
            products,
          };
        });
        persist("purchase.delete", { purchase: pur }, async () => {
          const { error } = await supabase.from("purchases").delete().eq("id", pid);
          if (error) return { error };
          await Promise.all(pur.items.map((it) => {
            const p = db.products.find((x) => x.id === it.productId);
            if (!p) return Promise.resolve();
            return supabase.from("products")
              .update({ stock: p.stock - it.qty }).eq("id", it.productId);
          }));
          return { error: null };
        });
        logAudit("deleted", "purchase", pur.id, `PUR-${pur.number}`, {
          supplier: pur.supplierName,
          total: pur.total,
        });
      },
      updatePurchase: (pid, { supplierId, items, paid, notes, date }) => {
        const old = db.purchases.find((p) => p.id === pid);
        if (!old) return;
        const supplier = db.suppliers.find((s) => s.id === supplierId);
        const total = Math.round(items.reduce((s, it) => s + it.qty * it.price, 0));
        paid = Math.round(paid);
        const updated: Purchase = {
          ...old,
          supplierId,
          supplierName: supplier?.name ?? old.supplierName,
          date: date ?? old.date,
          items,
          total,
          paid,
          notes,
        };
        // Purchases ADD to stock; net delta = new - old (apply as stock + delta).
        const deltaByProduct = new Map<string, number>();
        for (const it of old.items) {
          deltaByProduct.set(it.productId, (deltaByProduct.get(it.productId) ?? 0) - it.qty);
        }
        for (const it of items) {
          deltaByProduct.set(it.productId, (deltaByProduct.get(it.productId) ?? 0) + it.qty);
        }
        setDb((d) => {
          const products = d.products.map((p) => {
            const delta = deltaByProduct.get(p.id);
            return delta ? { ...p, stock: p.stock + delta } : p;
          });
          return {
            ...d,
            purchases: d.purchases.map((p) => (p.id === pid ? updated : p)),
            products,
          };
        });
        persist("purchase.update", { purchase: updated, oldItems: old.items }, async () => {
          const { error } = await supabase
            .from("purchases")
            .update({
              supplier_id: supplierId,
              supplier_name: updated.supplierName,
              date: updated.date,
              items: items as never,
              total,
              paid,
              notes: notes ?? null,
            })
            .eq("id", pid);
          if (error) return { error };
          await Promise.all(
            Array.from(deltaByProduct.entries()).map(([prodId, delta]) => {
              if (!delta) return Promise.resolve();
              const p = db.products.find((x) => x.id === prodId);
              if (!p) return Promise.resolve();
              return supabase
                .from("products")
                .update({ stock: p.stock + delta })
                .eq("id", prodId);
            }),
          );
          return { error: null };
        });
        logAudit("updated", "purchase", pid, `PUR-${old.number}`, {
          supplier: updated.supplierName,
          total,
          paid,
          oldTotal: old.total,
          oldPaid: old.paid,
        });
      },



      // ---------- Supplier payments ----------
      addSupplierPayment: (p) => {
        const supplier = db.suppliers.find((s) => s.id === p.supplierId);
        const payment: SupplierPayment = {
          ...p,
          amount: Math.sign(p.amount) * Math.round(Math.abs(p.amount)),
          id: uid(),
          supplierName: supplier?.name ?? "Unknown",
        };

        setDb((d) => ({ ...d, supplierPayments: [payment, ...d.supplierPayments] }));
        persist("supplierPayment.create", { payment }, () =>
          supabase.from("supplier_payments").insert({
            id: payment.id, user_id: user!.id,
            supplier_id: payment.supplierId, supplier_name: payment.supplierName,
            date: payment.date, amount: payment.amount,
            method: payment.method ?? null, notes: payment.notes ?? null,
          }),
        );
        return payment;
      },
      deleteSupplierPayment: (pid) => {
        setDb((d) => ({
          ...d, supplierPayments: d.supplierPayments.filter((x) => x.id !== pid),
        }));
        persist("supplierPayment.delete", { id: pid }, () =>
          supabase.from("supplier_payments").delete().eq("id", pid),
        );
      },

      // ---------- Purchase returns ----------
      createPurchaseReturn: ({ supplierId, items, notes, date }) => {
        const supplier = db.suppliers.find((s) => s.id === supplierId);
        const total = Math.round(items.reduce((s, it) => s + it.qty * it.price, 0));
        const ret: PurchaseReturn = {
          id: uid(), supplierId,
          supplierName: supplier?.name ?? "Unknown",
          date: date ?? new Date().toISOString(),
          items, total, notes,
        };
        setDb((d) => {
          const products = d.products.map((p) => {
            const it = items.find((i) => i.productId === p.id);
            return it ? { ...p, stock: p.stock - it.qty } : p;
          });
          return { ...d, purchaseReturns: [ret, ...d.purchaseReturns], products };
        });
        persist("purchaseReturn.create", { ret }, async () => {
          const { error } = await supabase.from("purchase_returns").insert({
            id: ret.id, user_id: user!.id,
            supplier_id: supplierId, supplier_name: ret.supplierName,
            date: ret.date, items: items as never, total, notes: notes ?? null,
          });
          if (error) return { error };
          await Promise.all(items.map((it) => {
            const p = db.products.find((x) => x.id === it.productId);
            if (!p) return Promise.resolve();
            return supabase.from("products")
              .update({ stock: p.stock - it.qty }).eq("id", it.productId);
          }));
          return { error: null };
        });
        return ret;
      },
      deletePurchaseReturn: (rid) => {
        const ret = db.purchaseReturns.find((r) => r.id === rid);
        if (!ret) return;
        setDb((d) => {
          const products = d.products.map((p) => {
            const it = ret.items.find((i) => i.productId === p.id);
            return it ? { ...p, stock: p.stock + it.qty } : p;
          });
          return {
            ...d,
            purchaseReturns: d.purchaseReturns.filter((r) => r.id !== rid),
            products,
          };
        });
        persist("purchaseReturn.delete", { ret }, async () => {
          const { error } = await supabase.from("purchase_returns").delete().eq("id", rid);
          if (error) return { error };
          await Promise.all(ret.items.map((it) => {
            const p = db.products.find((x) => x.id === it.productId);
            if (!p) return Promise.resolve();
            return supabase.from("products")
              .update({ stock: p.stock + it.qty }).eq("id", it.productId);
          }));
          return { error: null };
        });
      },
      updatePurchaseReturn: (rid, { supplierId, items, notes, date }) => {
        const prev = db.purchaseReturns.find((r) => r.id === rid);
        if (!prev) return;
        const supplier = db.suppliers.find((s) => s.id === supplierId);
        const total = Math.round(items.reduce((s, it) => s + it.qty * it.price, 0));
        const next: PurchaseReturn = {
          id: rid,
          supplierId,
          supplierName: supplier?.name ?? prev.supplierName,
          date: date ?? prev.date,
          items,
          total,
          notes,
        };
        const delta = new Map<string, number>();
        for (const it of prev.items) delta.set(it.productId, (delta.get(it.productId) ?? 0) + it.qty);
        for (const it of items) delta.set(it.productId, (delta.get(it.productId) ?? 0) - it.qty);
        setDb((d) => {
          const products = d.products.map((p) => {
            const dq = delta.get(p.id);
            return dq ? { ...p, stock: p.stock + dq } : p;
          });
          return {
            ...d,
            purchaseReturns: d.purchaseReturns.map((r) => (r.id === rid ? next : r)),
            products,
          };
        });
        persist("purchaseReturn.update", { ret: next, oldItems: prev.items }, async () => {
          const { error } = await supabase.from("purchase_returns").update({
            supplier_id: supplierId, supplier_name: next.supplierName,
            date: next.date, items: items as never, total, notes: notes ?? null,
          }).eq("id", rid);
          if (error) return { error };
          await Promise.all(Array.from(delta.entries()).map(([pid, dq]) => {
            if (!dq) return Promise.resolve();
            const p = db.products.find((x) => x.id === pid);
            if (!p) return Promise.resolve();
            return supabase.from("products").update({ stock: p.stock + dq }).eq("id", pid);
          }));
          return { error: null };
        });
      },

      // ---------- Sales returns ----------
      createSalesReturn: ({ customerId, items, notes, date }) => {
        const customer = db.customers.find((c) => c.id === customerId);
        const total = Math.round(items.reduce((s, it) => s + it.qty * it.price, 0));
        const ret: SalesReturn = {
          id: uid(), customerId,
          customerName: customer?.name ?? "Unknown",
          date: date ?? new Date().toISOString(),
          items, total, notes,
        };
        setDb((d) => {
          const products = d.products.map((p) => {
            const it = items.find((i) => i.productId === p.id);
            return it ? { ...p, stock: p.stock + it.qty } : p;
          });
          return { ...d, salesReturns: [ret, ...d.salesReturns], products };
        });
        persist("salesReturn.create", { ret }, async () => {
          const { error } = await supabase.from("sales_returns").insert({
            id: ret.id, user_id: user!.id,
            customer_id: customerId, customer_name: ret.customerName,
            date: ret.date, items: items as never, total, notes: notes ?? null,
          });
          if (error) return { error };
          await Promise.all(items.map((it) => {
            const p = db.products.find((x) => x.id === it.productId);
            if (!p) return Promise.resolve();
            return supabase.from("products")
              .update({ stock: p.stock + it.qty }).eq("id", it.productId);
          }));
          return { error: null };
        });
        return ret;
      },
      deleteSalesReturn: (rid) => {
        const ret = db.salesReturns.find((r) => r.id === rid);
        if (!ret) return;
        setDb((d) => {
          const products = d.products.map((p) => {
            const it = ret.items.find((i) => i.productId === p.id);
            return it ? { ...p, stock: p.stock - it.qty } : p;
          });
          return {
            ...d,
            salesReturns: d.salesReturns.filter((r) => r.id !== rid),
            products,
          };
        });
        persist("salesReturn.delete", { ret }, async () => {
          const { error } = await supabase.from("sales_returns").delete().eq("id", rid);
          if (error) return { error };
          await Promise.all(ret.items.map((it) => {
            const p = db.products.find((x) => x.id === it.productId);
            if (!p) return Promise.resolve();
            return supabase.from("products")
              .update({ stock: p.stock - it.qty }).eq("id", it.productId);
          }));
          return { error: null };
        });
      },
      updateSalesReturn: (rid, { customerId, items, notes, date }) => {
        const prev = db.salesReturns.find((r) => r.id === rid);
        if (!prev) return;
        const customer = db.customers.find((c) => c.id === customerId);
        const total = Math.round(items.reduce((s, it) => s + it.qty * it.price, 0));
        const next: SalesReturn = {
          id: rid,
          customerId,
          customerName: customer?.name ?? prev.customerName,
          date: date ?? prev.date,
          items,
          total,
          notes,
        };
        const delta = new Map<string, number>();
        for (const it of prev.items) delta.set(it.productId, (delta.get(it.productId) ?? 0) - it.qty);
        for (const it of items) delta.set(it.productId, (delta.get(it.productId) ?? 0) + it.qty);
        setDb((d) => {
          const products = d.products.map((p) => {
            const dq = delta.get(p.id);
            return dq ? { ...p, stock: p.stock + dq } : p;
          });
          return {
            ...d,
            salesReturns: d.salesReturns.map((r) => (r.id === rid ? next : r)),
            products,
          };
        });
        persist("salesReturn.update", { ret: next, oldItems: prev.items }, async () => {
          const { error } = await supabase.from("sales_returns").update({
            customer_id: customerId, customer_name: next.customerName,
            date: next.date, items: items as never, total, notes: notes ?? null,
          }).eq("id", rid);
          if (error) return { error };
          await Promise.all(Array.from(delta.entries()).map(([pid, dq]) => {
            if (!dq) return Promise.resolve();
            const p = db.products.find((x) => x.id === pid);
            if (!p) return Promise.resolve();
            return supabase.from("products").update({ stock: p.stock + dq }).eq("id", pid);
          }));
          return { error: null };
        });
      },

      resetAll: async () => {
        const uId = user!.id;
        await Promise.all([
          supabase.from("invoices").delete().eq("user_id", uId),
          supabase.from("payments").delete().eq("user_id", uId),
          supabase.from("last_prices").delete().eq("user_id", uId),
          supabase.from("customers").delete().eq("user_id", uId),
          supabase.from("products").delete().eq("user_id", uId),
        ]);
        await supabase
          .from("company_settings")
          .update({
            name: initial.company.name,
            address: initial.company.address,
            phone: initial.company.phone,
            invoice_counter: 1000,
          })
          .eq("user_id", uId);
        await loadAll();
      },

      importAll: async (data) => {
        const uId = user!.id;
        // wipe
        await Promise.all([
          supabase.from("invoices").delete().eq("user_id", uId),
          supabase.from("payments").delete().eq("user_id", uId),
          supabase.from("last_prices").delete().eq("user_id", uId),
          supabase.from("customers").delete().eq("user_id", uId),
          supabase.from("products").delete().eq("user_id", uId),
        ]);

        if (data.customers?.length) {
          await supabase.from("customers").insert(
            data.customers.map((c) => ({
              id: c.id,
              user_id: uId,
              name: c.name,
              phone: c.phone ?? null,
              address: c.address ?? null,
              area: c.area ?? null,
              company: c.company ?? null,
              opening_balance: c.openingBalance ?? 0,
              created_at: c.createdAt,
            })),
          );
        }
        if (data.products?.length) {
          await supabase.from("products").insert(
            data.products.map((p) => ({
              id: p.id,
              user_id: uId,
              name: p.name,
              company: p.company ?? null,
              pack: p.pack ?? null,
              unit: p.unit ?? null,
              stock: p.stock ?? 0,
              purchase_price: p.purchasePrice ?? 0,
              sale_price: p.salePrice ?? 0,
              low_stock_threshold: p.lowStockThreshold ?? 0,
              created_at: p.createdAt,
            })),
          );
        }
        if (data.invoices?.length) {
          await supabase.from("invoices").insert(
            data.invoices.map((i) => ({
              id: i.id,
              user_id: uId,
              number: i.number,
              customer_id: i.customerId,
              customer_name: i.customerName,
              date: i.date,
              items: i.items as never,
              total: i.total,
              paid: i.paid,
              notes: i.notes ?? null,
            })),
          );
        }
        if (data.payments?.length) {
          await supabase.from("payments").insert(
            data.payments.map((p) => ({
              id: p.id,
              user_id: uId,
              customer_id: p.customerId,
              customer_name: p.customerName,
              date: p.date,
              amount: p.amount,
              method: p.method ?? null,
              notes: p.notes ?? null,
            })),
          );
        }
        const lpRows = Object.entries(data.lastPrices ?? {}).map(([k, price]) => {
          const [customer_id, product_id] = k.split("::");
          return { user_id: uId, customer_id, product_id, price };
        });
        if (lpRows.length) {
          await supabase
            .from("last_prices")
            .upsert(lpRows, { onConflict: "user_id,customer_id,product_id" });
        }
        await supabase
          .from("company_settings")
          .update({
            name: data.company?.name ?? initial.company.name,
            address: data.company?.address ?? initial.company.address,
            phone: data.company?.phone ?? initial.company.phone,
            invoice_counter: data.invoiceCounter ?? 1000,
          })
          .eq("user_id", uId);

        await loadAll();
      },
      online,
      pendingCount,
      syncing,
      lastSyncAt,
      syncNow,
      pendingError,
      discardPending,
      refreshData,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, loading, user, online, pendingCount, syncing, lastSyncAt, syncNow, pendingError, discardPending, loadAll, refreshData]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ---------- outer wrapper: auth gate ----------
function StoreGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!user) return <LoginPage />;
  return <InnerStoreProvider>{children}</InnerStoreProvider>;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <StoreGate>{children}</StoreGate>
    </AuthProvider>
  );
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

/** Currency-prefixed. Shows up to 2 decimals; trims trailing zeros (12 → "Rs 12", 12.5 → "Rs 12.50"). */
export function fmt(n: number) {
  const v = Number(n) || 0;
  const rounded = Math.round(v * 100) / 100;
  const hasDecimals = rounded !== Math.round(rounded);
  return (
    "Rs " +
    rounded.toLocaleString(undefined, {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}

/** Rounded to nearest whole rupee (no decimals). */
export function fmtRound(n: number) {
  const v = Math.round(Number(n) || 0);
  return "Rs " + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** No currency prefix; hides .00 for whole numbers, keeps decimals when present. */
export function fmtClean(n: number) {
  const v = Number(n) || 0;
  const rounded = Math.round(v * 100) / 100;
  const hasDecimals = rounded !== Math.round(rounded);
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/** Format date as DD-MM-YYYY. Accepts Date or ISO string. */
export function fmtDate(d: Date | string | number) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Format datetime as DD-MM-YYYY HH:MM. */
export function fmtDateTime(d: Date | string | number) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  const hh = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  return `${fmtDate(dt)} ${hh}:${mi}`;
}

