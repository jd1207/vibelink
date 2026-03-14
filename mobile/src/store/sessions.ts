import { create } from 'zustand';

export interface Session {
  id: string;
  projectPath: string;
  projectName: string;
  createdAt: string;
  alive: boolean;
  lastMessage?: string;
}

interface SessionState {
  sessions: Map<string, Session>;
  activeSessionId: string | null;
  setSessions: (sessions: Session[]) => void;
  setActiveSession: (id: string | null) => void;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: new Map(),
  activeSessionId: null,

  setSessions: (sessions) =>
    set({
      sessions: new Map(sessions.map((s) => [s.id, s])),
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  addSession: (session) =>
    set((state) => {
      const next = new Map(state.sessions);
      next.set(session.id, session);
      return { sessions: next };
    }),

  removeSession: (id) =>
    set((state) => {
      const next = new Map(state.sessions);
      next.delete(id);
      return { sessions: next };
    }),
}));
