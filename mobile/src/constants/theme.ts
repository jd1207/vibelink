import { colors } from './colors';

// re-export the full palette
export { colors } from './colors';

// legacy flat export for any remaining consumers
export const themeColors = {
  bg: colors.bg.primary,
  surface: colors.bg.surface,
  border: colors.border.default,
  text: colors.text.primary,
  textSecondary: colors.text.muted,
  accent: colors.accent.primary,
  success: colors.status.success,
  error: colors.status.error,
  warning: colors.status.warning,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
};
