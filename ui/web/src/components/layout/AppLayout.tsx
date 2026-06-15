import { useState, useEffect } from "react";
import { NavLink, Outlet, useSearchParams, useLocation, useNavigate } from "react-router";
import {
  MessageSquare,
  BrainCircuit,
  Menu,
  Settings,
  LayoutDashboard,
  ListTodo,
  FolderClosed,
  Search,
  ChevronDown,
  Trash2,
  Loader2,
  Plus,
  Sparkles,
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { useSessionsStore } from "@/stores/sessions";
import { useWorkspacesStore } from "@/stores/workspaces";
import { useThemeStore } from "@/stores/theme";
import { rbacApi } from "@/lib/api";
import SettingsDialog from "@/components/settings/SettingsDialog";
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
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type NavItem = {
  to: string;
  label: string;
  icon: typeof MessageSquare;
  tab: string; // tab name for RBAC; "*" means always visible
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tab: "*" },
      { to: "/todo", label: "To Do", icon: ListTodo, tab: "*" },
      { to: "/documents", label: "Documents", icon: FileText, tab: "*" },
      { to: "/files", label: "Files", icon: FolderClosed, tab: "*" },
      { to: "/ai-sdk", label: "AI SDK Playground", icon: Sparkles, tab: "*" },
    ],
  },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("sidebarWidth");
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
      localStorage.setItem("sidebarWidth", newWidth.toString());
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

  const settingsTab = searchParams.get("settings");
  const isSettingsOpen = !!settingsTab;

  const hasTabAccess = useAuthStore((s) => s.hasTabAccess);
  // Subscribe to permissions so component re-renders when they change.
  useAuthStore((s) => s.permissions);

  // Sessions store hooks
  const { sessions, loading, loadSessions, deleteSession } = useSessionsStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [customKeyOpen, setCustomKeyOpen] = useState(false);
  const [customKey, setCustomKey] = useState("");

  // Workspaces store hooks
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    createWorkspace,
  } = useWorkspacesStore();
  const setPermissions = useAuthStore((s) => s.setPermissions);

  // Load sessions list on mount (already scoped to the active workspace).
  useEffect(() => {
    loadSessions();
  }, []);

  // Switch the active workspace, then reload its sessions and permissions.
  const switchWorkspace = async (id: string) => {
    if (id === activeWorkspaceId) return;
    setActiveWorkspaceId(id);
    navigate("/dashboard");
    try {
      const { permissions } = await rbacApi.me();
      setPermissions(permissions);
    } catch {
      /* keep previous permissions on failure */
    }
    await loadSessions();
  };

  const handleTabChange = (tab: string) => {
    setSearchParams({ settings: tab });
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setSearchParams({ settings: "profile" });
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("settings");
        return next;
      });
    }
  };

  const handleNewChatAuto = async () => {
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const key = `chat-${randomId}`;
    navigate(`/sessions/${encodeURIComponent(key)}`);
    await loadSessions();
    toast.success(`Chat started with key: ${key}`);
  };

  const handleCreateCustomSession = async () => {
    const trimmed = customKey.trim();
    if (!trimmed) return;
    setCustomKeyOpen(false);
    setCustomKey("");
    navigate(`/sessions/${encodeURIComponent(trimmed)}`);
    await loadSessions();
    toast.success(`Chat started with key: ${trimmed}`);
  };

  const handleDeleteSession = async (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete chat session "${key}"?`)) return;
    await deleteSession(key);
    toast.success("Session deleted");

    // Redirect to dashboard if deleting the current active session
    const currentSessionPath = `/sessions/${encodeURIComponent(key)}`;
    if (pathname === currentSessionPath || pathname === `/sessions/${key}`) {
      navigate("/dashboard");
    }
  };

  const handleCreateWorkspace = async () => {
    const trimmed = newWorkspaceName.trim();
    if (!trimmed || creatingWorkspace) return; // guard against double submit
    setCreatingWorkspace(true);
    try {
      await createWorkspace(trimmed);
      setNewWorkspaceName("");
      setNewWorkspaceOpen(false);
      toast.success(`Workspace "${trimmed}" created`);
      // New workspace is now active — refresh permissions + sessions.
      try {
        const { permissions } = await rbacApi.me();
        setPermissions(permissions);
      } catch {
        /* ignore */
      }
      await loadSessions();
      navigate("/dashboard");
    } catch {
      /* error toast already shown by api layer */
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const isVisible = (item: NavItem) =>
    item.tab === "*" ? true : hasTabAccess(item.tab);
  
  const visibleGroups = navGroups
    .map((g) => ({ ...g, items: g.items.filter(isVisible) }))
    .filter((g) => g.items.length > 0);

  const renderItem = ({ to, label, icon: Icon }: NavItem) => (
    <NavLink
      key={to}
      to={to}
      onClick={() => setMobileOpen(false)}
      className={({ isActive }) =>
        cn(
          "flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
            : "text-sidebar-foreground hover:bg-sidebar-accent/60"
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      <span>{label}</span>
    </NavLink>
  );

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const workspaceTheme = activeWorkspace?.theme || "harbor";

  useEffect(() => {
    useThemeStore.getState().setTheme(workspaceTheme);
  }, [workspaceTheme]);

  // Sessions are already scoped to the active workspace server-side; filter
  // only by the search box.
  const filteredSessions = sessions.filter((s) =>
    s.key.toLowerCase().includes(chatSearch.toLowerCase())
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-sidebar">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        style={{ width: isMobile ? undefined : `${sidebarWidth}px` }}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar pl-3 py-4 transition-transform duration-200 md:relative",
          "md:static md:translate-x-0",
          isMobile ? "w-64" : "",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Workspace Selector */}
        <div className="px-1 pt-1 mb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/60 bg-white/40 px-3 py-2 text-sm font-bold text-neutral-800 hover:bg-white/50 transition cursor-pointer shadow-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <FolderClosed className="size-4 shrink-0 text-neutral-600" />
                  <span className="truncate">{activeWorkspace?.name || "Select Workspace"}</span>
                </div>
                <ChevronDown className="size-4 shrink-0 text-neutral-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-58 bg-sidebar border-border/50">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
                  Workspaces
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                {workspaces.map((ws) => (
                  <DropdownMenuItem
                    key={ws.id}
                    onClick={() => switchWorkspace(ws.id)}
                    className={cn(
                      "flex items-center justify-between px-2 py-1.5 text-sm cursor-pointer rounded-md transition hover:bg-sidebar-accent/60",
                      ws.id === activeWorkspaceId && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                    )}
                  >
                    <span className="truncate">{ws.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                onClick={() => setNewWorkspaceOpen(true)}
                className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-sidebar-accent/60 text-neutral-600 hover:text-neutral-800"
              >
                <Plus className="size-4" />
                <span>Add Workspace</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 flex flex-col min-h-0 w-full overflow-hidden">
          <div className="shrink-0">
            {visibleGroups.map((group, i) => (
              <div
                key={group.label}
                className={cn(i > 0 && "mt-5")}
              >
                <p className="mb-1.5 px-3 text-xs font-medium text-muted-foreground">
                  {group.label}
                </p>
                <div className="space-y-0.5">{group.items.map(renderItem)}</div>
              </div>
            ))}
          </div>

          {/* Chats category */}
          <div className="mt-5 flex-1 flex flex-col min-h-0 w-full">
            <div className="flex items-center justify-between mb-1.5 px-3 shrink-0">
              <p className="text-xs font-medium text-muted-foreground">Chats</p>
              <div className="flex items-center gap-1">
                {/* Search toggle */}
                <button
                  type="button"
                  onClick={() => setSearchOpen(!searchOpen)}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md transition duration-150 cursor-pointer",
                    searchOpen ? "bg-white/60 text-neutral-800" : "text-muted-foreground hover:bg-white/30 hover:text-foreground"
                  )}
                  title="Search chats"
                >
                  <Search className="size-3.5" />
                </button>
                {/* Custom Chat */}
                <button
                  type="button"
                  onClick={() => setCustomKeyOpen(true)}
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-white/30 hover:text-foreground transition duration-150 cursor-pointer"
                  title="New custom chat..."
                >
                  <ChevronDown className="size-3.5" />
                </button>
                {/* New Chat Auto */}
                <button
                  type="button"
                  onClick={handleNewChatAuto}
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-white/30 hover:text-foreground transition duration-150 cursor-pointer"
                  title="New Chat"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>
            
            {/* Session list search input */}
            {searchOpen && (
              <div className="px-3 mb-2 shrink-0">
                <input
                  type="text"
                  placeholder="Search chats..."
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  className="w-full h-8 rounded-lg border border-neutral-200 bg-white px-2.5 text-xs text-neutral-800 outline-none focus:border-neutral-300 transition"
                  autoFocus
                />
              </div>
            )}

            {/* Chat sessions list */}
            <div className="space-y-0.5 flex-1 overflow-y-auto min-h-0 w-full">
              {loading ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-400">
                  <Loader2 className="size-3 animate-spin" />
                  <span>Loading chats...</span>
                </div>
              ) : filteredSessions.length === 0 ? (
                <p className="px-3 py-1.5 text-xs text-neutral-400 italic">No chats yet</p>
              ) : (
                filteredSessions.map((s) => {
                  const isActive = pathname.startsWith(`/sessions/${encodeURIComponent(s.key)}`) || pathname === `/sessions/${s.key}`;
                  return (
                    <div
                      key={s.key}
                      className="group relative flex items-center w-full"
                    >
                      <NavLink
                        to={`/sessions/${encodeURIComponent(s.key)}`}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive: linkActive }) =>
                          cn(
                            "flex min-h-10 w-full items-center gap-3 rounded-lg pl-3 pr-10 text-sm font-medium transition-colors duration-150",
                            (isActive || linkActive)
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                          )
                        }
                      >
                        <span className="truncate">{s.key}</span>
                      </NavLink>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSession(s.key, e)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 flex size-6 cursor-pointer items-center justify-center rounded-md text-neutral-400 opacity-0 transition hover:bg-neutral-200 hover:text-red-500 group-hover:opacity-100"
                        title="Delete chat"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </nav>

        {/* Footer controls */}
        <div className="space-y-1.5 pt-3">
          <button
            type="button"
            onClick={() => setSearchParams({ settings: "profile" })}
            className={cn(
              "flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent cursor-pointer",
              isSettingsOpen && "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
            )}
          >
            <Settings className="size-4 shrink-0" />
            <span>Settings</span>
          </button>
        </div>
        {/* Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-neutral-300/50 active:bg-neutral-400/50 dark:hover:bg-neutral-700/50 dark:active:bg-neutral-600/50 transition-colors z-50 hidden md:block"
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl bg-background shadow-[-1px_-1px_0_rgba(255,255,255,0.7)] m-4">
        {/* Mobile top bar */}
        <div className="flex h-12 items-center gap-2 border-b border-border bg-background px-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary">
              <BrainCircuit className="size-3.5 text-primary-foreground" />
            </div>
            <h1 className="font-heading text-sm font-semibold tracking-tight text-foreground">
              Lending Claw
            </h1>
          </div>
        </div>
        <Outlet />
      </main>

      <SettingsDialog
        open={isSettingsOpen}
        onOpenChange={handleOpenChange}
        activeTab={settingsTab || "profile"}
        onTabChange={handleTabChange}
      />

      {/* New Custom Session Key Dialog */}
      <Dialog open={customKeyOpen} onOpenChange={setCustomKeyOpen}>
        <DialogContent className="max-w-md border-border/50 bg-sidebar">
          <DialogHeader>
            <DialogTitle className="font-heading">New Session</DialogTitle>
          </DialogHeader>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
              Session Key
            </label>
            <Input
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateCustomSession()}
              placeholder="e.g. ticket:LENDING-123"
              className="bg-card font-mono text-sm"
              autoFocus
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              A unique key to identify this session. The session will be created when you send the first message.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => setCustomKeyOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCustomSession} disabled={!customKey.trim()} className="cursor-pointer">
              Start Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Workspace Dialog */}
      <Dialog
        open={newWorkspaceOpen}
        onOpenChange={(open) => {
          if (creatingWorkspace) return; // don't allow closing mid-create
          setNewWorkspaceOpen(open);
        }}
      >
        <DialogContent className="max-w-md border-border/50 bg-sidebar">
          <DialogHeader>
            <DialogTitle className="font-heading">New Workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Workspace Name
              </label>
              <Input
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateWorkspace()}
                placeholder="e.g. Finance, Marketing, Personal"
                className="bg-card text-sm"
                disabled={creatingWorkspace}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => setNewWorkspaceOpen(false)}
              disabled={creatingWorkspace}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateWorkspace}
              disabled={!newWorkspaceName.trim() || creatingWorkspace}
              className="cursor-pointer gap-1.5"
            >
              {creatingWorkspace && <Loader2 className="size-4 animate-spin" />}
              {creatingWorkspace ? "Creating…" : "Create Workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
