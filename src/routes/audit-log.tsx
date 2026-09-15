import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useRole } from "@/lib/roles";
import { fmt, fmtDateTime } from "@/lib/store";

export const Route = createFileRoute("/audit-log")({
  component: AuditLogPage,
});

type AuditRow = {
  id: string;
  user_id: string;
  action: "created" | "updated" | "deleted";
  entity_type: "invoice" | "payment" | "purchase";
  entity_id: string | null;
  entity_label: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

function AuditLogPage() {
  const { isAdmin, loading: roleLoading } = useRole();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = usePersistedState<string>("audit:entity", "all");
  const [actionFilter, setActionFilter] = usePersistedState<string>("audit:action", "all");
  const [userFilter, setUserFilter] = usePersistedState<string>("audit:user", "all");
  const [search, setSearch] = usePersistedState("audit:search", "");

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      const [{ data, error }, { data: profiles }] = await Promise.all([
        supabase
          .from("audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("user_profiles").select("user_id, display_name"),
      ]);
      if (cancelled) return;
      if (!error && data) setRows(data as unknown as AuditRow[]);
      const map: Record<string, string> = {};
      (profiles ?? []).forEach((p) => {
        if (p.display_name) map[p.user_id] = p.display_name;
      });
      setNames(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const userOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.user_id));
    return Array.from(set).map((uid) => ({
      uid,
      label: names[uid] || `${uid.slice(0, 8)}…`,
    })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, names]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (entityFilter !== "all" && r.entity_type !== entityFilter) return false;
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (userFilter !== "all" && r.user_id !== userFilter) return false;
      if (q) {
        const label = (r.entity_label || "").toLowerCase();
        const user = (names[r.user_id] || "").toLowerCase();
        if (!label.includes(q) && !user.includes(q)) return false;
      }
      return true;
    });
  }, [rows, entityFilter, actionFilter, userFilter, search, names]);

  if (roleLoading) return null;
  if (!isAdmin) return <Navigate to="/invoices" />;

  return (
    <>
      <PageHeader title="Audit Log" subtitle="Recent invoice, payment & purchase activity" />
      <div className="p-4 sm:p-8 space-y-4">
        <Card className="p-4 flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Search label (INV-1023, customer name...)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              <SelectItem value="invoice">Invoices</SelectItem>
              <SelectItem value="payment">Payments</SelectItem>
              <SelectItem value="purchase">Purchases</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="created">Created</SelectItem>
              <SelectItem value="updated">Updated</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
            </SelectContent>
          </Select>
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {userOptions.map((u) => (
                <SelectItem key={u.uid} value={u.uid}>{u.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>

        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left p-3">When</th>
                <th className="text-left p-3">User</th>
                <th className="text-left p-3">Action</th>
                <th className="text-left p-3">Entity</th>
                <th className="text-left p-3">Label</th>
                <th className="text-left p-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No activity yet.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                  <td className="p-3 whitespace-nowrap">
                    {names[r.user_id] || (
                      <span className="font-mono text-xs text-muted-foreground">{r.user_id.slice(0, 8)}…</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge variant={r.action === "deleted" ? "destructive" : r.action === "updated" ? "secondary" : "default"}>
                      {r.action}
                    </Badge>
                  </td>
                  <td className="p-3 capitalize">{r.entity_type}</td>
                  <td className="p-3 font-medium">{r.entity_label}</td>
                  <td className="p-3 text-xs text-muted-foreground">{describe(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

function describe(r: AuditRow): string {
  const d = r.details || {};
  const parts: string[] = [];
  if (typeof d.customer === "string") parts.push(d.customer);
  if (typeof d.supplier === "string") parts.push(d.supplier);
  if (typeof d.total === "number") parts.push(`Total ${fmt(d.total)}`);
  if (typeof d.amount === "number") parts.push(`Amount ${fmt(d.amount)}`);
  if (typeof d.paid === "number") parts.push(`Paid ${fmt(d.paid)}`);
  if (typeof d.method === "string" && d.method) parts.push(d.method);
  return parts.join(" · ");
}
