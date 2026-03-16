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

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
}

export interface BrowseResult {
  path: string;
  entries: FileEntry[];
}

export interface ViewFileResult {
  path: string;
  lines: number;
  totalLines: number;
  truncated: boolean;
  content: string;
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

  createSession: async (projectPath: string, skipPermissions?: boolean, resumeSessionId?: string): Promise<Session> => {
    const raw = await apiFetch<{ sessionId: string; wsUrl: string }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({
        projectPath,
        skipPermissions: skipPermissions ?? false,
        ...(resumeSessionId ? { resumeSessionId } : {}),
      }),
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

  browseFiles: (sessionId: string, path?: string): Promise<BrowseResult> => {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return apiFetch<BrowseResult>(`/sessions/${sessionId}/files${query}`);
  },

  viewFile: (sessionId: string, path: string): Promise<ViewFileResult> =>
    apiFetch<ViewFileResult>(`/sessions/${sessionId}/files/view?path=${encodeURIComponent(path)}`),

  watchSession: (claudeSessionId: string): Promise<{ sessionId: string; wsUrl: string }> =>
    apiFetch<{ sessionId: string; wsUrl: string }>('/sessions/watch', {
      method: 'POST',
      body: JSON.stringify({ claudeSessionId }),
    }),

  endTerminalSession: (claudeSessionId: string): Promise<void> =>
    apiFetch<void>('/sessions/end-terminal', {
      method: 'POST',
      body: JSON.stringify({ claudeSessionId }),
    }),

  getClaudeSessions: (): Promise<any[]> =>
    apiFetch<any[]>('/claude-sessions'),
};
