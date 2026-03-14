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

  getSessions: (): Promise<Session[]> =>
    apiFetch<Session[]>('/sessions'),

  createSession: (projectPath: string): Promise<Session> =>
    apiFetch<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ projectPath }),
    }),

  deleteSession: (id: string): Promise<void> =>
    apiFetch<void>(`/sessions/${id}`, { method: 'DELETE' }),

  getDebug: (): Promise<DebugInfo> =>
    apiFetch<DebugInfo>('/debug'),
};
