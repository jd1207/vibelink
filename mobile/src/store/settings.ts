import { create } from 'zustand';

type Theme = 'claude' | 'blue';

interface SettingsState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'claude',
  setTheme: (theme) => set({ theme }),
}));
