import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Plug,
  ChevronDown,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import type { MCPServer } from "@/types/api";
import { mcpServers } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ServerForm {
  name: string;
  url: string;
  auth_token: string;
  description: string;
  enabled: boolean;
}

const emptyForm: ServerForm = {
  name: "",
  url: "",
  auth_token: "",
  description: "",
  enabled: true,
};

export default function MCPServersTab() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission("tab:mcp:create");
  const canUpdate = hasPermission("tab:mcp:update");
  const canDelete = hasPermission("tab:mcp:delete");

  const [data, setData] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<ServerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    mcpServers
      .list()
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const openCreate = () => {
    setEditingName(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (s: MCPServer, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingName(s.name);
    setForm({
      name: s.name,
      url: s.url,
      auth_token: "",
      description: s.description,
      enabled: s.enabled,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      toast.error("Name and URL are required");
      return;
    }
    setSaving(true);
    try {
      let result: MCPServer;
      if (editingName) {
        const patch: {
          url?: string;
          auth_token?: string;
          description?: string;
          enabled?: boolean;
        } = {
          url: form.url,
          description: form.description,
          enabled: form.enabled,
        };
        if (form.auth_token) patch.auth_token = form.auth_token;
        result = await mcpServers.update(editingName, patch);
        toast.success("MCP server updated");
      } else {
        result = await mcpServers.create({
          name: form.name,
          url: form.url,
          auth_token: form.auth_token || undefined,
          description: form.description,
          enabled: form.enabled,
        });
        toast.success("MCP server registered");
      }
      if (result.warning) toast.warning(result.warning);
      setDialogOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete MCP server "${name}"? Its tools will be unregistered.`)) return;
    await mcpServers.delete(name);
    toast.success("MCP server deleted");
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
    load();
  };

  const handleRefresh = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(name);
    try {
      const result = await mcpServers.refresh(name);
      if (result.warning) toast.warning(result.warning);
      else toast.success(`Discovered ${result.functions.length} tool(s)`);
      load();
    } finally {
      setRefreshing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold sm:text-2xl">MCP Servers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Register external Model Context Protocol servers and expose their tools to the agent.
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} className="cursor-pointer gap-2 self-start rounded-lg sm:self-auto">
            <Plus className="size-4" />
            Add server
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Plug className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No MCP servers registered yet.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((srv) => {
            const isOpen = expanded.has(srv.name);
            return (
              <div
                key={srv.name}
                className="rounded-lg border border-border bg-card overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(srv.name)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <ChevronDown
                    className={cn(
                      "size-4 text-muted-foreground transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                  <Plug className="size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-medium">{srv.name}</span>
                      {srv.enabled ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="size-3" /> enabled
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <XCircle className="size-3" /> disabled
                        </Badge>
                      )}
                      {srv.has_auth && (
                        <Badge variant="outline">auth</Badge>
                      )}
                      <Badge variant="outline">
                        {srv.functions.length} tool{srv.functions.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {srv.url}
                      {srv.last_synced && (
                        <>
                          {" · synced "}
                          {new Date(srv.last_synced).toLocaleString()}
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canUpdate && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={refreshing === srv.name}
                          onClick={(e) => handleRefresh(srv.name, e)}
                          title="Re-discover tools"
                        >
                          <RefreshCw
                            className={cn(
                              "size-4",
                              refreshing === srv.name && "animate-spin"
                            )}
                          />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => openEdit(srv, e)}
                          title="Edit"
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </>
                    )}
                    {canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => handleDelete(srv.name, e)}
                        title="Delete"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border px-4 py-3 bg-muted/20">
                    {srv.description && (
                      <p className="mb-3 text-sm text-muted-foreground">
                        {srv.description}
                      </p>
                    )}
                    {srv.warning && (
                      <div className="mb-3 flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-300">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        <span>{srv.warning}</span>
                      </div>
                    )}
                    {srv.functions.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">
                        No tools discovered. Try refreshing.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {srv.functions.map((fn) => (
                          <li
                            key={fn.name}
                            className={cn(
                              "rounded-md border border-border bg-background p-3",
                              !fn.enabled && "opacity-60"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <code className="text-sm font-medium">
                                    {fn.name}
                                  </code>
                                  <Badge variant="outline" className="text-xs">
                                    mcp:{srv.name}:{fn.name}
                                  </Badge>
                                  {!fn.enabled && (
                                    <Badge variant="outline" className="text-xs">
                                      disabled
                                    </Badge>
                                  )}
                                </div>
                                {fn.description && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {fn.description}
                                  </p>
                                )}
                              </div>
                              {canUpdate && (
                                <label className="flex cursor-pointer items-center gap-2 text-xs select-none">
                                  <input
                                    type="checkbox"
                                    className="accent-primary"
                                    checked={fn.enabled}
                                    onChange={async (e) => {
                                      const next = e.target.checked;
                                      try {
                                        await mcpServers.setFunctionEnabled(
                                          srv.name,
                                          fn.name,
                                          next
                                        );
                                        toast.success(
                                          `${fn.name} ${next ? "enabled" : "disabled"}`
                                        );
                                        load();
                                      } catch {
                                        load();
                                      }
                                    }}
                                  />
                                  enabled
                                </label>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingName ? `Edit "${editingName}"` : "Register MCP server"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={!!editingName}
                placeholder="jira"
              />
            </div>
            <div>
              <label className="text-sm font-medium">URL</label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="http://lending-claw-mcp:7080/mcp/jira"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                Auth token {editingName && <span className="text-muted-foreground">(leave blank to keep current)</span>}
              </label>
              <Input
                type="password"
                value={form.auth_token}
                onChange={(e) => setForm({ ...form, auth_token: e.target.value })}
                placeholder="Bearer token"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              Enabled
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editingName ? "Save" : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
