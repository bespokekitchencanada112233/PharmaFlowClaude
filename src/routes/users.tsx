import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/roles";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { AppRole } from "@/lib/types";
import { createStaffUser, deleteStaffUser, setStaffDisplayName } from "@/lib/users.functions";

export const Route = createFileRoute("/users")({
  component: UsersPage,
});

interface UserRoleRow {
  user_id: string;
  role: AppRole;
}

function UsersPage() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const [rows, setRows] = useState<UserRoleRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("salesman");
  const [busy, setBusy] = useState(false);

  const createFn = useServerFn(createStaffUser);
  const deleteFn = useServerFn(deleteStaffUser);
  const setNameFn = useServerFn(setStaffDisplayName);

  const load = async () => {
    setLoading(true);
    const [{ data: roles }, { data: profiles }] = await Promise.all([
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_profiles").select("user_id, display_name"),
    ]);
    setRows((roles ?? []) as UserRoleRow[]);
    const map: Record<string, string> = {};
    (profiles ?? []).forEach((p) => {
      map[p.user_id] = p.display_name ?? "";
    });
    setNames(map);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  if (roleLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Users" />
        <div className="p-8 text-sm text-muted-foreground">Admin access required.</div>
      </>
    );
  }

  const byUser = new Map<string, AppRole[]>();
  rows.forEach((r) => {
    const arr = byUser.get(r.user_id) ?? [];
    arr.push(r.role);
    byUser.set(r.user_id, arr);
  });

  const setRole = async (uid: string, role: AppRole) => {
    await supabase.from("user_roles").delete().eq("user_id", uid);
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role });
    if (error) return toast.error(error.message);
    toast.success("Role updated");
    load();
  };

  const saveName = async (uid: string, value: string) => {
    if ((names[uid] ?? "") === value) return;
    try {
      await setNameFn({ data: { user_id: uid, display_name: value } });
      setNames((n) => ({ ...n, [uid]: value }));
      toast.success("Name saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save name");
    }
  };

  const handleCreate = async () => {
    if (!email || password.length < 6) {
      return toast.error("Enter email and a password of at least 6 characters");
    }
    setBusy(true);
    try {
      await createFn({ data: { email, password, role: newRole, display_name: displayName } });
      toast.success(`Staff account created for ${email}`);
      setEmail(""); setPassword(""); setDisplayName(""); setNewRole("salesman");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (uid: string) => {
    if (!confirm("Remove this staff member? They will lose access immediately.")) return;
    try {
      await deleteFn({ data: { user_id: uid } });
      toast.success("Staff member removed");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove user");
    }
  };

  return (
    <>
      <PageHeader title="Users" subtitle="Manage staff accounts and roles" />
      <div className="p-8 space-y-4">
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="size-4 mr-1" /> Add staff member</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add staff member</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="mb-1.5 block text-xs">Display name</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Ahmed Khan" />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs">Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs">Temporary password</Label>
                  <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} />
                  <p className="text-xs text-muted-foreground mt-1">
                    Share this with the staff member. They sign in with email + password.
                  </p>
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs">Role</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="salesman">Salesman</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                <Button onClick={handleCreate} disabled={busy}>
                  {busy ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="p-0 overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : byUser.size === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No users.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary text-secondary-foreground text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">User ID</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 w-44"></th>
                  <th className="px-4 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byUser.entries()).map(([uid, roles]) => {
                  const role: AppRole = roles.includes("admin") ? "admin" : roles[0];
                  const isSelf = uid === user?.id;
                  return (
                    <tr key={uid} className="border-t border-border">
                      <td className="px-4 py-2">
                        <NameCell
                          initial={names[uid] ?? ""}
                          onSave={(v) => saveName(uid, v)}
                        />
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {uid.slice(0, 8)}…{isSelf && <span className="ml-2 text-accent">(you)</span>}
                      </td>
                      <td className="px-4 py-2 capitalize">{role}</td>
                      <td className="px-4 py-2">
                        <Select value={role} onValueChange={(v) => setRole(uid, v as AppRole)} disabled={isSelf}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="salesman">Salesman</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2">
                        {!isSelf && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(uid)}
                            title="Remove staff member"
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="p-4 text-xs text-muted-foreground border-t border-border">
            Public signups are disabled. Add staff members here — they can sign in with the
            email and password you set. Display names appear in the Audit Log.
          </div>
        </Card>
      </div>
    </>
  );
}

function NameCell({ initial, onSave }: { initial: string; onSave: (v: string) => Promise<void> | void }) {
  const [v, setV] = useState(initial);
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!focused) setV(initial);
  }, [initial, focused]);
  const dirty = v.trim() !== (initial ?? "").trim();
  const doSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(v.trim());
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1000);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); void doSave(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); void doSave(); }
        }}
        placeholder="Add name…"
        className="h-8"
      />
      {dirty && (
        <Button size="sm" variant="secondary" className="h-8 px-2" disabled={saving} onMouseDown={(e) => e.preventDefault()} onClick={() => void doSave()}>
          {saving ? "…" : "Save"}
        </Button>
      )}
      {justSaved && !dirty && <span className="text-xs text-green-600">✓</span>}
    </div>
  );
}
