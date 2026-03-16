import { create } from 'zustand';

export type SessionType = "terminal" | "vibelink" | "idle";

export interface Session {
  id: string;
  projectPath: string;
  projectName: string;
  createdAt: string;
  alive: boolean;
  lastMessage?: string;
  sessionType: SessionType;
  claudeSessionId?: string;
  watchSessionId?: string;
  model?: string | null;
  gitBranch?: string | null;
  name?: string | null;
}

interface SessionState {
  sessions: Record<string, Session>;
  activeSessionId: string | null;
  setSessions: (sessions: Session[]) => void;
  setActiveSession: (id: string | null) => void;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  setSessionType: (id: string, type: SessionType) => void;
  setWatchSessionId: (id: string, watchSessionId: string | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: {},
  activeSessionId: null,

  setSessions: (sessions) =>
    set({
      sessions: Object.fromEntries(sessions.map((s) => [s.id, s])),
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  addSession: (session) =>
    set((state) => ({
      sessions: { ...state.sessions, [session.id]: session },
    })),

  removeSession: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.sessions;
      return { sessions: rest };
    }),

  setSessionType: (id, type) =>
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return {
        sessions: { ...state.sessions, [id]: { ...session, sessionType: type } },
      };
    }),

  setWatchSessionId: (id, watchSessionId) =>
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [id]: { ...session, watchSessionId: watchSessionId ?? undefined },
        },
      };
    }),
}));
