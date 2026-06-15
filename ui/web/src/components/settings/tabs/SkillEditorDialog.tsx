import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  FilePlus,
  FolderPlus,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import type { SkillFile } from "@/types/api";
import { skills } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const SKILL_MD = "SKILL.md"; // virtual root file mapped to the SKILL.md content

const SKILL_MD_TEMPLATE = `---
name: my-skill
description: What this skill does and when to use it.
---

# My Skill

## Instructions
Step-by-step guidance for the agent.
`;

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
const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

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

function parseFrontmatter(content: string): { name: string; description: string; ok: boolean } {
  const m = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { name: "", description: "", ok: false };
  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (/^\s/.test(line)) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    fields[k] = v;
  }
  return { name: fields.name ?? "", description: fields.description ?? "", ok: true };
}

function validateMetadata(name: string, description: string): string {
  if (!name) return "SKILL.md frontmatter is missing `name`.";
  if (name.length > 64) return "name must be at most 64 characters.";
  if (!NAME_RE.test(name)) return "name must be lowercase letters, digits and hyphens.";
  if (/anthropic|claude/.test(name.toLowerCase())) return "name must not contain 'anthropic' or 'claude'.";
  if (!description.trim()) return "SKILL.md frontmatter is missing `description`.";
  if (description.length > 1024) return "description must be at most 1024 characters.";
  return "";
}

// ---- Tree model derived from file paths + UI-only folders ----

interface TreeFolder {
  name: string;
  path: string;
  folders: TreeFolder[];
  files: { path: string; name: string }[];
}

function buildTree(filePaths: string[], extraFolders: string[]): TreeFolder {
  const root: TreeFolder = { name: "", path: "", folders: [], files: [] };
  const getFolder = (parts: string[]): TreeFolder => {
    let cur = root;
    let acc = "";
    for (const p of parts) {
      acc = acc ? acc + "/" + p : p;
      let f = cur.folders.find((x) => x.name === p);
      if (!f) {
        f = { name: p, path: acc, folders: [], files: [] };
        cur.folders.push(f);
      }
      cur = f;
    }
    return cur;
  };
  for (const fp of filePaths) {
    const parts = fp.split("/");
    const name = parts.pop() ?? fp;
    getFolder(parts).files.push({ path: fp, name });
  }
  for (const folderPath of extraFolders) {
    getFolder(folderPath.split("/").filter(Boolean));
  }
  const sortFolder = (f: TreeFolder) => {
    f.folders.sort((a, b) => a.name.localeCompare(b.name));
    f.files.sort((a, b) => a.name.localeCompare(b.name));
    f.folders.forEach(sortFolder);
  };
  sortFolder(root);
  return root;
}

export interface InitialBundle {
  content: string;
  files: SkillFile[];
}

interface Props {
  open: boolean;
  skillId: string | null; // null = create
  initial: InitialBundle | null; // pre-filled bundle (e.g. from import); create mode
  canUpdate: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function SkillEditorDialog({
  open,
  skillId,
  initial,
  canUpdate,
  onOpenChange,
  onSaved,
}: Props) {
  const [content, setContent] = useState(SKILL_MD_TEMPLATE);
  const [metadata, setMetadata] = useState("");
  const [files, setFiles] = useState<SkillFile[]>([]);
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string>(SKILL_MD);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  const editable = skillId === null || canUpdate;

  // Initialize state whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setSelected(SKILL_MD);
    setExtraFolders([]);
    setCollapsed({});
    setDirty(false);
    if (initial) {
      setContent(initial.content);
      setFiles(initial.files);
      setMetadata("");
      setLoading(false);
      return;
    }
    if (skillId) {
      setLoading(true);
      skills
        .get(skillId)
        .then((full) => {
          setContent(full.content);
          setFiles(full.files ?? []);
          setMetadata(full.metadata ?? "");
        })
        .catch(() => toast.error("Failed to load skill."))
        .finally(() => setLoading(false));
    } else {
      setContent(SKILL_MD_TEMPLATE);
      setFiles([]);
      setMetadata("");
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, skillId, initial]);

  const tree = useMemo(
    () => buildTree(files.map((f) => f.path), extraFolders),
    [files, extraFolders]
  );

  const fm = parseFrontmatter(content);
  const metaError = fm.ok
    ? validateMetadata(fm.name, fm.description)
    : "SKILL.md must start with YAML frontmatter (---).";

  const selectedContent =
    selected === SKILL_MD ? content : files.find((f) => f.path === selected)?.content ?? "";

  const setSelectedContent = (text: string) => {
    setDirty(true);
    if (selected === SKILL_MD) setContent(text);
    else setFiles((fs) => fs.map((f) => (f.path === selected ? { ...f, content: text } : f)));
  };

  const requestClose = (next: boolean) => {
    if (!next && dirty && !confirm("You have unsaved changes. Discard them?")) return;
    onOpenChange(next);
  };

  // Escape handling: the parent Settings dialog (base-ui) and this editor (radix)
  // attach separate document keydown listeners, so a plain Escape would close
  // BOTH. Intercept it in the capture phase, stop it from propagating, and close
  // only this dialog (with the unsaved-changes guard).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (dirty && !confirm("You have unsaved changes. Discard them?")) return;
      onOpenChange(false);
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open, dirty, onOpenChange]);

  const toggleFolder = (path: string) => setCollapsed((c) => ({ ...c, [path]: !c[path] }));

  const handleNewFile = (parent: string) => {
    const where = parent || "root";
    const input = window.prompt(`New file in ${where} (e.g. policy.md):`, "new.md");
    if (!input) return;
    const rel = input.trim().replace(/^\/+|\/+$/g, "");
    if (!rel) return;
    const path = parent ? `${parent}/${rel}` : rel;
    if (files.some((f) => f.path === path)) {
      toast.error("A file with that path already exists.");
      return;
    }
    if (!isReferenceFile(path)) {
      toast.warning(
        "Only reference files are kept (.md .markdown .txt .json .yaml .yml .csv .html). This file will be skipped on save."
      );
    }
    setFiles((fs) => [...fs, { path, content: "" }]);
    if (parent) setCollapsed((c) => ({ ...c, [parent]: false }));
    setSelected(path);
    setDirty(true);
  };

  const handleNewFolder = (parent: string) => {
    const where = parent || "root";
    const input = window.prompt(`New folder in ${where}:`, "references");
    if (!input) return;
    const rel = input.trim().replace(/^\/+|\/+$/g, "");
    if (!rel) return;
    const folder = parent ? `${parent}/${rel}` : rel;
    setExtraFolders((fs) => (fs.includes(folder) ? fs : [...fs, folder]));
    setCollapsed((c) => ({ ...c, [folder]: false, ...(parent ? { [parent]: false } : {}) }));
  };

  const deleteFile = (path: string) => {
    if (!confirm(`Delete file "${path}"?`)) return;
    setFiles((fs) => fs.filter((f) => f.path !== path));
    if (selected === path) setSelected(SKILL_MD);
    setDirty(true);
  };

  const deleteFolder = (path: string) => {
    if (!confirm(`Delete folder "${path}" and all files inside?`)) return;
    const prefix = path + "/";
    setFiles((fs) => fs.filter((f) => !f.path.startsWith(prefix)));
    setExtraFolders((fs) => fs.filter((f) => f !== path && !f.startsWith(prefix)));
    setDirty(true);
  };

  const handleSave = async () => {
    if (metaError) {
      toast.error(metaError);
      return;
    }
    setSaving(true);
    try {
      const payload = { content, metadata, files };
      const resp = skillId
        ? await skills.update(skillId, payload)
        : await skills.create(payload);
      toast.success(skillId ? "Skill saved" : "Skill created");
      if (resp.skipped_files && resp.skipped_files.length > 0) {
        toast.warning(`Skipped ${resp.skipped_files.length} file(s): ${resp.skipped_files.join(", ")}`);
      }
      setDirty(false);
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const renderFolder = (folder: TreeFolder, depth: number) => {
    const isCollapsed = collapsed[folder.path];
    return (
      <div key={folder.path}>
        <div
          className="group flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-muted/40"
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
        >
          <button
            onClick={() => toggleFolder(folder.path)}
            className="flex flex-1 items-center gap-1.5 text-left text-xs font-medium"
          >
            {isCollapsed ? (
              <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
            ) : (
              <ChevronDown className="size-3 shrink-0 text-muted-foreground/60" />
            )}
            <Folder className="size-3.5 shrink-0 text-chart-3" />
            <span className="truncate font-mono">{folder.name}</span>
          </button>
          {editable && (
            <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
              <button
                onClick={() => handleNewFile(folder.path)}
                className="cursor-pointer p-0.5 text-muted-foreground/40 hover:text-foreground"
                title="New file in this folder"
              >
                <FilePlus className="size-3" />
              </button>
              <button
                onClick={() => handleNewFolder(folder.path)}
                className="cursor-pointer p-0.5 text-muted-foreground/40 hover:text-foreground"
                title="New folder in this folder"
              >
                <FolderPlus className="size-3" />
              </button>
              <button
                onClick={() => deleteFolder(folder.path)}
                className="cursor-pointer p-0.5 text-muted-foreground/40 hover:text-destructive"
                title="Delete folder"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <div>
            {folder.folders.map((sub) => renderFolder(sub, depth + 1))}
            {folder.files.map((file) => renderFile(file, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderFile = (file: { path: string; name: string }, depth: number) => {
    const active = selected === file.path;
    const allowed = isReferenceFile(file.path);
    return (
      <div
        key={file.path}
        className={cn(
          "group flex items-center gap-1 rounded-md px-1.5 py-1",
          active ? "bg-muted" : "hover:bg-muted/40"
        )}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        <button
          onClick={() => setSelected(file.path)}
          className="flex flex-1 items-center gap-1.5 text-left text-xs"
        >
          <span className="size-3 shrink-0" />
          {allowed ? (
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
          )}
          <span className={cn("truncate font-mono", active && "font-semibold")}>{file.name}</span>
        </button>
        {editable && (
          <button
            onClick={() => deleteFile(file.path)}
            className="cursor-pointer p-0.5 text-muted-foreground/40 opacity-0 transition hover:text-destructive group-hover:opacity-100"
            title="Delete file"
          >
            <Trash2 className="size-3" />
          </button>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent className="flex h-[85vh] flex-col border-border/50 bg-sidebar sm:max-w-3xl lg:max-w-[80vw]">
        <DialogHeader>
          <DialogTitle className="font-heading">{skillId ? "Edit Skill" : "New Skill"}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Loading bundle...
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
            {/* Tree */}
            <div className="flex w-full shrink-0 flex-col rounded-lg border border-border/50 bg-card lg:w-64">
              <div className="flex items-center justify-between border-b border-border/50 px-2 py-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  Files
                </span>
                {editable && (
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => handleNewFile("")}
                      className="cursor-pointer rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                      title="New file at root"
                    >
                      <FilePlus className="size-3.5" />
                    </button>
                    <button
                      onClick={() => handleNewFolder("")}
                      className="cursor-pointer rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                      title="New folder at root"
                    >
                      <FolderPlus className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="max-h-48 overflow-auto p-1 lg:max-h-none lg:min-h-0 lg:flex-1">
                {/* SKILL.md root node */}
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-1.5 py-1",
                    selected === SKILL_MD ? "bg-muted" : "hover:bg-muted/40"
                  )}
                  style={{ paddingLeft: "6px" }}
                >
                  <button
                    onClick={() => setSelected(SKILL_MD)}
                    className="flex flex-1 items-center gap-1.5 text-left text-xs"
                  >
                    <span className="size-3 shrink-0" />
                    <FileText className="size-3.5 shrink-0 text-chart-4" />
                    <span className={cn("font-mono", selected === SKILL_MD && "font-semibold")}>
                      SKILL.md
                    </span>
                  </button>
                </div>
                {tree.folders.map((f) => renderFolder(f, 0))}
                {tree.files.map((f) => renderFile(f, 0))}
              </div>
            </div>

            {/* Editor */}
            <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden">
              {/* Metadata (from SKILL.md frontmatter) — always shown, fixed */}
              <div className="rounded-lg border border-border/50 bg-card p-2.5">
                {metaError ? (
                  <p className="text-xs text-destructive">{metaError}</p>
                ) : (
                  <div className="space-y-0.5 text-xs">
                    <div>
                      <span className="text-muted-foreground">name:</span>{" "}
                      <span className="font-mono">{fm.name}</span>
                    </div>
                    <div className="truncate">
                      <span className="text-muted-foreground">description:</span> {fm.description}
                    </div>
                  </div>
                )}
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {selected === SKILL_MD ? "SKILL.md" : selected}
              </span>
              <Textarea
                value={selectedContent}
                onChange={(e) => setSelectedContent(e.target.value)}
                readOnly={!editable}
                className="min-h-0 flex-1 resize-none bg-card font-mono text-xs"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => requestClose(false)}>
            Cancel
          </Button>
          {editable && (
            <Button onClick={handleSave} disabled={saving || !!metaError} className="cursor-pointer">
              {saving ? "Saving..." : skillId ? "Save" : "Create"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
