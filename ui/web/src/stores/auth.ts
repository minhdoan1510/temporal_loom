import { create } from "zustand";

function getCookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

interface AuthState {
  sub: string;
  permissions: string[] | null;
  setSub: (sub: string) => void;
  setPermissions: (perms: string[] | null) => void;
  hasPermission: (resource: string) => boolean;
  hasTabAccess: (tabName: string) => boolean;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  sub: getCookie("sub"),
  permissions: null,

  setSub: (sub: string) => {
    set({ sub });
  },

  setPermissions: (perms: string[] | null) => {
    set({ permissions: perms });
  },

  hasPermission: (resource: string) => {
    const { permissions } = get();
    if (permissions === null) return true; // bootstrap mode
    return permissions.includes(resource);
  },

  hasTabAccess: (tabName: string) => {
    const { permissions } = get();
    if (permissions === null) return true; // bootstrap mode
    const prefix = `tab:${tabName}:`;
    return permissions.some((p) => p.startsWith(prefix));
  },

  clearAuth: () => {
    set({ sub: "", permissions: null });
  },
}));
