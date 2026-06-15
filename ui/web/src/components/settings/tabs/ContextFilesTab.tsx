import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, FileText, Circle, Plus, Trash2, ChevronLeft } from "lucide-react";
import type { ContextFile } from "@/types/api";
import { contextFiles } from "@/lib/api";
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

export default function ContextFilesTab() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission("tab:context-files:create");
  const canUpdate = hasPermission("tab:context-files:update");
  const canDelete = hasPermission("tab:context-files:delete");
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ContextFile | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newScope, setNewScope] = useState<"global" | "user">("global");
  const [newContent, setNewContent] = useState("");
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    contextFiles
      .list()
      .then((data) => {
        setFiles(data);
        if (
          !selected &&
          data.length > 0 &&
          typeof window !== "undefined" &&
          window.matchMedia("(min-width: 768px)").matches
        ) {
          selectFile(data[0]);
        }
      })
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectFile = (f: ContextFile) => {
    setSelected(f);
    setEditContent(f.content);
    setDirty(false);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await contextFiles.upsert({
        id: selected.id,
        scope: selected.scope,
        user_id: selected.user_id,
        path: selected.path,
        content: editContent,
      });
      toast.success("Context file saved");
      setDirty(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setNewPath("");
    setNewScope("global");
    setNewContent("");
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const created = await contextFiles.create({
        path: newPath,
        scope: newScope,
        content: newContent,
      });
      toast.success("Context file created");
      setDialogOpen(false);
      load();
      selectFile(created);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm("Delete this context file?")) return;
    await contextFiles.delete(
      selected.scope,
      selected.path,
      selected.user_id ?? undefined,
    );
    toast.success("Context file deleted");
    setSelected(null);
    load();
  };

  const grouped = files.reduce<Record<string, ContextFile[]>>((acc, f) => {
    const key = f.scope || "global";
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold sm:text-2xl">Context Files</h2>
          <p className="mt-1 text-sm text-muted-foreground">System prompt sources</p>
        </div>
      </div>

      {/* Editor & Sidebar container */}
      <div className="flex h-[55vh] rounded-xl border border-border/50 overflow-hidden bg-muted/10">
        {/* Sidebar file tree */}
        <div
          className={cn(
            "flex w-full flex-col border-r border-border/50 bg-sidebar/40 md:w-56 shrink-0",
            selected && "hidden md:flex"
          )}
        >
          <div className="flex items-center justify-between border-b border-border/50 px-3 py-2 bg-sidebar/20">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Files</span>
            {canCreate && (
              <Button
                size="sm"
                variant="ghost"
                onClick={openCreate}
                className="cursor-pointer size-6 p-0 hover:bg-muted/50"
                title="New file"
              >
                <Plus className="size-3.5" />
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
            {loading ? (
              <p className="p-2 text-xs text-muted-foreground">Loading...</p>
            ) : files.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">No files found.</p>
            ) : (
              Object.entries(grouped).map(([scope, items]) => (
                <div key={scope} className="space-y-0.5">
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                    {scope}
                  </p>
                  {items.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => selectFile(f)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors duration-150",
                        selected?.id === f.id
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      <FileText className="size-3.5 shrink-0" />
                      <span className="truncate">{f.path}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Editor panel */}
        <div
          className={cn(
            "flex flex-1 flex-col bg-background",
            !selected && "hidden md:flex"
          )}
        >
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/10 px-3 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden"
                    aria-label="Back to file list"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <span className="truncate font-mono text-xs font-medium text-foreground">
                    {selected.path}
                  </span>
                  <Badge variant="outline" className="shrink-0 border-border/50 text-[10px] text-muted-foreground px-1.5 py-0">
                    {selected.scope}
                  </Badge>
                  {dirty && (
                    <Circle className="size-1.5 shrink-0 fill-chart-3 text-chart-3" />
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleDelete}
                      className="cursor-pointer gap-1 px-2 py-1 h-7 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                      Delete
                    </Button>
                  )}
                  {canUpdate && (
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={saving || !dirty}
                      className="cursor-pointer gap-1 px-2.5 py-1 h-7 text-xs rounded-md"
                    >
                      <Save className="size-3" />
                      {saving ? "Saving..." : "Save"}
                    </Button>
                  )}
                </div>
              </div>
              <Textarea
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value);
                  setDirty(true);
                }}
                className="flex-1 resize-none rounded-none border-0 bg-background p-3 font-mono text-xs leading-relaxed text-foreground focus-visible:ring-0"
              />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground bg-background">
              <FileText className="size-8 text-muted-foreground/20" />
              <span className="text-xs">Select a file to edit</span>
            </div>
          )}
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Context File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Path
              </label>
              <Input
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="e.g. GUIDELINES.md"
                className="bg-card"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Scope
              </label>
              <select
                value={newScope}
                onChange={(e) => setNewScope(e.target.value as "global" | "user")}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="global">global</option>
                <option value="user">user</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Content
              </label>
              <Textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Initial content..."
                rows={8}
                className="bg-card font-mono text-sm"
              />
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
              onClick={handleCreate}
              disabled={creating || !newPath}
              className="cursor-pointer"
            >
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
