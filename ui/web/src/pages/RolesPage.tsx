import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Shield,
  ChevronDown,
  Check,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@/types/api";
import { rbacApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const CRUD_ACTIONS = ["read", "create", "update", "delete"] as const;
const TAB_LABELS: Record<string, string> = {
  sessions: "Sessions",
  skills: "Skills",
  "context-files": "Context Files",
  traces: "Traces",
  roles: "Roles",
  knowledge: "Knowledge",
  mcp: "MCP Servers",
};

export default function RolesPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission("tab:roles:create");
  const canUpdate = hasPermission("tab:roles:update");
  const canDelete = hasPermission("tab:roles:delete");
  const [roles, setRoles] = useState<Role[]>([]);
  const [resources, setResources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  // Role dialog
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Inline member add

  const load = async () => {
    setLoading(true);
    try {
      const [rolesData, resourcesData] = await Promise.all([
        rbacApi.roles.list(),
        rbacApi.resources(),
      ]);
      setRoles(rolesData);
      setResources(resourcesData);
    } catch {
      setRoles([]);
      setResources([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingRole(null);
    setRoleName("");
    setSelectedPerms(new Set());
    setRoleDialogOpen(true);
  };

  const openEdit = (role: Role, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRole(role.name);
    setRoleName(role.name);
    setSelectedPerms(new Set(role.permissions));
    setRoleDialogOpen(true);
  };

  const handleSaveRole = async () => {
    setSaving(true);
    try {
      const perms = Array.from(selectedPerms);
      if (editingRole) {
        await rbacApi.roles.update(editingRole, { permissions: perms });
        toast.success("Role updated");
      } else {
        await rbacApi.roles.create({ name: roleName, permissions: perms });
        toast.success("Role created");
      }
      setRoleDialogOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete role "${name}"?`)) return;
    await rbacApi.roles.delete(name);
    toast.success("Role deleted");
    setExpandedRoles((prev) => { const next = new Set(prev); next.delete(name); return next; });
    load();
  };

  const togglePerm = (perm: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) {
        next.delete(perm);
      } else {
        next.add(perm);
      }
      return next;
    });
  };

  const toolResources = resources.filter((r) => r.startsWith("tool:"));

  // MCP resources grouped by server: { "jira": ["mcp:jira:read_jira_ticket", ...], ... }
  const mcpResourcesByServer = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of resources) {
      if (!r.startsWith("mcp:")) continue;
      const parts = r.split(":");
      if (parts.length !== 3) continue;
      const server = parts[1];
      if (!m.has(server)) m.set(server, []);
      m.get(server)!.push(r);
    }
    for (const arr of m.values()) arr.sort();
    return m;
  }, [resources]);

  const tabMatrix = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of resources) {
      if (!r.startsWith("tab:")) continue;
      const parts = r.split(":");
      if (parts.length !== 3) continue;
      const tabName = parts[1];
      const action = parts[2];
      if (!map.has(tabName)) map.set(tabName, new Set());
      map.get(tabName)!.add(action);
    }
    return Array.from(map.entries()).map(([name, actions]) => ({
      name,
      label: TAB_LABELS[name] || name,
      actions,
    }));
  }, [resources]);

  // Build a read-only permission matrix for a specific role
  const buildRoleMatrix = (role: Role) => {
    const perms = new Set(role.permissions || []);
    return tabMatrix.map((tab) => ({
      ...tab,
      granted: CRUD_ACTIONS.reduce(
        (acc, action) => {
          acc[action] = perms.has(`tab:${tab.name}:${action}`);
          return acc;
        },
        {} as Record<string, boolean>
      ),
    }));
  };

  const getRoleToolPerms = (role: Role) =>
    (role.permissions || []).filter((p) => p.startsWith("tool:"));

  const getRoleMCPPermsByServer = (role: Role) => {
    const m = new Map<string, string[]>();
    for (const p of role.permissions || []) {
      if (!p.startsWith("mcp:")) continue;
      const parts = p.split(":");
      if (parts.length !== 3) continue;
      const server = parts[1];
      if (!m.has(server)) m.set(server, []);
      m.get(server)!.push(parts[2]);
    }
    return m;
  };

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold sm:text-2xl">Roles</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage roles, permissions, and member assignments
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} className="cursor-pointer gap-2 self-start rounded-lg sm:self-auto">
            <Plus className="size-4" />
            New Role
          </Button>
        )}
      </div>

      {/* Roles list */}
      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Loading roles...
        </div>
      ) : roles.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 text-sm text-muted-foreground">
          <Shield className="size-8 text-muted-foreground/30" />
          No roles yet. All users have full access (bootstrap mode).
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => {
            const isExpanded = expandedRoles.has(role.name);
            const matrix = isExpanded ? buildRoleMatrix(role) : [];
            const roleTools = isExpanded ? getRoleToolPerms(role) : [];
            const members = role.members || [];

            return (
              <div
                key={role.name}
                className="rounded-xl border border-border/50 bg-card overflow-hidden"
              >
                {/* Collapsed header — always visible */}
                <button
                  onClick={() => setExpandedRoles((prev) => {
                    const next = new Set(prev);
                    if (isExpanded) next.delete(role.name); else next.add(role.name);
                    return next;
                  })}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/30"
                >
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground/60 transition-transform duration-200",
                      isExpanded && "rotate-180"
                    )}
                  />
                  <div className="flex size-7 items-center justify-center rounded-md bg-chart-4/10">
                    <Shield className="size-3.5 text-chart-4" />
                  </div>
                  <span className="font-medium">{role.name}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <Badge variant="outline" className="border-border/50 text-xs text-muted-foreground">
                      {role.permissions?.length || 0} permissions
                    </Badge>
                    <Badge variant="outline" className="border-border/50 text-xs text-muted-foreground">
                      {members.length} members
                    </Badge>
                    {(canUpdate || canDelete) && (
                      <div className="flex gap-1 ml-2">
                        {canUpdate && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="cursor-pointer text-muted-foreground/40 hover:text-foreground"
                            onClick={(e) => openEdit(role, e)}
                            title="Edit permissions"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="cursor-pointer text-muted-foreground/40 hover:text-destructive"
                            onClick={(e) => handleDeleteRole(role.name, e)}
                            title="Delete role"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border/50 px-4 py-4 space-y-4">
                    {/* Permissions matrix */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                        Tab Permissions
                      </p>
                      <div className="overflow-x-auto rounded-lg border border-border/50">
                        <table className="w-full min-w-[480px] text-sm">
                          <thead>
                            <tr className="border-b border-border/50 bg-muted/30">
                              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                                Resource
                              </th>
                              {CRUD_ACTIONS.map((action) => (
                                <th
                                  key={action}
                                  className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground/60"
                                >
                                  {action}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {matrix.map((tab) => (
                              <tr key={tab.name} className="border-b border-border/30 last:border-0">
                                <td className="px-3 py-1.5 font-medium text-sm">{tab.label}</td>
                                {CRUD_ACTIONS.map((action) => {
                                  const available = tab.actions.has(action);
                                  const granted = tab.granted[action];
                                  return (
                                    <td key={action} className="px-3 py-1.5 text-center">
                                      {!available ? (
                                        <Minus className="mx-auto size-3.5 text-muted-foreground/20" />
                                      ) : granted ? (
                                        <Check className="mx-auto size-3.5 text-primary" />
                                      ) : (
                                        <Minus className="mx-auto size-3.5 text-muted-foreground/30" />
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Tool permissions */}
                    {roleTools.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                          Platform Tool Permissions
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {roleTools.map((t) => (
                            <Badge key={t} variant="outline" className="border-border/50 text-xs font-mono">
                              {t.replace("tool:", "")}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* MCP permissions */}
                    {(() => {
                      const mcpMap = getRoleMCPPermsByServer(role);
                      if (mcpMap.size === 0) return null;
                      return (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                            MCP Tool Permissions
                          </p>
                          <div className="space-y-2">
                            {[...mcpMap.entries()].sort().map(([server, fns]) => (
                              <div key={server} className="rounded-md border border-border/50 px-3 py-2">
                                <div className="text-xs font-medium">mcp:{server}</div>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {fns.map((fn) => (
                                    <Badge key={fn} variant="outline" className="border-border/50 text-xs font-mono">
                                      {fn}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Members */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                        Members
                      </p>
                      {members.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No members assigned.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {members.map((sub) => (
                            <div
                              key={sub}
                              className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-1.5"
                            >
                              <span className="text-sm font-mono">{sub}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Role Create/Edit Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col border-border/50 bg-sidebar">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editingRole ? `Edit Role: ${editingRole}` : "New Role"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {!editingRole && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                  Role Name
                </label>
                <Input
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g. admin, cs_agent"
                  className="bg-card"
                />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Tab Permissions
              </label>
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                        Resource
                      </th>
                      {CRUD_ACTIONS.map((action) => (
                        <th
                          key={action}
                          className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground/60"
                        >
                          {action}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tabMatrix.map((tab) => (
                      <tr key={tab.name} className="border-b border-border/30 last:border-0">
                        <td className="px-3 py-2 font-medium">{tab.label}</td>
                        {CRUD_ACTIONS.map((action) => {
                          const resource = `tab:${tab.name}:${action}`;
                          const available = tab.actions.has(action);
                          return (
                            <td key={action} className="px-3 py-2 text-center">
                              {available ? (
                                <input
                                  type="checkbox"
                                  checked={selectedPerms.has(resource)}
                                  onChange={() => togglePerm(resource)}
                                  className="accent-primary cursor-pointer"
                                />
                              ) : (
                                <span className="text-muted-foreground/40">&mdash;</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {toolResources.length > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                  Platform Tool Permissions
                </label>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {toolResources.map((r) => (
                    <label
                      key={r}
                      className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPerms.has(r)}
                        onChange={() => togglePerm(r)}
                        className="accent-primary"
                      />
                      {r}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {mcpResourcesByServer.size > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                  MCP Tool Permissions
                </label>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {[...mcpResourcesByServer.entries()].sort().map(([server, perms]) => {
                    const allSelected = perms.every((p) => selectedPerms.has(p));
                    return (
                      <div key={server} className="rounded-md border border-border/50 p-2">
                        <label className="flex items-center gap-2 rounded px-1 py-1 text-sm font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={() => {
                              setSelectedPerms((prev) => {
                                const next = new Set(prev);
                                if (allSelected) {
                                  for (const p of perms) next.delete(p);
                                } else {
                                  for (const p of perms) next.add(p);
                                }
                                return next;
                              });
                            }}
                            className="accent-primary"
                          />
                          mcp:{server}
                        </label>
                        <div className="ml-5 mt-1 space-y-0.5">
                          {perms.map((r) => {
                            const fn = r.split(":")[2] ?? r;
                            return (
                              <label
                                key={r}
                                className="flex items-center gap-2 rounded px-2 py-0.5 text-xs hover:bg-muted/30 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedPerms.has(r)}
                                  onChange={() => togglePerm(r)}
                                  className="accent-primary"
                                />
                                {fn}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => setRoleDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveRole}
              disabled={saving || (!editingRole && !roleName.trim())}
              className="cursor-pointer"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
