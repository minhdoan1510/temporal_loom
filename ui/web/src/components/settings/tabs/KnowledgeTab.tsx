import { useEffect, useState, useRef, useCallback } from "react";
import {
  Plus,
  Trash2,
  BookOpen,
  ChevronDown,
  RefreshCw,
  Database,
  FileText,
  Layers,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import type { KnowledgeBase } from "@/types/api";
import { knowledge } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type KBSource = "confluence" | "markdown";

interface KBForm {
  name: string;
  source: KBSource;
  confluence_url: string;
  content: string;
  chunk_size: number;
  chunk_overlap: number;
}

const emptyForm: KBForm = {
  name: "",
  source: "confluence",
  confluence_url: "",
  content: "",
  chunk_size: 1000,
  chunk_overlap: 200,
};

// Confluence base host used to reconstruct a page link from space_key + title.
const CONFLUENCE_BASE = "https://confluence.zalopay.vn";

// parseConfluenceUrl extracts the space key and page title from a Confluence
// /display/<SPACE>/<title> URL, e.g.
// https://confluence.zalopay.vn/display/PD/%5BCash+Loan%5D+%5BSHB%5D+Rollout+Plan
// → { spaceKey: "PD", title: "[Cash Loan] [SHB] Rollout Plan" }.
function parseConfluenceUrl(raw: string): { spaceKey: string; title: string } | null {
  try {
    const u = new URL(raw.trim());
    const parts = u.pathname.split("/").filter(Boolean);
    const di = parts.indexOf("display");
    if (di === -1 || parts.length < di + 3) return null;
    const spaceKey = decodeURIComponent(parts[di + 1]);
    const titleRaw = parts.slice(di + 2).join("/");
    // Confluence encodes spaces as '+' in display URLs.
    const title = decodeURIComponent(titleRaw.replace(/\+/g, " "));
    if (!spaceKey || !title) return null;
    return { spaceKey, title };
  } catch {
    return null;
  }
}

// buildConfluenceUrl reconstructs the display URL for a space + title, matching
// Confluence's '+'-for-space encoding so the link resolves cleanly.
function buildConfluenceUrl(spaceKey: string, title: string): string {
  if (!spaceKey || !title) return "";
  const encTitle = encodeURIComponent(title).replace(/%20/g, "+");
  return `${CONFLUENCE_BASE}/display/${encodeURIComponent(spaceKey)}/${encTitle}`;
}

const statusColors: Record<string, string> = {
  idle: "bg-muted text-muted-foreground",
  syncing: "bg-blue-500/10 text-blue-500 animate-pulse",
  done: "bg-green-500/10 text-green-500",
  error: "bg-red-500/10 text-red-500",
};

export default function KnowledgeTab() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission("tab:knowledge:create");
  const canUpdate = hasPermission("tab:knowledge:update");
  const canDelete = hasPermission("tab:knowledge:delete");

  const [data, setData] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<KBForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    knowledge
      .list()
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    const hasSyncing = data.some((kb) => kb.status === "syncing");
    if (hasSyncing && !pollRef.current) {
      pollRef.current = setInterval(load, 3000);
    } else if (!hasSyncing && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [data, load]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (kb: KnowledgeBase, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(kb.id);
    setForm({
      name: kb.name,
      source: kb.source,
      confluence_url:
        kb.source === "confluence"
          ? buildConfluenceUrl(kb.space_key, kb.root_page)
          : "",
      content: kb.content ?? "",
      chunk_size: kb.chunk_size,
      chunk_overlap: kb.chunk_overlap,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    let payload: Partial<KnowledgeBase>;
    if (form.source === "markdown") {
      if (!form.content.trim()) {
        toast.error("Markdown content is required.");
        return;
      }
      payload = {
        name: form.name,
        source: "markdown",
        content: form.content,
        chunk_size: form.chunk_size,
        chunk_overlap: form.chunk_overlap,
      };
    } else {
      const parsed = parseConfluenceUrl(form.confluence_url);
      if (!parsed) {
        toast.error(
          "Invalid Confluence URL. Expected a /display/<SPACE>/<page> link."
        );
        return;
      }
      payload = {
        name: form.name,
        source: "confluence",
        space_key: parsed.spaceKey,
        root_page: parsed.title,
        chunk_size: form.chunk_size,
        chunk_overlap: form.chunk_overlap,
      };
    }
    setSaving(true);
    try {
      if (editingId) {
        await knowledge.update(editingId, payload);
        toast.success("Knowledge base updated");
      } else {
        await knowledge.create(payload);
        toast.success("Knowledge base created");
      }
      setDialogOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this knowledge base?")) return;
    await knowledge.delete(id);
    toast.success("Knowledge base deleted");
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    load();
  };

  const handleSync = async (id: string, reset: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (reset && !confirm("This will delete and recreate the collection. Continue?")) return;
    try {
      await knowledge.sync(id, reset);
      toast.success("Sync started");
      load();
    } catch {
      // error toast handled by api client
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setForm((f) => ({
        ...f,
        content: text,
        name: f.name || file.name.replace(/\.(md|markdown)$/i, ""),
      }));
    };
    reader.onerror = () => toast.error("Failed to read file");
    reader.readAsText(file);
    // Reset so selecting the same file again re-triggers onChange.
    e.target.value = "";
  };

  const totalKBs = data.length;
  const totalPoints = data.reduce((sum, kb) => sum + kb.total_points, 0);
  const lastSynced = data
    .filter((kb) => kb.last_synced)
    .sort((a, b) => new Date(b.last_synced!).getTime() - new Date(a.last_synced!).getTime())[0]
    ?.last_synced;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold sm:text-2xl">Knowledge</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage knowledge bases indexed from Confluence or Markdown into Qdrant
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} className="cursor-pointer gap-2 self-start rounded-lg sm:self-auto">
            <Plus className="size-4" />
            New Knowledge Base
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      {!loading && data.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Database className="size-4" />
              Total KBs
            </div>
            <p className="mt-1 text-2xl font-semibold">{totalKBs}</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Layers className="size-4" />
              Total Points
            </div>
            <p className="mt-1 text-2xl font-semibold">{totalPoints.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="size-4" />
              Last Synced
            </div>
            <p className="mt-1 text-2xl font-semibold">
              {lastSynced ? new Date(lastSynced).toLocaleDateString() : "Never"}
            </p>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Loading knowledge bases...
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 text-sm text-muted-foreground">
          <BookOpen className="size-8 text-muted-foreground/30" />
          No knowledge bases yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((kb) => {
            const isExpanded = expanded.has(kb.id);

            return (
              <div
                key={kb.id}
                className="rounded-xl border border-border/50 bg-card overflow-hidden"
              >
                {/* Collapsed header */}
                <button
                  onClick={() => toggleExpand(kb.id)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/30"
                >
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground/60 transition-transform duration-200",
                      isExpanded && "rotate-180"
                    )}
                  />
                  <div className="flex size-7 items-center justify-center rounded-md bg-chart-3/10">
                    <BookOpen className="size-3.5 text-chart-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{kb.name}</span>
                    <span className="ml-3 text-sm text-muted-foreground">{kb.collection}</span>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Badge className={cn("text-xs", statusColors[kb.status])}>
                      {kb.status}
                    </Badge>
                    {kb.last_synced && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(kb.last_synced).toLocaleDateString()}
                      </span>
                    )}
                    {(canUpdate || canDelete) && (
                      <div className="flex gap-1 ml-2">
                        {canUpdate && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="cursor-pointer text-muted-foreground/40 hover:text-foreground"
                            onClick={(e) => openEdit(kb, e)}
                            title="Edit"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        )}
                        {canUpdate && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="cursor-pointer text-muted-foreground/40 hover:text-blue-500"
                            onClick={(e) => handleSync(kb.id, false, e)}
                            title="Sync"
                            disabled={kb.status === "syncing"}
                          >
                            <RefreshCw
                              className={cn("size-3.5", kb.status === "syncing" && "animate-spin")}
                            />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="cursor-pointer text-muted-foreground/40 hover:text-destructive"
                            onClick={(e) => handleDelete(kb.id, e)}
                            title="Delete"
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
                    {/* Config */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                          Source
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-border/50 text-xs">
                            {kb.source}
                          </Badge>
                          {kb.source === "confluence" && (
                            <a
                              href={buildConfluenceUrl(kb.space_key, kb.root_page)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                              title={`${kb.space_key} / ${kb.root_page}`}
                            >
                              <FileText className="size-3.5 shrink-0" />
                              View document
                            </a>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                          Chunking
                        </p>
                        <span className="text-sm">
                          Size: {kb.chunk_size} / Overlap: {kb.chunk_overlap}
                        </span>
                      </div>
                    </div>

                    {/* Sync stats */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                        Sync Stats
                      </p>
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <div className="flex items-center gap-1.5 text-sm">
                          <FileText className="size-3.5 text-muted-foreground" />
                          <span className="font-medium">{kb.total_pages}</span>
                          <span className="text-muted-foreground">pages</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm">
                          <Layers className="size-3.5 text-muted-foreground" />
                          <span className="font-medium">{kb.total_chunks}</span>
                          <span className="text-muted-foreground">chunks</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm">
                          <Database className="size-3.5 text-muted-foreground" />
                          <span className="font-medium">{kb.total_points}</span>
                          <span className="text-muted-foreground">points</span>
                        </div>
                      </div>
                    </div>

                    {/* Error */}
                    {kb.error_msg && (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-red-500/60">
                          Error
                        </p>
                        <pre className="max-h-40 overflow-auto rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-500 whitespace-pre-wrap">
                          {kb.error_msg}
                        </pre>
                      </div>
                    )}

                    {/* Sync with reset */}
                    {canUpdate && (
                      <div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="cursor-pointer gap-2 text-xs"
                          onClick={(e) => handleSync(kb.id, true, e)}
                          disabled={kb.status === "syncing"}
                        >
                          <RefreshCw className="size-3" />
                          Sync with Reset
                        </Button>
                      </div>
                    )}

                    {/* Timestamps */}
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      {kb.created_by && <span>Created by: {kb.created_by}</span>}
                      <span>Created: {new Date(kb.created_at).toLocaleString()}</span>
                      <span>Updated: {new Date(kb.updated_at).toLocaleString()}</span>
                      {kb.last_synced && (
                        <span>Last synced: {new Date(kb.last_synced).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[85vh] sm:max-w-lg flex-col border-border/50 bg-sidebar">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editingId ? "Edit Knowledge Base" : "New Knowledge Base"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Source Type
              </label>
              <Tabs
                value={form.source}
                onValueChange={(v) => setForm({ ...form, source: v as KBSource })}
              >
                <TabsList className="w-full">
                  <TabsTrigger
                    value="confluence"
                    disabled={!!editingId}
                    className="flex-1"
                  >
                    Confluence
                  </TabsTrigger>
                  <TabsTrigger
                    value="markdown"
                    disabled={!!editingId}
                    className="flex-1"
                  >
                    Markdown
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Name
              </label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Cash Loan KB"
                className="bg-card"
              />
            </div>
            {form.source === "confluence" ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                  Confluence URL
                </label>
                <Input
                  value={form.confluence_url}
                  onChange={(e) => setForm({ ...form, confluence_url: e.target.value })}
                  placeholder="https://confluence.zalopay.vn/display/PD/[Cash+Loan]+Rollout+Plan"
                  className="bg-card"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Paste the Confluence page link. Space key and root page are parsed automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                    Upload Markdown File
                  </label>
                  <Input
                    type="file"
                    accept=".md,.markdown,text/markdown"
                    onChange={handleFileUpload}
                    className="bg-card"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Upload a .md file, or paste/edit the content below.
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                    Content
                  </label>
                  <Textarea
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    placeholder="# Title&#10;&#10;Write or paste markdown here..."
                    className="min-h-40 bg-card font-mono text-xs"
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                  Chunk Size
                </label>
                <Input
                  type="number"
                  value={form.chunk_size}
                  onChange={(e) => setForm({ ...form, chunk_size: parseInt(e.target.value) || 1000 })}
                  className="bg-card"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                  Chunk Overlap
                </label>
                <Input
                  type="number"
                  value={form.chunk_overlap}
                  onChange={(e) =>
                    setForm({ ...form, chunk_overlap: parseInt(e.target.value) || 200 })
                  }
                  className="bg-card"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                !form.name ||
                (form.source === "confluence"
                  ? !form.confluence_url
                  : !form.content.trim())
              }
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
