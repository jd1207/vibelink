import { useConnectionStore } from '../store/connection';

interface Project {
  name: string;
  path: string;
  hasClaude: boolean;
  isGit: boolean;
}

interface Session {
  id: string;
  projectPath: string;
  projectName: string;
  createdAt: string;
  alive: boolean;
  lastMessage?: string;
}

interface DebugInfo {
  sessions: number;
  clients: number;
  uptime: number;
}

function getHeaders(): Record<string, string> {
  const { authToken } = useConnectionStore.getState();
  return {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

function getBaseUrl(): string {
  return useConnectionStore.getState().bridgeUrl;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options?.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    throw new Error(`api error ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export const bridgeApi = {
  getProjects: (): Promise<Project[]> =>
    apiFetch<Project[]>('/projects'),

  getSessions: async (): Promise<Session[]> => {
    const raw = await apiFetch<Array<{ id: string; projectPath: string; createdAt: string; alive: boolean }>>('/sessions');
    return raw.map((s) => ({
      id: s.id,
      projectPath: s.projectPath,
      projectName: s.projectPath.split('/').filter(Boolean).pop() ?? s.projectPath,
      createdAt: s.createdAt,
      alive: s.alive,
    }));
  },

  createSession: async (projectPath: string, skipPermissions?: boolean): Promise<Session> => {
    const raw = await apiFetch<{ sessionId: string; wsUrl: string }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ projectPath, skipPermissions: skipPermissions ?? false }),
    });
    const name = projectPath.split('/').filter(Boolean).pop() ?? projectPath;
    return {
      id: raw.sessionId,
      projectPath,
      projectName: name,
      createdAt: new Date().toISOString(),
      alive: true,
    };
  },

  deleteSession: (id: string): Promise<void> =>
    apiFetch<void>(`/sessions/${id}`, { method: 'DELETE' }),

  getDebug: (): Promise<DebugInfo> =>
    apiFetch<DebugInfo>('/debug'),
};
