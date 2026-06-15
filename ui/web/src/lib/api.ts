import { toast } from "sonner";
import type {
  SessionInfo,
  SessionData,
  RunRequest,
  RunResult,
  Skill,
  ContextFile,
  Role,
  KnowledgeBase,
  MCPServer,
  MCPFunction,
  UserProfile,
  Workspace,
  WorkspaceMember,
} from "@/types/api";

const BASE = "/api/v1";

// getActiveWorkspaceId returns the workspace id/slug used to scope API calls.
// The active workspace is per-TAB (sessionStorage) so two tabs can sit on
// different workspaces independently; localStorage is only the "last used"
// default used to seed a freshly opened tab. Falls back to the "default"
// workspace slug before workspaces have loaded.
export function getActiveWorkspaceId(): string {
  return (
    sessionStorage.getItem("lending_claw_active_workspace_id") ||
    localStorage.getItem("lending_claw_active_workspace_id") ||
    "default"
  );
}

// wsPath prefixes a path with the active workspace scope.
function wsPath(p: string): string {
  return `/workspaces/${encodeURIComponent(getActiveWorkspaceId())}${p}`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg = body.error || `HTTP ${res.status}`;
    toast.error(msg);
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Auth
export const auth = {
  setToken: (token: string) =>
    request<{ sub: string; name: string; role: string }>("/set-token", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  logout: () =>
    request<void>("/logout", { method: "POST" }),
};

// CAS SSO — validate a service ticket; the backend sets auth cookies on success.
export const sso = {
  casLogin: (ticket: string, service: string) =>
    request<{ sub: string }>("/sso/cas", {
      method: "POST",
      body: JSON.stringify({ ticket, service }),
    }),
};

// Workspaces (NOT workspace-scoped — these manage the workspaces themselves)
export const workspaces = {
  list: () => request<Workspace[]>("/workspaces"),
  get: (id: string) => request<Workspace>(`/workspaces/${encodeURIComponent(id)}`),
  create: (data: { name: string; slug?: string; description?: string }) =>
    request<Workspace>("/workspaces", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name?: string; description?: string }) =>
    request<Workspace>(`/workspaces/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" }),
  members: (id: string) =>
    request<WorkspaceMember[]>(`/workspaces/${encodeURIComponent(id)}/members`),
  addMember: (id: string, sub: string, roles: string[]) =>
    request<void>(`/workspaces/${encodeURIComponent(id)}/members`, {
      method: "POST",
      body: JSON.stringify({ sub, roles }),
    }),
  setMemberRoles: (id: string, sub: string, roles: string[]) =>
    request<void>(
      `/workspaces/${encodeURIComponent(id)}/members/${encodeURIComponent(sub)}/roles`,
      { method: "PUT", body: JSON.stringify({ roles }) }
    ),
  removeMember: (id: string, sub: string) =>
    request<void>(
      `/workspaces/${encodeURIComponent(id)}/members/${encodeURIComponent(sub)}`,
      { method: "DELETE" }
    ),
};

// Sessions (workspace-scoped)
export const sessions = {
  list: () => request<SessionInfo[]>(wsPath("/sessions")),
  get: (key: string) => request<SessionData>(wsPath(`/sessions/${encodeURIComponent(key)}`)),
  delete: (key: string) => request<void>(wsPath(`/sessions/${encodeURIComponent(key)}`), { method: "DELETE" }),
};

// Agent (workspace-scoped)
export const agent = {
  run: (req: RunRequest) =>
    request<RunResult>(wsPath("/agent/run"), {
      method: "POST",
      body: JSON.stringify({ ...req, stream: false }),
    }),
  runStream: (req: RunRequest, signal?: AbortSignal): Promise<Response> =>
    fetch(`${BASE}${wsPath("/agent/run")}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...req, stream: true }),
      signal,
    }),
};

// Skills (workspace-scoped)
export const skills = {
  list: () => request<Skill[]>(wsPath("/skills")),
  get: (id: string) => request<Skill>(wsPath(`/skills/${id}`)),
  create: (data: Partial<Skill>) =>
    request<Skill>(wsPath("/skills"), {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Skill>) =>
    request<Skill>(wsPath(`/skills/${id}`), {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(wsPath(`/skills/${id}`), { method: "DELETE" }),
};

// Context Files (workspace-scoped)
export const contextFiles = {
  list: () => request<ContextFile[]>(wsPath("/context-files")),
  create: (data: Partial<ContextFile>) =>
    request<ContextFile>(wsPath("/context-files"), {
      method: "POST",
      body: JSON.stringify(data),
    }),
  upsert: (data: Partial<ContextFile>) =>
    request<ContextFile>(wsPath("/context-files"), {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (scope: string, path: string, userId?: string) => {
    const params = new URLSearchParams({ scope, path });
    if (userId) params.set("user_id", userId);
    return request<void>(wsPath(`/context-files?${params}`), { method: "DELETE" });
  },
};

// RBAC (workspace-scoped: roles and permissions are per-workspace)
export const rbacApi = {
  me: () => request<UserProfile>(wsPath("/rbac/me")),
  resources: () => request<string[]>(wsPath("/rbac/resources")),
  roles: {
    list: () => request<Role[]>(wsPath("/rbac/roles")),
    create: (data: { name: string; permissions: string[] }) =>
      request<{ name: string }>(wsPath("/rbac/roles"), {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (name: string, data: { permissions: string[] }) =>
      request<void>(wsPath(`/rbac/roles/${encodeURIComponent(name)}`), {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (name: string) =>
      request<void>(wsPath(`/rbac/roles/${encodeURIComponent(name)}`), {
        method: "DELETE",
      }),
  },
};

// MCP Servers (workspace-scoped)
export const mcpServers = {
  list: () => request<MCPServer[]>(wsPath("/mcp/servers")),
  get: (name: string) =>
    request<MCPServer>(wsPath(`/mcp/servers/${encodeURIComponent(name)}`)),
  create: (data: {
    name: string;
    url: string;
    auth_token?: string;
    description?: string;
    enabled?: boolean;
  }) =>
    request<MCPServer>(wsPath("/mcp/servers"), {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (
    name: string,
    data: {
      url?: string;
      auth_token?: string;
      description?: string;
      enabled?: boolean;
    }
  ) =>
    request<MCPServer>(wsPath(`/mcp/servers/${encodeURIComponent(name)}`), {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  refresh: (name: string) =>
    request<MCPServer>(wsPath(`/mcp/servers/${encodeURIComponent(name)}/refresh`), {
      method: "POST",
    }),
  setFunctionEnabled: (name: string, fn: string, enabled: boolean) =>
    request<MCPFunction>(
      wsPath(`/mcp/servers/${encodeURIComponent(name)}/functions/${encodeURIComponent(fn)}`),
      {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }
    ),
  delete: (name: string) =>
    request<void>(wsPath(`/mcp/servers/${encodeURIComponent(name)}`), {
      method: "DELETE",
    }),
};

// Knowledge (workspace-scoped)
export const knowledge = {
  list: () => request<KnowledgeBase[]>(wsPath("/knowledge")),
  get: (id: string) => request<KnowledgeBase>(wsPath(`/knowledge/${id}`)),
  create: (data: Partial<KnowledgeBase>) =>
    request<KnowledgeBase>(wsPath("/knowledge"), {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<KnowledgeBase>) =>
    request<KnowledgeBase>(wsPath(`/knowledge/${id}`), {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(wsPath(`/knowledge/${id}`), { method: "DELETE" }),
  sync: (id: string, reset?: boolean) =>
    request<{ status: string }>(
      wsPath(`/knowledge/${id}/sync${reset ? "?reset=true" : ""}`),
      { method: "POST" }
    ),
};
