// multi-theme color palettes — all themes share the same shape

// shared status colors — semantic, theme-independent
const status = {
  success: '#34D399', successDark: '#16A34A',
  error: '#EF4444', errorDark: '#DC2626',
  warning: '#FBBF24', warningDark: '#F59E0B',
  info: '#60A5FA',
};

const diff = { added: '#4ADE80', removed: '#F87171' };

export const themes = {
  'claude-code': {
    bg: { primary: '#1A1A1A', secondary: '#11100F', surface: '#1E1A17', elevated: '#2A2520', inset: '#0F0E0D', badge: '#2A1F17' },
    text: { primary: '#F8FAFC', secondary: '#E2E8F0', muted: '#94A3B8', subtle: '#64748B', dim: '#475569' },
    accent: { primary: '#D97757', light: '#E2A48B', lighter: '#FFB38A', dark: '#C15F3C' },
    status, border: { default: '#334155', subtle: '#2A2520' },
    code: { text: '#E2E8F0', inline: '#E2A48B', background: '#11100F', lineNumber: '#475569', ...diff },
    interactive: { selected: '#3D2518', hover: '#2A2520' },
  },
  'claude-chat': {
    bg: { primary: '#1C1917', secondary: '#0C0A09', surface: '#292524', elevated: '#44403C', inset: '#0C0A09', badge: '#44403C' },
    text: { primary: '#FAFAF9', secondary: '#E7E5E4', muted: '#A8A29E', subtle: '#78716C', dim: '#57534E' },
    accent: { primary: '#C4956A', light: '#D4A574', lighter: '#E8C9A0', dark: '#A67B50' },
    status, border: { default: '#44403C', subtle: '#292524' },
    code: { text: '#E7E5E4', inline: '#D4A574', background: '#0C0A09', lineNumber: '#57534E', ...diff },
    interactive: { selected: '#3D2E1F', hover: '#292524' },
  },
  'gpt': {
    bg: { primary: '#212121', secondary: '#171717', surface: '#2F2F2F', elevated: '#424242', inset: '#171717', badge: '#1A3A2A' },
    text: { primary: '#ECECEC', secondary: '#D1D1D1', muted: '#9B9B9B', subtle: '#7A7A7A', dim: '#5A5A5A' },
    accent: { primary: '#10A37F', light: '#1DC990', lighter: '#6DE4B8', dark: '#0D8A6A' },
    status, border: { default: '#444444', subtle: '#2F2F2F' },
    code: { text: '#D1D1D1', inline: '#1DC990', background: '#171717', lineNumber: '#5A5A5A', ...diff },
    interactive: { selected: '#1A3A2A', hover: '#2F2F2F' },
  },
  'midnight': {
    bg: { primary: '#0A0A0A', secondary: '#050505', surface: '#18181B', elevated: '#1E293B', inset: '#050505', badge: '#1E293B' },
    text: { primary: '#FAFAFA', secondary: '#E2E8F0', muted: '#A1A1AA', subtle: '#71717A', dim: '#52525B' },
    accent: { primary: '#3B82F6', light: '#60A5FA', lighter: '#93C5FD', dark: '#2563EB' },
    status, border: { default: '#27272A', subtle: '#18181B' },
    code: { text: '#E2E8F0', inline: '#A5B4FC', background: '#0F172A', lineNumber: '#52525B', ...diff },
    interactive: { selected: '#1E3A5F', hover: '#18181B' },
  },
};

export type ThemeKey = keyof typeof themes;
export type ThemePalette = (typeof themes)[ThemeKey];

export const themeList: { key: ThemeKey; name: string; accent: string }[] = [
  { key: 'claude-code', name: 'claude code', accent: '#D97757' },
  { key: 'claude-chat', name: 'claude chat', accent: '#C4956A' },
  { key: 'gpt', name: 'gpt', accent: '#10A37F' },
  { key: 'midnight', name: 'midnight', accent: '#3B82F6' },
];
