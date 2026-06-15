import { create } from "zustand";
import type { SessionInfo } from "@/types/api";
import { sessions as sessionsApi } from "@/lib/api";

interface SessionsState {
  sessions: SessionInfo[];
  loading: boolean;
  loadSessions: () => Promise<void>;
  deleteSession: (key: string) => Promise<void>;
  createSession: (key: string) => Promise<void>;
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  loading: false,

  loadSessions: async () => {
    set({ loading: true });
    try {
      const list = await sessionsApi.list();
      set({ sessions: list });
    } catch {
      set({ sessions: [] });
    } finally {
      set({ loading: false });
    }
  },

  deleteSession: async (key: string) => {
    try {
      await sessionsApi.delete(key);
      set((state) => ({
        sessions: state.sessions.filter((s) => s.key !== key),
      }));
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  },

  createSession: async (_key: string) => {
    // Session is created when sending the first message on backend,
    // but we can locally pre-insert or load sessions list to reflect it.
    await get().loadSessions();
  },
}));
