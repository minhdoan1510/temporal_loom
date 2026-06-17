import { create } from "zustand";
import { routines as routinesApi } from "@/lib/api";
import type { Routine, RoutineRun, CreateRoutineResp, FireRunResp } from "@/types/api";

interface RoutinesState {
  items: Routine[];
  loaded: boolean;
  loading: boolean;
  runsByRoutine: Record<string, RoutineRun[]>;
  runsLoading: Record<string, boolean>;

  loadRoutines: () => Promise<void>;
  createRoutine: (data: Partial<Routine> & { generate_token?: boolean }) => Promise<CreateRoutineResp>;
  updateRoutine: (id: string, data: Partial<Routine> & { generate_token?: boolean }) => Promise<CreateRoutineResp>;
  deleteRoutine: (id: string) => Promise<void>;
  loadRuns: (routineId: string) => Promise<void>;
  fireRoutine: (id: string, text?: string) => Promise<FireRunResp>;
  rotateToken: (id: string) => Promise<string>;
  revokeToken: (id: string) => Promise<void>;
}

export const useRoutinesStore = create<RoutinesState>((set) => ({
  items: [],
  loaded: false,
  loading: false,
  runsByRoutine: {},
  runsLoading: {},

  loadRoutines: async () => {
    set({ loading: true });
    try {
      const items = await routinesApi.list();
      set({ items, loaded: true, loading: false });
    } catch {
      set({ items: [], loaded: false, loading: false });
    }
  },

  createRoutine: async (data) => {
    const resp = await routinesApi.create(data);
    set((s) => ({ items: [...s.items, resp.routine] }));
    return resp;
  },

  updateRoutine: async (id, data) => {
    const resp = await routinesApi.update(id, data);
    set((s) => ({
      items: s.items.map((r) => (r.id === id ? resp.routine : r)),
    }));
    return resp;
  },

  deleteRoutine: async (id) => {
    await routinesApi.delete(id);
    set((s) => ({
      items: s.items.filter((r) => r.id !== id),
      runsByRoutine: { ...s.runsByRoutine, [id]: [] },
    }));
  },

  loadRuns: async (routineId) => {
    set((s) => ({ runsLoading: { ...s.runsLoading, [routineId]: true } }));
    try {
      const runs = await routinesApi.listRuns(routineId);
      set((s) => ({
        runsByRoutine: { ...s.runsByRoutine, [routineId]: runs },
        runsLoading: { ...s.runsLoading, [routineId]: false },
      }));
    } catch {
      set((s) => ({ runsLoading: { ...s.runsLoading, [routineId]: false } }));
    }
  },

  fireRoutine: async (id, text) => {
    const resp = await routinesApi.fire(id, text);
    return resp;
  },

  rotateToken: async (id) => {
    const resp = await routinesApi.rotateToken(id);
    set((s) => ({
      items: s.items.map((r) => (r.id === id ? { ...r, has_fire_token: true } : r)),
    }));
    return resp.fire_token;
  },

  revokeToken: async (id) => {
    await routinesApi.revokeToken(id);
    set((s) => ({
      items: s.items.map((r) => (r.id === id ? { ...r, has_fire_token: false } : r)),
    }));
  },
}));
