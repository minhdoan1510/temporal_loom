import { useState, useEffect, useRef } from "react";
import { useDocumentsStore } from "@/stores/documents";
import type { DocumentSection, ExternalLink } from "@/stores/documents";
import { useWorkspacesStore } from "@/stores/workspaces";
import Prose from "@/components/markdown/Prose";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  Link as LinkIcon,
  Pin,
  Plus,
  Search,
  Trash2,
  Edit,
  BookOpen,
  ArrowUpRight,
  FolderPlus,
  X,
  Save,
  ChevronDown,
  ChevronRight,
  Bold,
  Italic,
  Code,
  Link2,
  Heading,
  List,
  Table,
  ExternalLink as ExtIcon
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function DocumentsPage() {
  const {
    documents,
    sections,
    links,
    loading,
    loadFromDB,
    createDocument,
    updateDocument,
    deleteDocument,
    createSection,
    updateSection,
    deleteSection,
    createLink,
    updateLink,
    deleteLink,
  } = useDocumentsStore();

  const { activeWorkspaceId, workspaces } = useWorkspacesStore();
  const currentWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  // Load from db on mount
  useEffect(() => {
    loadFromDB();
  }, [loadFromDB]);

  // UI States
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("documentsSidebarWidth");
    return saved ? parseInt(saved, 10) : 256;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(100, Math.min(480, startWidth + (moveEvent.clientX - startX)));
      setSidebarWidth(newWidth);
      localStorage.setItem("documentsSidebarWidth", newWidth.toString());
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  useEffect(() => {
    if (isDragging) {
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    } else {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging]);

  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Reset selected document when switching workspaces
  useEffect(() => {
    setActiveDocId(null);
    setIsEditing(false);
  }, [activeWorkspaceId]);
  
  // Collapsible sections state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Document Edit form states
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSectionId, setEditSectionId] = useState<string | null>(null);

  // Dialog States
  const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [editSectionTarget, setEditSectionTarget] = useState<DocumentSection | null>(null);

  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkDesc, setLinkDesc] = useState("");
  const [linkSectionId, setLinkSectionId] = useState<string | null>(null);
  const [editLinkTarget, setEditLinkTarget] = useState<ExternalLink | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Filter items based on active workspace
  const workspaceDocs = documents.filter((d) => d.workspaceId === activeWorkspaceId);
  const workspaceSecs = sections.filter((s) => s.workspaceId === activeWorkspaceId);
  const workspaceLinks = links.filter((l) => l.workspaceId === activeWorkspaceId);

  // Selected document helper
  const selectedDoc = workspaceDocs.find((d) => d.id === activeDocId);

  // Trigger load of edit states when doc is selected
  useEffect(() => {
    if (selectedDoc) {
      setEditTitle(selectedDoc.title);
      setEditContent(selectedDoc.content);
      setEditSectionId(selectedDoc.sectionId);
    } else {
      setIsEditing(false);
    }
  }, [activeDocId, selectedDoc]);

  // Toggle Section Collapse
  const toggleSection = (secId: string) => {
    setCollapsedSections((prev) => ({ ...prev, [secId]: !prev[secId] }));
  };

  // Section CRUD handlers
  const handleCreateSection = async () => {
    const name = newSectionName.trim();
    if (!name) return;
    try {
      if (editSectionTarget) {
        await updateSection(editSectionTarget.id, name);
        toast.success("Section renamed");
      } else {
        await createSection(activeWorkspaceId, name);
        toast.success("Section created");
      }
      setNewSectionName("");
      setEditSectionTarget(null);
      setIsSectionDialogOpen(false);
    } catch (e) {
      toast.error("Failed to save section");
    }
  };

  const handleDeleteSection = async (secId: string, name: string) => {
    if (!confirm(`Delete section "${name}"? Documents inside will be moved to Uncategorized.`)) return;
    try {
      await deleteSection(secId);
      toast.success("Section deleted");
    } catch (e) {
      toast.error("Failed to delete section");
    }
  };

  // Link CRUD handlers
  const handleOpenAddLink = () => {
    setEditLinkTarget(null);
    setLinkTitle("");
    setLinkUrl("");
    setLinkDesc("");
    setLinkSectionId(null);
    setIsLinkDialogOpen(true);
  };

  const handleOpenEditLink = (lnk: ExternalLink) => {
    setEditLinkTarget(lnk);
    setLinkTitle(lnk.title);
    setLinkUrl(lnk.url);
    setLinkDesc(lnk.description || "");
    setLinkSectionId(lnk.sectionId);
    setIsLinkDialogOpen(true);
  };

  const handleSaveLink = async () => {
    const title = linkTitle.trim();
    const url = linkUrl.trim();
    const desc = linkDesc.trim() || null;
    if (!title || !url) {
      toast.error("Title and URL are required");
      return;
    }
    
    // Add https:// if protocol missing
    let formattedUrl = url;
    if (!/^https?:\/\//i.test(url)) {
      formattedUrl = `https://${url}`;
    }

    try {
      if (editLinkTarget) {
        await updateLink(editLinkTarget.id, {
          title,
          url: formattedUrl,
          description: desc,
          sectionId: linkSectionId,
        });
        toast.success("Link updated");
      } else {
        await createLink(activeWorkspaceId, title, formattedUrl, desc, linkSectionId);
        toast.success("Link added");
      }
      setIsLinkDialogOpen(false);
      setLinkTitle("");
      setLinkUrl("");
      setLinkDesc("");
      setEditLinkTarget(null);
    } catch (e) {
      toast.error("Failed to save link");
    }
  };

  const handleDeleteLink = async (lnkId: string) => {
    if (!confirm("Remove this link?")) return;
    try {
      await deleteLink(lnkId);
      toast.success("Link removed");
    } catch (e) {
      toast.error("Failed to delete link");
    }
  };

  const handleTogglePinLink = async (lnk: ExternalLink) => {
    try {
      await updateLink(lnk.id, { isPinned: !lnk.isPinned });
      toast.success(lnk.isPinned ? "Link unpinned" : "Link pinned");
    } catch (e) {
      toast.error("Error updating pin state");
    }
  };

  // Document CRUD handlers
  const handleCreateNewDoc = async () => {
    try {
      const newId = await createDocument(
        activeWorkspaceId,
        "Untitled Document",
        "Start writing your content here in markdown...\n\nUse headings, lists, tables, and code blocks.",
        null
      );
      setActiveDocId(newId);
      setIsEditing(true);
      toast.success("Document created");
    } catch (e) {
      toast.error("Failed to create document");
    }
  };

  const handleSaveDoc = async () => {
    const title = editTitle.trim() || "Untitled Document";
    if (!activeDocId) return;
    try {
      await updateDocument(activeDocId, {
        title,
        content: editContent,
        sectionId: editSectionId,
      });
      setIsEditing(false);
      toast.success("Document saved");
    } catch (e) {
      toast.error("Failed to save document");
    }
  };

  const handleDeleteDoc = async () => {
    if (!activeDocId || !selectedDoc) return;
    if (!confirm(`Delete document "${selectedDoc.title}"?`)) return;
    try {
      await deleteDocument(activeDocId);
      setActiveDocId(null);
      toast.success("Document deleted");
    } catch (e) {
      toast.error("Failed to delete document");
    }
  };

  const handleTogglePinDoc = async () => {
    if (!activeDocId || !selectedDoc) return;
    try {
      await updateDocument(activeDocId, { isPinned: !selectedDoc.isPinned });
      toast.success(selectedDoc.isPinned ? "Document unpinned" : "Document pinned");
    } catch (e) {
      toast.error("Error updating pin state");
    }
  };

  // Helper Markdown Editor insert
  const insertMarkdown = (syntax: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const selected = text.substring(start, end);
    
    let replacement = syntax;
    if (selected) {
      if (syntax.startsWith("**") && syntax.endsWith("**")) {
        replacement = `**${selected}**`;
      } else if (syntax.startsWith("*") && syntax.endsWith("*")) {
        replacement = `*${selected}*`;
      } else if (syntax.startsWith("`") && syntax.endsWith("`")) {
        replacement = `\`${selected}\``;
      } else if (syntax.startsWith("[")) {
        replacement = `[${selected}](url)`;
      } else {
        replacement = syntax + selected;
      }
    }
    
    const newValue = before + replacement + after;
    setEditContent(newValue);
    
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + replacement.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Search filter
  const filteredDocs = workspaceDocs.filter((d) => {
    const matchesSearch =
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const filteredLinks = workspaceLinks.filter((l) => {
    const matchesSearch =
      l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.description && l.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      l.url.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const pinnedDocs = workspaceDocs.filter((d) => d.isPinned);
  const pinnedLinks = workspaceLinks.filter((l) => l.isPinned);

  // Grouped documents and links for Overview display
  const getSectionItems = (secId: string | null) => {
    const docs = workspaceDocs.filter((d) => d.sectionId === secId);
    const lnks = workspaceLinks.filter((l) => l.sectionId === secId);
    return { docs, lnks };
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-neutral-50 h-full">
        <div className="flex flex-col items-center gap-2">
          <ChevronRight className="size-6 animate-spin text-primary" />
          <p className="text-xs text-neutral-400">Loading documents database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden bg-neutral-50 h-full">
      {/* ─── Left Sidebar Pane ─── */}
      <aside
        style={{ width: isMobile ? undefined : `${sidebarWidth}px` }}
        className={cn(
          "border-r border-neutral-200/60 bg-white flex flex-col shrink-0 relative",
          isMobile ? "w-64" : ""
        )}
      >
        {/* Header Actions */}
        <div className="p-4 border-b border-neutral-100 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Documents</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 cursor-pointer hover:bg-neutral-100 rounded-md">
                  <Plus className="size-4 text-neutral-600" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 bg-white border-border/40">
                <DropdownMenuItem onClick={handleCreateNewDoc} className="cursor-pointer flex items-center gap-2 py-2 text-xs">
                  <FileText className="size-3.5 text-neutral-500" />
                  <span>New Document</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenAddLink} className="cursor-pointer flex items-center gap-2 py-2 text-xs">
                  <LinkIcon className="size-3.5 text-neutral-500" />
                  <span>Add Web Link</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-neutral-100" />
                <DropdownMenuItem
                  onClick={() => {
                    setEditSectionTarget(null);
                    setNewSectionName("");
                    setIsSectionDialogOpen(true);
                  }}
                  className="cursor-pointer flex items-center gap-2 py-2 text-xs"
                >
                  <FolderPlus className="size-3.5 text-neutral-500" />
                  <span>Create Section</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Navigation items list */}
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1.5 min-h-0">
          {/* Overview Tab Link */}
          <button
            onClick={() => {
              setActiveDocId(null);
              setIsEditing(false);
            }}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg text-left transition",
              activeDocId === null
                ? "bg-neutral-100 text-neutral-900 font-bold"
                : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
            )}
          >
            <BookOpen className="size-3.5" />
            <span>Overview & Hub</span>
          </button>

          <div className="pt-2 border-t border-neutral-100">
            <span className="px-3 text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-2">Sections</span>
            
            {/* COLLAPSIBLE SECTIONS LIST */}
            {workspaceSecs.map((sec) => {
              const isCollapsed = !!collapsedSections[sec.id];
              const secDocs = workspaceDocs.filter((d) => d.sectionId === sec.id);
              const secLinks = workspaceLinks.filter((l) => l.sectionId === sec.id);
              
              return (
                <div key={sec.id} className="space-y-0.5 mb-2">
                  <div className="group flex items-center justify-between px-1.5 py-1 rounded-md hover:bg-neutral-50 transition">
                    <button
                      onClick={() => toggleSection(sec.id)}
                      className="flex items-center gap-1 text-xs font-semibold text-neutral-700 text-left truncate flex-1"
                    >
                      {isCollapsed ? <ChevronRight className="size-3 text-neutral-400 shrink-0" /> : <ChevronDown className="size-3 text-neutral-400 shrink-0" />}
                      <span className="truncate">{sec.name}</span>
                      <span className="text-[9px] text-neutral-400 bg-neutral-100 px-1 py-0.2 rounded-full shrink-0">
                        {secDocs.length + secLinks.length}
                      </span>
                    </button>
                    
                    {/* Hover controls */}
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition shrink-0">
                      <button
                        onClick={() => {
                          setEditSectionTarget(sec);
                          setNewSectionName(sec.name);
                          setIsSectionDialogOpen(true);
                        }}
                        className="p-1 hover:bg-neutral-200/50 rounded-md text-neutral-400 hover:text-neutral-700 transition cursor-pointer"
                        title="Rename Section"
                      >
                        <Edit className="size-2.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSection(sec.id, sec.name)}
                        className="p-1 hover:bg-red-50 rounded-md text-neutral-400 hover:text-red-600 transition cursor-pointer"
                        title="Delete Section"
                      >
                        <Trash2 className="size-2.5" />
                      </button>
                    </div>
                  </div>

                  {/* Section child items */}
                  {!isCollapsed && (
                    <div className="pl-3.5 space-y-0.5 border-l border-neutral-100 ml-3">
                      {secDocs.map((doc) => (
                        <button
                          key={doc.id}
                          onClick={() => {
                            setActiveDocId(doc.id);
                            setIsEditing(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-2 px-2.5 py-1 text-xs rounded-md text-left transition truncate",
                            activeDocId === doc.id
                              ? "bg-neutral-100 text-neutral-900 font-bold"
                              : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                          )}
                        >
                          <FileText className="size-3 shrink-0 opacity-70" />
                          <span className="truncate">{doc.title}</span>
                          {doc.isPinned && <Pin className="size-2.5 text-orange-500 shrink-0 rotate-45 ml-auto" />}
                        </button>
                      ))}
                      {secLinks.map((lnk) => (
                        <div
                          key={lnk.id}
                          className="group/lnk w-full flex items-center justify-between px-2.5 py-1 text-xs text-neutral-500 rounded-md hover:bg-neutral-50 transition"
                        >
                          <a
                            href={lnk.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 truncate text-neutral-500 hover:text-primary hover:underline flex-1"
                          >
                            <LinkIcon className="size-3 shrink-0 opacity-70" />
                            <span className="truncate">{lnk.title}</span>
                          </a>
                          <div className="opacity-0 group-hover/lnk:opacity-100 flex items-center gap-0.5 shrink-0 ml-1">
                            <button onClick={() => handleOpenEditLink(lnk)} className="text-neutral-400 hover:text-neutral-700">
                              <Edit className="size-2.5" />
                            </button>
                            <button onClick={() => handleDeleteLink(lnk.id)} className="text-neutral-400 hover:text-red-600">
                              <Trash2 className="size-2.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {secDocs.length === 0 && secLinks.length === 0 && (
                        <span className="text-[10px] text-neutral-400 italic block py-0.5 px-2.5">Empty section</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Uncategorized (General) items */}
            {(() => {
              const uncDocs = workspaceDocs.filter((d) => d.sectionId === null);
              const uncLinks = workspaceLinks.filter((l) => l.sectionId === null);
              if (uncDocs.length === 0 && uncLinks.length === 0) return null;
              return (
                <div className="space-y-0.5 mt-3">
                  <p className="px-1.5 py-1 text-xs font-semibold text-neutral-400">Uncategorized</p>
                  <div className="pl-3.5 space-y-0.5 border-l border-neutral-100 ml-3">
                    {uncDocs.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => {
                          setActiveDocId(doc.id);
                          setIsEditing(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-2.5 py-1 text-xs rounded-md text-left transition truncate",
                          activeDocId === doc.id
                            ? "bg-neutral-100 text-neutral-900 font-bold"
                            : "text-neutral-500 hover:bg-neutral-50/50 hover:text-neutral-900"
                        )}
                      >
                        <FileText className="size-3 shrink-0 opacity-70" />
                        <span className="truncate">{doc.title}</span>
                        {doc.isPinned && <Pin className="size-2.5 text-orange-500 shrink-0 rotate-45 ml-auto" />}
                      </button>
                    ))}
                    {uncLinks.map((lnk) => (
                      <div
                        key={lnk.id}
                        className="group/lnk w-full flex items-center justify-between px-2.5 py-1 text-xs text-neutral-500 rounded-md hover:bg-neutral-50 transition"
                      >
                        <a
                          href={lnk.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 truncate text-neutral-500 hover:text-primary hover:underline flex-1"
                        >
                          <LinkIcon className="size-3 shrink-0 opacity-70" />
                          <span className="truncate">{lnk.title}</span>
                        </a>
                        <div className="opacity-0 group-hover/lnk:opacity-100 flex items-center gap-0.5 shrink-0 ml-1">
                          <button onClick={() => handleOpenEditLink(lnk)} className="text-neutral-400 hover:text-neutral-700">
                            <Edit className="size-2.5" />
                          </button>
                          <button onClick={() => handleDeleteLink(lnk.id)} className="text-neutral-400 hover:text-red-600">
                            <Trash2 className="size-2.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        {/* Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-neutral-300/50 active:bg-neutral-400/50 dark:hover:bg-neutral-700/50 dark:active:bg-neutral-600/50 transition-colors z-50 hidden md:block"
        />
      </aside>

      {/* ─── Right Details/Workspace Hub Pane ─── */}
      <main className="flex-1 overflow-y-auto p-6 flex flex-col min-w-0">
        {activeDocId === null ? (
          /* ─── OVERVIEW PANEL ─── */
          <div className="space-y-6 max-w-4xl w-full mx-auto">
            {/* Header */}
            <div>
              <span className="text-xs font-bold text-primary tracking-wider uppercase">{currentWorkspace?.name || "Workspace"} Home</span>
              <h2 className="text-2xl font-bold text-neutral-800 mt-0.5">Team Documents & Links</h2>
              <p className="text-xs text-neutral-400">Collaborative playbooks, checklists, and references for operations</p>
            </div>

            {/* Search and Quick Actions */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  placeholder="Search playbooks, response templates, links..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-white border-neutral-200/80 focus:border-neutral-300"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button onClick={handleCreateNewDoc} variant="outline" className="cursor-pointer bg-white border-neutral-200/80 hover:bg-neutral-50 gap-1.5 text-xs py-2 h-9">
                  <Plus className="size-3.5" />
                  New Doc
                </Button>
                <Button onClick={handleOpenAddLink} variant="outline" className="cursor-pointer bg-white border-neutral-200/80 hover:bg-neutral-50 gap-1.5 text-xs py-2 h-9">
                  <LinkIcon className="size-3.5" />
                  Add Link
                </Button>
              </div>
            </div>

            {/* SEARCH RESULTS VIEW */}
            {searchQuery ? (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-neutral-500">Search Results ({filteredDocs.length + filteredLinks.length})</h3>
                
                {/* Documents Results */}
                {filteredDocs.length > 0 && (
                  <div className="space-y-2.5">
                    <span className="text-xs font-semibold text-neutral-400">Documents</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredDocs.map((doc) => (
                        <div
                          key={doc.id}
                          onClick={() => setActiveDocId(doc.id)}
                          className="bg-white border border-neutral-100 hover:border-neutral-200 rounded-xl p-4 shadow-xs hover:shadow-sm transition cursor-pointer flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <FileText className="size-4 text-neutral-400" />
                              <h4 className="font-bold text-sm text-neutral-800 truncate">{doc.title}</h4>
                            </div>
                            <p className="text-xs text-neutral-400 line-clamp-2 mt-2 leading-relaxed">
                              {doc.content.replace(/[#*`>]/g, "")}
                            </p>
                          </div>
                          <span className="text-[10px] text-neutral-400 font-medium mt-3 block">
                            Updated {doc.updatedAt}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Links Results */}
                {filteredLinks.length > 0 && (
                  <div className="space-y-2.5 pt-2">
                    <span className="text-xs font-semibold text-neutral-400">Links</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredLinks.map((lnk) => (
                        <div
                          key={lnk.id}
                          className="bg-white border border-neutral-100 rounded-xl p-4 shadow-xs flex flex-col justify-between relative group"
                        >
                          <div>
                            <div className="flex items-start justify-between">
                              <a
                                href={lnk.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 hover:text-primary transition group-hover:underline max-w-[85%]"
                              >
                                <LinkIcon className="size-4 text-neutral-400 shrink-0" />
                                <h4 className="font-bold text-sm text-neutral-800 truncate">{lnk.title}</h4>
                                <ArrowUpRight className="size-3 text-neutral-400 inline" />
                              </a>
                              
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0 ml-1">
                                <button onClick={() => handleOpenEditLink(lnk)} className="p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-neutral-700">
                                  <Edit className="size-3" />
                                </button>
                                <button onClick={() => handleDeleteLink(lnk.id)} className="p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-red-600">
                                  <Trash2 className="size-3" />
                                </button>
                              </div>
                            </div>
                            {lnk.description && (
                              <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed line-clamp-2">{lnk.description}</p>
                            )}
                          </div>
                          <a
                            href={lnk.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-neutral-400 font-mono mt-3 truncate hover:underline hover:text-primary block"
                          >
                            {lnk.url}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filteredDocs.length === 0 && filteredLinks.length === 0 && (
                  <p className="text-xs text-neutral-400 italic text-center py-12">No documents or links found matching your query.</p>
                )}
              </div>
            ) : (
              /* ─── HUB DEFAULT VIEW (PINNED & SECTION GRID) ─── */
              <div className="space-y-8">
                {/* PINNED SECTION */}
                {(pinnedDocs.length > 0 || pinnedLinks.length > 0) && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Pin className="size-3.5 text-neutral-400 rotate-45" />
                      <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Pinned Resources</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Pinned Documents */}
                      {pinnedDocs.map((doc) => (
                        <div
                          key={doc.id}
                          onClick={() => setActiveDocId(doc.id)}
                          className="group relative bg-white border border-neutral-100 hover:border-neutral-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between h-[130px]"
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 truncate max-w-[85%]">
                                <FileText className="size-4.5 text-primary" />
                                <h4 className="font-bold text-sm text-neutral-800 truncate">{doc.title}</h4>
                              </div>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await updateDocument(doc.id, { isPinned: false });
                                    toast.success("Document unpinned");
                                  } catch (e) {
                                    toast.error("Error unpinning");
                                  }
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-red-500 transition cursor-pointer"
                                title="Unpin"
                              >
                                <X className="size-3" />
                              </button>
                            </div>
                            <p className="text-xs text-neutral-400 line-clamp-2 mt-2 leading-relaxed">
                              {doc.content.replace(/[#*`>]/g, "")}
                            </p>
                          </div>
                          <span className="text-[10px] text-neutral-400 font-medium">
                            Updated {doc.updatedAt}
                          </span>
                        </div>
                      ))}

                      {/* Pinned Links */}
                      {pinnedLinks.map((lnk) => (
                        <div
                          key={lnk.id}
                          className="group relative bg-white border border-neutral-100 hover:border-neutral-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between h-[130px]"
                        >
                          <div>
                            <div className="flex items-start justify-between">
                              <a
                                href={lnk.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 hover:text-primary transition hover:underline max-w-[85%]"
                              >
                                <LinkIcon className="size-4.5 text-orange-500 shrink-0" />
                                <h4 className="font-bold text-sm text-neutral-800 truncate">{lnk.title}</h4>
                                <ExtIcon className="size-3.5 text-neutral-400 shrink-0 inline ml-0.5" />
                              </a>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0 ml-1">
                                <button
                                  onClick={() => handleTogglePinLink(lnk)}
                                  className="p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-red-500"
                                  title="Unpin"
                                >
                                  <X className="size-3" />
                                </button>
                                <button onClick={() => handleOpenEditLink(lnk)} className="p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-neutral-700">
                                  <Edit className="size-3" />
                                </button>
                                <button onClick={() => handleDeleteLink(lnk.id)} className="p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-red-600">
                                  <Trash2 className="size-3" />
                                </button>
                              </div>
                            </div>
                            {lnk.description && (
                              <p className="text-xs text-neutral-400 mt-2 leading-relaxed line-clamp-2">{lnk.description}</p>
                            )}
                          </div>
                          <a
                            href={lnk.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-neutral-400 font-mono truncate hover:underline hover:text-primary block mt-1"
                          >
                            {lnk.url}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ALL SECTIONS BROWSE GRID */}
                <div className="space-y-4">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">Browse Workspace Collections</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Collated Sections */}
                    {workspaceSecs.map((sec) => {
                      const { docs: secDocs, lnks: secLinks } = getSectionItems(sec.id);
                      return (
                        <div key={sec.id} className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between border-b border-neutral-50 pb-2 mb-3">
                              <h4 className="font-bold text-sm text-neutral-800">{sec.name}</h4>
                              <span className="text-[10px] text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full font-bold">
                                {secDocs.length + secLinks.length} items
                              </span>
                            </div>
                            
                            <div className="space-y-2">
                              {/* Docs */}
                              {secDocs.slice(0, 3).map((doc) => (
                                <div
                                  key={doc.id}
                                  onClick={() => setActiveDocId(doc.id)}
                                  className="flex items-center gap-2 text-xs text-neutral-600 hover:text-primary transition cursor-pointer hover:underline truncate"
                                >
                                  <FileText className="size-3.5 text-neutral-400 shrink-0" />
                                  <span className="truncate">{doc.title}</span>
                                </div>
                              ))}

                              {/* Links */}
                              {secLinks.slice(0, 2).map((lnk) => (
                                <a
                                  key={lnk.id}
                                  href={lnk.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-xs text-neutral-600 hover:text-primary transition hover:underline truncate"
                                >
                                  <LinkIcon className="size-3.5 text-neutral-400 shrink-0" />
                                  <span className="truncate flex-1">{lnk.title}</span>
                                  <ArrowUpRight className="size-2.5 text-neutral-400 shrink-0" />
                                </a>
                              ))}

                              {secDocs.length === 0 && secLinks.length === 0 && (
                                <p className="text-xs text-neutral-400 italic py-2">No documents or links in this section yet.</p>
                              )}

                              {(secDocs.length > 3 || secLinks.length > 2) && (
                                <button
                                  onClick={() => toggleSection(sec.id)}
                                  className="text-[10px] font-bold text-primary hover:underline mt-1 cursor-pointer block"
                                >
                                  See all items in sidebar
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Uncategorized Section */}
                    {(() => {
                      const { docs: uncDocs, lnks: uncLinks } = getSectionItems(null);
                      if (uncDocs.length === 0 && uncLinks.length === 0) return null;
                      return (
                        <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-xs">
                          <div className="flex items-center justify-between border-b border-neutral-50 pb-2 mb-3">
                            <h4 className="font-bold text-sm text-neutral-800">Uncategorized</h4>
                            <span className="text-[10px] text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full font-bold">
                              {uncDocs.length + uncLinks.length} items
                            </span>
                          </div>
                          
                          <div className="space-y-2">
                            {uncDocs.slice(0, 3).map((doc) => (
                              <div
                                key={doc.id}
                                onClick={() => setActiveDocId(doc.id)}
                                className="flex items-center gap-2 text-xs text-neutral-600 hover:text-primary transition cursor-pointer hover:underline truncate"
                              >
                                <FileText className="size-3.5 text-neutral-400 shrink-0" />
                                <span className="truncate">{doc.title}</span>
                              </div>
                            ))}
                            {uncLinks.slice(0, 2).map((lnk) => (
                              <a
                                key={lnk.id}
                                href={lnk.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-xs text-neutral-600 hover:text-primary transition hover:underline truncate"
                              >
                                <LinkIcon className="size-3.5 text-neutral-400 shrink-0" />
                                <span className="truncate flex-1">{lnk.title}</span>
                                <ArrowUpRight className="size-2.5 text-neutral-400 shrink-0" />
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ─── DOCUMENT SELECTED PANEL ─── */
          <div className="flex-1 flex flex-col min-h-0 max-w-4xl w-full mx-auto bg-white border border-neutral-100 rounded-3xl shadow-xs overflow-hidden">
            {selectedDoc ? (
              <>
                {/* Header Actions */}
                <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50 shrink-0">
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => {
                        setActiveDocId(null);
                        setIsEditing(false);
                      }}
                      variant="ghost"
                      size="sm"
                      className="cursor-pointer text-xs gap-1 hover:bg-neutral-100 px-2 py-1 rounded-md"
                    >
                      <X className="size-3.5" />
                      Close
                    </Button>
                    <span className="text-[10px] text-neutral-300 font-bold">|</span>
                    <span className="text-[10px] text-neutral-400 font-medium">
                      Updated {selectedDoc.updatedAt}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Pin button */}
                    <Button
                      onClick={handleTogglePinDoc}
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "size-8 rounded-md cursor-pointer hover:bg-neutral-100",
                        selectedDoc.isPinned ? "text-orange-500 hover:text-orange-600" : "text-neutral-400"
                      )}
                      title={selectedDoc.isPinned ? "Unpin Document" : "Pin Document"}
                    >
                      <Pin className={cn("size-4", selectedDoc.isPinned && "fill-orange-500")} />
                    </Button>

                    {/* Mode toggles */}
                    {isEditing ? (
                      <>
                        <Button onClick={handleSaveDoc} className="cursor-pointer gap-1.5 text-xs h-8 px-3">
                          <Save className="size-3.5" />
                          Save
                        </Button>
                        <Button onClick={() => setIsEditing(false)} variant="outline" className="cursor-pointer bg-white text-xs h-8 px-3">
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button onClick={() => setIsEditing(true)} className="cursor-pointer gap-1.5 text-xs h-8 px-3">
                          <Edit className="size-3.5" />
                          Edit
                        </Button>
                        <Button onClick={handleDeleteDoc} variant="ghost" className="cursor-pointer text-red-500 hover:bg-red-50 hover:text-red-600 size-8 p-0 rounded-md">
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* ─── DISPLAY OR EDITOR PANE ─── */}
                <div className="flex-1 overflow-y-auto p-6 min-h-0">
                  {isEditing ? (
                    /* ─── EDIT MODE ─── */
                    <div className="space-y-4 h-full flex flex-col">
                      {/* Document Details form */}
                      <div className="flex flex-col sm:flex-row gap-4 shrink-0">
                        <div className="flex-1">
                          <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">Document Title</label>
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder="e.g. Lending Policy Quick-guide"
                            className="bg-neutral-50 border-neutral-100 focus:bg-white text-sm font-bold"
                          />
                        </div>
                        <div className="w-full sm:w-56">
                          <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">Collection Section</label>
                          <select
                            value={editSectionId || ""}
                            onChange={(e) => setEditSectionId(e.target.value || null)}
                            className="w-full h-10 rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-xs outline-none focus:border-neutral-300 focus:bg-white text-neutral-800 transition"
                          >
                            <option value="">Uncategorized</option>
                            {workspaceSecs.map((sec) => (
                              <option key={sec.id} value={sec.id}>{sec.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Formatting Helper toolbar */}
                      <div className="flex items-center gap-0.5 border border-neutral-150 rounded-lg p-1 bg-neutral-50 shrink-0">
                        <button
                          type="button"
                          onClick={() => insertMarkdown("**Bold**")}
                          className="p-1.5 hover:bg-neutral-200 rounded text-neutral-600 transition cursor-pointer"
                          title="Bold"
                        >
                          <Bold className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertMarkdown("*Italic*")}
                          className="p-1.5 hover:bg-neutral-200 rounded text-neutral-600 transition cursor-pointer"
                          title="Italic"
                        >
                          <Italic className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertMarkdown("# Heading")}
                          className="p-1.5 hover:bg-neutral-200 rounded text-neutral-600 transition cursor-pointer"
                          title="Heading"
                        >
                          <Heading className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertMarkdown("```javascript\n// code here\n```")}
                          className="p-1.5 hover:bg-neutral-200 rounded text-neutral-600 transition cursor-pointer"
                          title="Code Block"
                        >
                          <Code className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertMarkdown("[text](url)")}
                          className="p-1.5 hover:bg-neutral-200 rounded text-neutral-600 transition cursor-pointer"
                          title="Insert Link"
                        >
                          <Link2 className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertMarkdown("- item")}
                          className="p-1.5 hover:bg-neutral-200 rounded text-neutral-600 transition cursor-pointer"
                          title="Bullet List"
                        >
                          <List className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertMarkdown("| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |")}
                          className="p-1.5 hover:bg-neutral-200 rounded text-neutral-600 transition cursor-pointer"
                          title="Insert Table"
                        >
                          <Table className="size-3.5" />
                        </button>
                      </div>

                      {/* Text editor area */}
                      <div className="flex-1 min-h-[300px]">
                        <Textarea
                          id="doc-editor"
                          ref={textareaRef}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          placeholder="Write document body in markdown syntax..."
                          className="w-full h-full min-h-[300px] resize-none font-mono text-xs bg-neutral-50 focus:bg-white border-neutral-100 p-4 leading-relaxed"
                        />
                      </div>
                    </div>
                  ) : (
                    /* ─── PREVIEW/VIEW MODE ─── */
                    <article className="prose max-w-none">
                      <div className="mb-6 border-b border-neutral-100 pb-4">
                        <h1 className="text-2xl font-extrabold text-neutral-800 tracking-tight">{selectedDoc.title}</h1>
                        {selectedDoc.sectionId && (
                          <span className="inline-block mt-2 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            {workspaceSecs.find((s) => s.id === selectedDoc.sectionId)?.name}
                          </span>
                        )}
                      </div>
                      <Prose content={selectedDoc.content} />
                    </article>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-neutral-400 italic text-center py-20">Document not found.</p>
            )}
          </div>
        )}
      </main>

      {/* ─── Section dialog (Create/Edit Section) ─── */}
      <Dialog open={isSectionDialogOpen} onOpenChange={setIsSectionDialogOpen}>
        <DialogContent className="max-w-sm border-neutral-200/50 bg-white">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm font-bold text-neutral-800">
              {editSectionTarget ? "Rename Collection" : "New Collection Section"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">Section Name</label>
            <Input
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              placeholder="e.g. Standard Playbooks, Product Specs"
              onKeyDown={(e) => e.key === "Enter" && handleCreateSection()}
              className="bg-neutral-50 text-xs"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="cursor-pointer text-xs h-8" onClick={() => setIsSectionDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="cursor-pointer text-xs h-8" onClick={handleCreateSection} disabled={!newSectionName.trim()}>
              Save Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── External Link Dialog ─── */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent className="max-w-md border-neutral-200/50 bg-white">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm font-bold text-neutral-800">
              {editLinkTarget ? "Edit Link" : "Add Shared Reference Link"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <div>
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">Link Title</label>
              <Input
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder="e.g. Zalopay Dev portal"
                className="bg-neutral-50 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">Web URL</label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="developers.zalopay.vn"
                className="bg-neutral-50 text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">Short Description</label>
              <Input
                value={linkDesc}
                onChange={(e) => setLinkDesc(e.target.value)}
                placeholder="e.g. API endpoints, merchant integration info"
                className="bg-neutral-50 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">Collection Section</label>
              <select
                value={linkSectionId || ""}
                onChange={(e) => setLinkSectionId(e.target.value || null)}
                className="w-full h-9 rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-xs outline-none focus:border-neutral-300 focus:bg-white text-neutral-800 transition"
              >
                <option value="">Uncategorized</option>
                {workspaceSecs.map((sec) => (
                  <option key={sec.id} value={sec.id}>{sec.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="cursor-pointer text-xs h-8" onClick={() => setIsLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="cursor-pointer text-xs h-8" onClick={handleSaveLink} disabled={!linkTitle.trim() || !linkUrl.trim()}>
              {editLinkTarget ? "Update Link" : "Add Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
