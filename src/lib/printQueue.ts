import { supabase } from "@/integrations/supabase/client";

export type PrintJobKind = "invoice" | "invoice_list" | "test";
export type PrintJobStatus =
  | "pending"
  | "printing"
  | "printed"
  | "failed"
  | "cancelled";

export interface PrintJobRow {
  id: string;
  user_id: string;
  kind: PrintJobKind;
  payload: Record<string, unknown>;
  status: PrintJobStatus;
  requested_by: string | null;
  requested_by_name: string | null;
  error: string | null;
  printed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceListPrintPayload {
  invoiceIds: string[];
  filterLabel: string;
  customerLabel?: string;
  search?: string;
  totals: { total: number; paid: number; balance: number };
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

async function currentUserName(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return (
    (data.user?.user_metadata?.display_name as string | undefined) ||
    data.user?.email ||
    null
  );
}

export async function enqueueInvoicePrint(invoiceId: string) {
  const user_id = await currentUserId();
  const name = await currentUserName();
  const { data, error } = await supabase
    .from("print_jobs")
    .insert({
      user_id,
      kind: "invoice",
      payload: { invoiceId },
      requested_by: user_id,
      requested_by_name: name,
    })
    .select()
    .single();
  if (error) throw error;
  return data as PrintJobRow;
}

export async function enqueueInvoiceListPrint(payload: InvoiceListPrintPayload) {
  const user_id = await currentUserId();
  const name = await currentUserName();
  const { data, error } = await supabase
    .from("print_jobs")
    .insert({
      user_id,
      kind: "invoice_list",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: payload as any,
      requested_by: user_id,
      requested_by_name: name,
    })
    .select()
    .single();
  if (error) throw error;
  return data as PrintJobRow;
}

export async function enqueueTestPrint() {
  const user_id = await currentUserId();
  const name = await currentUserName();
  const { data, error } = await supabase
    .from("print_jobs")
    .insert({
      user_id,
      kind: "test",
      payload: {},
      requested_by: user_id,
      requested_by_name: name,
    })
    .select()
    .single();
  if (error) throw error;
  return data as PrintJobRow;
}

/** Atomically claim a pending job. Returns the row if we won the race, else null. */
export async function claimJob(jobId: string): Promise<PrintJobRow | null> {
  const { data, error } = await supabase
    .from("print_jobs")
    .update({ status: "printing" })
    .eq("id", jobId)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (error) throw error;
  return (data as PrintJobRow | null) ?? null;
}

export async function markPrinted(jobId: string) {
  await supabase
    .from("print_jobs")
    .update({ status: "printed", printed_at: new Date().toISOString() })
    .eq("id", jobId);
}

export async function markFailed(jobId: string, err: string) {
  await supabase
    .from("print_jobs")
    .update({ status: "failed", error: err })
    .eq("id", jobId);
}

export async function cancelJob(jobId: string) {
  await supabase
    .from("print_jobs")
    .update({ status: "cancelled" })
    .eq("id", jobId);
}

export async function listRecentJobs(limit = 20): Promise<PrintJobRow[]> {
  const { data, error } = await supabase
    .from("print_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PrintJobRow[];
}

export async function listPendingJobs(): Promise<PrintJobRow[]> {
  const { data, error } = await supabase
    .from("print_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PrintJobRow[];
}

export function subscribePrintJobs(
  onInsert: (row: PrintJobRow) => void,
  onUpdate?: (row: PrintJobRow) => void,
) {
  const channel = supabase
    .channel("print_jobs_feed")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "print_jobs" },
      (payload) => onInsert(payload.new as PrintJobRow),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "print_jobs" },
      (payload) => onUpdate?.(payload.new as PrintJobRow),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
