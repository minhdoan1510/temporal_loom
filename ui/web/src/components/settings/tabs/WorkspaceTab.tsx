import { useEffect, useState } from "react";
import {
  FolderClosed,
  Hash,
  Calendar,
  Save,
  Users,
  UserPlus,
  UserMinus,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import type { Role, WorkspaceMember } from "@/types/api";
import { workspaces as workspacesApi, rbacApi } from "@/lib/api";
import { useWorkspacesStore } from "@/stores/workspaces";
import { useAuthStore } from "@/stores/auth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function WorkspaceTab() {
  const { workspaces, activeWorkspaceId, updateWorkspace } = useWorkspacesStore();
  const canUpdate = useAuthStore((s) => s.hasPermission("tab:workspace:update"));
  // Member + role-assignment management is gated by workspace edit rights
  // (kept separate from tab:roles, which only governs editing role details).
  const canManageMembers = canUpdate;
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Members + roles
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  // Add / edit member dialog
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<string | null>(null); // null = add mode
  const [memberSub, setMemberSub] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [memberSaving, setMemberSaving] = useState(false);

  // Sync local form when the active workspace changes.
  useEffect(() => {
    setName(workspace?.name ?? "");
    setDescription(workspace?.description ?? "");
  }, [workspace?.id, workspace?.name, workspace?.description]);

  const loadMembers = async () => {
    if (!workspace) return;
    try {
      const [m, r] = await Promise.all([
        workspacesApi.members(workspace.id),
        rbacApi.roles.list(),
      ]);
      setMembers(m);
      setRoles(r);
    } catch {
      // error toast handled by api client
    }
  };

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  if (!workspace) {
    return <div className="p-4 text-sm text-muted-foreground">No workspace selected.</div>;
  }

  const dirty =
    name.trim() !== workspace.name || description !== (workspace.description ?? "");

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Workspace name is required");
      return;
    }
    setSaving(true);
    try {
      await updateWorkspace(workspace.id, { name: name.trim(), description });
      toast.success("Workspace updated");
    } catch {
      // error toast handled by api client
    } finally {
      setSaving(false);
    }
  };

  const rolesForMember = (sub: string) =>
    roles.filter((r) => (r.members || []).includes(sub)).map((r) => r.name);

  // A workspace must always keep at least one admin.
  const adminRole = roles.find((r) => r.name === "admin");
  const isSoleAdmin = (sub: string) =>
    !!adminRole &&
    (adminRole.members || []).length === 1 &&
    (adminRole.members || []).includes(sub);

  const openAddMember = () => {
    setEditingSub(null);
    setMemberSub("");
    setSelectedRoles(new Set());
    setMemberDialogOpen(true);
  };

  const openEditMember = (sub: string) => {
    setEditingSub(sub);
    setMemberSub(sub);
    setSelectedRoles(new Set(rolesForMember(sub)));
    setMemberDialogOpen(true);
  };

  const handleSaveMember = async () => {
    const sub = memberSub.trim();
    if (!sub) {
      toast.error("User ID is required");
      return;
    }
    setMemberSaving(true);
    try {
      const rolesArr = Array.from(selectedRoles);
      if (editingSub) {
        await workspacesApi.setMemberRoles(workspace.id, editingSub, rolesArr);
        toast.success("Member roles updated");
      } else {
        await workspacesApi.addMember(workspace.id, sub, rolesArr);
        toast.success("Member added");
      }
      setMemberDialogOpen(false);
      loadMembers();
    } catch {
      // error toast (e.g. 409 last-admin) surfaced by the api client
    } finally {
      setMemberSaving(false);
    }
  };

  const handleRemoveMember = async (sub: string) => {
    if (!confirm(`Remove "${sub}" from this workspace?`)) return;
    try {
      await workspacesApi.removeMember(workspace.id, sub);
      toast.success("Member removed");
      loadMembers();
    } catch {
      // error toast surfaced by the api client
    }
  };

  const created = workspace.created_at
    ? new Date(workspace.created_at).toLocaleString()
    : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 sm:size-12">
          <FolderClosed className="size-6 text-primary sm:size-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-xl font-semibold sm:text-2xl">
            {workspace.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Workspace settings and information
          </p>
        </div>
      </div>

      {/* Editable fields */}
      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
            Name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name"
            className="bg-background"
            disabled={!canUpdate}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
            Description
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this workspace for?"
            rows={3}
            className="bg-background"
            disabled={!canUpdate}
          />
        </div>
        {canUpdate ? (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || !dirty} className="cursor-pointer gap-2">
              <Save className="size-4" />
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            You don't have permission to edit this workspace.
          </p>
        )}
      </div>

      {/* Read-only metadata */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InfoCard icon={<Hash className="size-3.5" />} label="Slug" value={workspace.slug} mono />
        <InfoCard icon={<Hash className="size-3.5" />} label="Workspace ID" value={workspace.id} mono />
        <InfoCard icon={<Calendar className="size-3.5" />} label="Created" value={created} />
      </div>

      {/* Members */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <h3 className="font-heading text-base font-semibold">Members</h3>
            <Badge variant="outline" className="border-border/50 text-xs text-muted-foreground">
              {members.length}
            </Badge>
          </div>
          {canManageMembers && (
            <Button onClick={openAddMember} size="sm" className="cursor-pointer gap-1.5">
              <UserPlus className="size-3.5" />
              Add member
            </Button>
          )}
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        ) : (
          <div className="space-y-1.5">
            {members.map((m) => {
              const memberRoles = rolesForMember(m.user_sub);
              const soleAdmin = isSoleAdmin(m.user_sub);
              return (
                <div
                  key={m.user_sub}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 px-3 py-2"
                >
                  <span className="text-sm font-mono">{m.user_sub}</span>
                  <div className="flex flex-wrap gap-1">
                    {memberRoles.length === 0 ? (
                      <span className="text-xs italic text-muted-foreground/60">no roles</span>
                    ) : (
                      memberRoles.map((rn) => (
                        <Badge
                          key={rn}
                          variant="outline"
                          className="border-border/50 text-xs"
                        >
                          {rn}
                        </Badge>
                      ))
                    )}
                  </div>
                  <div className="ml-auto flex gap-1">
                    {canManageMembers && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="cursor-pointer text-muted-foreground/40 hover:text-foreground"
                        onClick={() => openEditMember(m.user_sub)}
                        title="Edit roles"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    )}
                    {canManageMembers && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={soleAdmin}
                        title={
                          soleAdmin
                            ? "A workspace must keep at least one admin."
                            : "Remove member"
                        }
                        className="cursor-pointer text-muted-foreground/40 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground/40"
                        onClick={() => handleRemoveMember(m.user_sub)}
                      >
                        <UserMinus className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit member dialog */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-md flex-col border-border/50 bg-sidebar">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editingSub ? `Edit roles: ${editingSub}` : "Add member"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                User ID (JWT sub)
              </label>
              <Input
                value={memberSub}
                onChange={(e) => setMemberSub(e.target.value)}
                placeholder="e.g. user-123"
                className="bg-card"
                disabled={!!editingSub}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Roles
              </label>
              {roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No roles available. Create one in the Roles tab first.
                </p>
              ) : (
                <MultiSelect
                  options={roles.map((r) => r.name)}
                  value={Array.from(selectedRoles)}
                  onChange={(next) => setSelectedRoles(new Set(next))}
                  placeholder="Select roles…"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => setMemberDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveMember}
              disabled={memberSaving || (!editingSub && !memberSub.trim())}
              className="cursor-pointer"
            >
              {memberSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
        {icon}
        {label}
      </div>
      <div className={mono ? "truncate text-xs font-mono" : "text-sm"} title={value}>
        {value}
      </div>
    </div>
  );
}
