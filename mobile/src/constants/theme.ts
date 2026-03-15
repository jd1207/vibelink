import { themes } from './colors';

export { themes, themeList } from './colors';
export type { ThemeKey, ThemePalette } from './colors';
export { useColors, useSettingsStore } from '../store/settings';

// legacy flat export — uses default theme for non-reactive consumers
const d = themes['claude-code'];

export const themeColors = {
  bg: d.bg.primary, surface: d.bg.surface, border: d.border.default,
  text: d.text.primary, textSecondary: d.text.muted, accent: d.accent.primary,
  success: d.status.success, error: d.status.error, warning: d.status.warning,
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 8, md: 12, lg: 20 };
