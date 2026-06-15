import { create } from "zustand";
import type { Workspace } from "@/types/api";
import type { Theme } from "@/stores/theme";
import { workspaces as workspacesApi } from "@/lib/api";

const ACTIVE_KEY = "lending_claw_active_workspace_id";
const THEMES_KEY = "lending_claw_workspace_themes";

interface WorkspacesState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  loaded: boolean;
  /** Fetch the caller's workspaces and resolve the active workspace id. */
  loadWorkspaces: () => Promise<string>;
  /** Switch the active workspace (persisted to localStorage). */
  setActiveWorkspaceId: (id: string) => void;
  /** Create a workspace on the backend and make it active. */
  createWorkspace: (name: string) => Promise<Workspace>;
  /** Update a workspace's name/description on the backend. */
  updateWorkspace: (id: string, data: { name?: string; description?: string }) => Promise<Workspace>;
  /** Set the theme for the active workspace (persisted client-side). */
  updateActiveWorkspaceTheme: (theme: Theme) => void;
}

// The active workspace is per-TAB (sessionStorage) so multiple tabs can sit on
// different workspaces independently. localStorage holds the "last used"
// default to seed a newly opened tab.
function readActive(): string {
  return (
    sessionStorage.getItem(ACTIVE_KEY) ||
    localStorage.getItem(ACTIVE_KEY) ||
    "default"
  );
}

function persistActive(id: string) {
  sessionStorage.setItem(ACTIVE_KEY, id); // per-tab — what API calls read
  localStorage.setItem(ACTIVE_KEY, id); // remembered default for new tabs
}

// Themes are a client-only preference (the backend doesn't store them), kept in
// localStorage keyed by workspace id and merged onto the API response.
function loadThemeMap(): Record<string, Theme> {
  try {
    return JSON.parse(localStorage.getItem(THEMES_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveThemeMap(map: Record<string, Theme>) {
  localStorage.setItem(THEMES_KEY, JSON.stringify(map));
}

export const useWorkspacesStore = create<WorkspacesState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: readActive(),
  loaded: false,

  loadWorkspaces: async () => {
    // Let failures propagate (e.g. 401 when the token is expired) so the caller
    // can route to login. A successful-but-empty response is a genuine new user
    // (handled by the onboarding flow), NOT a load failure — don't conflate them.
    let list: Workspace[] = await workspacesApi.list();

    // Merge client-side theme preferences onto the fetched workspaces.
    const themes = loadThemeMap();
    list = list.map((w) => ({ ...w, theme: themes[w.id] }));

    const stored = sessionStorage.getItem(ACTIVE_KEY) || localStorage.getItem(ACTIVE_KEY);
    let activeId = stored && list.some((w) => w.id === stored) ? stored : "";
    if (!activeId && list.length > 0) {
      activeId = list[0].id;
    }
    if (!activeId) {
      // No workspaces yet (new user) — fall back to the default slug so any
      // scoped request still resolves server-side. The onboarding flow handles
      // actually getting this user a workspace.
      activeId = "default";
    }

    set({ workspaces: list, activeWorkspaceId: activeId, loaded: true });
    persistActive(activeId);
    return activeId;
  },

  setActiveWorkspaceId: (id: string) => {
    set({ activeWorkspaceId: id });
    persistActive(id);
  },

  createWorkspace: async (name: string) => {
    const ws = await workspacesApi.create({ name });
    set((state) => ({
      workspaces: [...state.workspaces, ws],
      activeWorkspaceId: ws.id,
    }));
    persistActive(ws.id);
    return ws;
  },

  updateWorkspace: async (id, data) => {
    const ws = await workspacesApi.update(id, data);
    set((state) => ({
      // Preserve the client-only theme (the API response doesn't carry it).
      workspaces: state.workspaces.map((w) =>
        w.id === id ? { ...w, ...ws, theme: w.theme } : w
      ),
    }));
    return ws;
  },

  updateActiveWorkspaceTheme: (theme: Theme) => {
    const { workspaces, activeWorkspaceId } = get();
    const updated = workspaces.map((w) =>
      w.id === activeWorkspaceId ? { ...w, theme } : w
    );
    set({ workspaces: updated });

    const themes = loadThemeMap();
    themes[activeWorkspaceId] = theme;
    saveThemeMap(themes);
  },
}));
