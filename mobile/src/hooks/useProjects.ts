import { useState, useCallback } from 'react';
import { bridgeApi } from '../services/bridge-api';

interface Project {
  name: string;
  path: string;
  hasClaude: boolean;
  isGit: boolean;
}

interface UseProjectsResult {
  projects: Project[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await bridgeApi.getProjects();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  return { projects, loading, error, refresh };
}
