import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Zap, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { Skill } from "@/types/api";
import { skills } from "@/lib/api";
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

interface SkillForm {
  name: string;
  description: string;
  content: string;
  metadata: string;
}

const emptyForm: SkillForm = { name: "", description: "", content: "", metadata: "" };

export default function SkillsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission("tab:skills:create");
  const canUpdate = hasPermission("tab:skills:update");
  const canDelete = hasPermission("tab:skills:delete");
  const [data, setData] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SkillForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    skills
      .list()
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (skill: Skill, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(skill.id);
    setForm({
      name: skill.name,
      description: skill.description,
      content: skill.content,
      metadata: skill.metadata,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await skills.update(editingId, form);
        toast.success("Skill updated");
      } else {
        await skills.create(form);
        toast.success("Skill created");
      }
      setDialogOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this skill?")) return;
    await skills.delete(id);
    toast.success("Skill deleted");
    setExpandedSkills((prev) => { const next = new Set(prev); next.delete(id); return next; });
    load();
  };

  const parseMetadata = (meta: string): Record<string, unknown> | null => {
    if (!meta) return null;
    try { return JSON.parse(meta); } catch { return null; }
  };

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold sm:text-2xl">Skills</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Define agent behavior with reusable skill templates
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} className="cursor-pointer gap-2 self-start rounded-lg sm:self-auto">
            <Plus className="size-4" />
            New Skill
          </Button>
        )}
      </div>

      {/* Skills list */}
      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Loading skills...
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 text-sm text-muted-foreground">
          <Zap className="size-8 text-muted-foreground/30" />
          No skills yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((s) => {
            const isExpanded = expandedSkills.has(s.id);
            const meta = isExpanded ? parseMetadata(s.metadata) : null;

            return (
              <div
                key={s.id}
                className="rounded-xl border border-border/50 bg-card overflow-hidden"
              >
                {/* Collapsed header */}
                <button
                  onClick={() => toggleExpand(s.id)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/30"
                >
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground/60 transition-transform duration-200",
                      isExpanded && "rotate-180"
                    )}
                  />
                  <div className="flex size-7 items-center justify-center rounded-md bg-chart-4/10">
                    <Zap className="size-3.5 text-chart-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{s.name}</span>
                    <span className="ml-3 hidden text-sm text-muted-foreground sm:inline">{s.description}</span>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {new Date(s.updated_at).toLocaleDateString()}
                    </span>
                    {(canUpdate || canDelete) && (
                      <div className="flex gap-1 ml-2">
                        {canUpdate && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="cursor-pointer text-muted-foreground/40 hover:text-foreground"
                            onClick={(e) => openEdit(s, e)}
                            title="Edit skill"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="cursor-pointer text-muted-foreground/40 hover:text-destructive"
                            onClick={(e) => handleDelete(s.id, e)}
                            title="Delete skill"
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
                    {/* Content */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                        Content
                      </p>
                      <pre className="max-h-80 overflow-auto rounded-lg border border-border/50 bg-muted/20 p-3 text-sm font-mono leading-relaxed whitespace-pre-wrap">
                        {s.content || "(empty)"}
                      </pre>
                    </div>

                    {/* Metadata */}
                    {meta && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                          Metadata
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(meta).map(([key, value]) => (
                            <Badge key={key} variant="outline" className="border-border/50 text-xs font-mono">
                              {key}: {JSON.stringify(value)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timestamps */}
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      <span>Created: {new Date(s.created_at).toLocaleString()}</span>
                      <span>Updated: {new Date(s.updated_at).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col border-border/50 bg-sidebar sm:max-w-2xl lg:max-w-[75vw]">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editingId ? "Edit Skill" : "New Skill"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. cs_resolution"
                className="bg-card"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Description
              </label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Short description of the skill"
                className="bg-card"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Content</label>
              <Textarea
                value={form.content}
                onChange={(e) =>
                  setForm({ ...form, content: e.target.value })
                }
                placeholder="Skill content (markdown)"
                rows={12}
                className="bg-card font-mono text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Metadata (JSON)
              </label>
              <Input
                value={form.metadata}
                onChange={(e) =>
                  setForm({ ...form, metadata: e.target.value })
                }
                placeholder='{"tags": ["cs"]}'
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
              onClick={handleSave}
              disabled={saving || !form.name}
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
