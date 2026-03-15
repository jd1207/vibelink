import { useState, useCallback } from 'react';
import { bridgeApi } from '../services/bridge-api';
import type { FileEntry } from '../services/bridge-api';

interface FileBrowserState {
  entries: FileEntry[];
  currentPath: string;
  fileName: string | null;
  fileContent: string | null;
  loading: boolean;
  error: string | null;
}

export function useFileBrowser(sessionId: string) {
  const [state, setState] = useState<FileBrowserState>({
    entries: [],
    currentPath: '.',
    fileName: null,
    fileContent: null,
    loading: false,
    error: null,
  });

  const browse = useCallback(async (path?: string) => {
    setState((s) => ({ ...s, loading: true, error: null, fileName: null, fileContent: null }));
    try {
      const result = await bridgeApi.browseFiles(sessionId, path);
      setState({
        entries: result.entries,
        currentPath: result.path,
        fileName: null,
        fileContent: null,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [sessionId]);

  const viewFile = useCallback(async (path: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await bridgeApi.viewFile(sessionId, path);
      setState((s) => ({
        ...s,
        fileName: result.path,
        fileContent: result.content,
        loading: false,
        error: null,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [sessionId]);

  const navigateUp = useCallback(() => {
    if (state.fileName) {
      // viewing a file — go back to directory listing
      setState((s) => ({ ...s, fileName: null, fileContent: null }));
      return;
    }
    if (state.currentPath === '.' || state.currentPath === '') return;
    const parent = state.currentPath.split('/').slice(0, -1).join('/') || '.';
    browse(parent);
  }, [state.fileName, state.currentPath, browse]);

  return { ...state, browse, viewFile, navigateUp };
}
