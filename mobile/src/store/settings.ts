import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { themes, ThemeKey, ThemePalette } from '../constants/colors';

export const THEME_KEY = 'vibelink_theme';

interface SettingsState {
  theme: ThemeKey;
  setTheme: (theme: ThemeKey) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'claude-code',
  setTheme: (theme) => {
    set({ theme });
    SecureStore.setItemAsync(THEME_KEY, theme);
  },
}));

export function useColors(): ThemePalette {
  const theme = useSettingsStore((s) => s.theme);
  return themes[theme];
}
