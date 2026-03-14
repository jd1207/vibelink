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
  setBridgeUrl: (url) => set({ bridgeUrl: url }),
  setAuthToken: (token) => set({ authToken: token }),
  setConnected: (connected) => set({ isConnected: connected }),
}));
