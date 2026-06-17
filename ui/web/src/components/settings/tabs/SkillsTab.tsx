import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Zap, Upload, Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import type { Skill, SkillFile } from "@/types/api";
import { skills } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import SkillEditorDialog, { type InitialBundle } from "./SkillEditorDialog";
import AiCreateSkillDialog from "./AiCreateSkillDialog";

const REFERENCE_EXTS = [
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".html",
];

function baseName(p: string): string {
  return p.split("/").pop() ?? p;
}

function isReferenceFile(p: string): boolean {
  const clean = p.trim();
  if (!clean) return false;
  if (baseName(clean).toLowerCase() === "skill.md") return false;
  if (clean.split("/").some((s) => s.toLowerCase() === "scripts")) return false;
  const lower = baseName(clean).toLowerCase();
  return REFERENCE_EXTS.some((e) => lower.endsWith(e));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function commonTopFolder(names: string[]): string {
  if (names.length === 0) return "";
  const first = names[0].split("/")[0];
  if (!first) return "";
  const prefix = first + "/";
  return names.every((n) => n.startsWith(prefix)) ? prefix : "";
}

export default function SkillsTab() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canUpdate = hasPermission("tab:skills:update");
  const canDelete = hasPermission("tab:skills:delete");
  const [data, setData] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [initialBundle, setInitialBundle] = useState<InitialBundle | null>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);

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

  const openCreate = () => {
    setEditId(null);
    setInitialBundle(null);
    setDialogOpen(true);
  };

  const openAiCreate = () => {
    setAiDialogOpen(true);
  };

  const openEdit = (skill: Skill, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditId(skill.id);
    setInitialBundle(null);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this skill?")) return;
    await skills.delete(id);
    toast.success("Skill deleted");
    load();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;

    let skillMd = "";
    const refs: SkillFile[] = [];
    const skipped: string[] = [];

    const ingest = (path: string, body: string) => {
      if (baseName(path).toLowerCase() === "skill.md") skillMd = body;
      else if (isReferenceFile(path)) refs.push({ path, content: body });
      else skipped.push(path);
    };

    try {
      for (const file of picked) {
        if (file.name.toLowerCase().endsWith(".zip")) {
          const zip = await JSZip.loadAsync(file);
          const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
          const prefix = commonTopFolder(names);
          for (const name of names) {
            if (baseName(name).startsWith(".") || name.includes("__MACOSX")) continue;
            const rel = prefix ? name.slice(prefix.length) : name;
            if (!rel) continue;
            ingest(rel, await zip.files[name].async("string"));
          }
        } else {
          ingest(file.name, await file.text());
        }
      }
    } catch {
      toast.error("Failed to read the bundle.");
      return;
    }

    if (!skillMd) {
      toast.error("Bundle must contain a SKILL.md file.");
      return;
    }
    if (skipped.length > 0) {
      toast.info(`Skipping ${skipped.length} non-reference file(s): ${skipped.join(", ")}`);
    }

    setEditId(null);
    setInitialBundle({ content: skillMd, files: refs });
    setDialogOpen(true);
  };

  const handleExport = async (skill: Skill, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const full = await skills.get(skill.id);
      const zip = new JSZip();
      zip.file("SKILL.md", full.content);
      for (const f of full.files ?? []) zip.file(f.path, f.content);
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `${full.name || "skill"}.zip`);
    } catch {
      toast.error("Failed to export skill.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold sm:text-2xl">Skills</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            SKILL.md bundles — click a skill to edit its files
          </p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".zip,.md,.markdown,.txt,.json,.yaml,.yml,.csv,.html"
              multiple
              className="hidden"
              onChange={handleImport}
            />
            <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm font-medium hover:bg-muted/30">
              <Upload className="size-4" />
              Import
            </span>
          </label>
          <Button
            onClick={openAiCreate}
            className="cursor-pointer gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md transition-all duration-200"
          >
            <Sparkles className="size-4" />
            Create with AI
          </Button>
          <Button onClick={openCreate} className="cursor-pointer gap-2 rounded-lg" variant="outline">
            <Plus className="size-4" />
            New Skill
          </Button>
        </div>
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
          {data.map((s) => (
            <button
              key={s.id}
              onClick={(e) => (canUpdate ? openEdit(s, e) : undefined)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3 text-left transition-colors duration-150",
                canUpdate && "cursor-pointer hover:bg-muted/30"
              )}
            >
              <div className="flex size-7 items-center justify-center rounded-md bg-chart-4/10">
                <Zap className="size-3.5 text-chart-4" />
              </div>
              <div className="flex min-w-0 flex-1 items-baseline gap-3">
                <span className="shrink-0 font-medium">{s.name}</span>
                <span
                  className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground sm:block"
                  title={s.description}
                >
                  {s.description}
                </span>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {new Date(s.updated_at).toLocaleDateString()}
                </span>
                <div className="ml-2 flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="cursor-pointer text-muted-foreground/40 hover:text-foreground"
                    onClick={(e) => handleExport(s, e)}
                    title="Export skill (.zip)"
                  >
                    <Download className="size-3.5" />
                  </Button>
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
              </div>
            </button>
          ))}
        </div>
      )}

      <SkillEditorDialog
        open={dialogOpen}
        skillId={editId}
        initial={initialBundle}
        canUpdate={canUpdate}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />

      <AiCreateSkillDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        onSaved={load}
      />
    </div>
  );
}
