import { create } from 'zustand';

interface ConnectionState {
  bridgeUrl: string;
  authToken: string;
  isConnected: boolean;
  setBridgeUrl: (url: string) => void;
  setAuthToken: (token: string) => void;
  setConnected: (connected: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  bridgeUrl: '',
  authToken: '',
  isConnected: false,
  setBridgeUrl: (url) => {
    let normalized = url.trim().replace(/\/+$/, '');
    if (normalized && !/^https?:\/\//.test(normalized)) {
      normalized = `http://${normalized}`;
    }
    set({ bridgeUrl: normalized });
  },
  setAuthToken: (token) => set({ authToken: token }),
  setConnected: (connected) => set({ isConnected: connected }),
}));
