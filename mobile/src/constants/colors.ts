// multi-theme color palettes — all themes share the same shape

// shared status colors for dark themes
const darkStatus = {
  success: '#34D399', successDark: '#16A34A',
  error: '#EF4444', errorDark: '#DC2626',
  warning: '#FBBF24', warningDark: '#F59E0B',
  info: '#60A5FA',
};

// adjusted for readability on light backgrounds
const lightStatus = {
  success: '#265B19', successDark: '#1A4512',
  error: '#7F2C28', errorDark: '#B53333',
  warning: '#5A4815', warningDark: '#B45309',
  info: '#3266AD',
};

export const themes = {
  'claude-code': {
    mode: 'dark' as const,
    bg: { primary: '#1A1A1A', secondary: '#11100F', surface: '#1E1A17', elevated: '#2A2520', inset: '#0F0E0D', badge: '#2A1F17' },
    text: { primary: '#F8FAFC', secondary: '#E2E8F0', muted: '#94A3B8', subtle: '#64748B', dim: '#475569', onAccent: '#FFFFFF' },
    accent: { primary: '#D97757', light: '#E2A48B', lighter: '#FFB38A', dark: '#C15F3C', userBubble: '#D97757', assistantBubble: '#1E1A17' },
    status: darkStatus, border: { default: '#334155', subtle: '#2A2520' },
    code: { text: '#E2E8F0', inline: '#E2A48B', background: '#11100F', lineNumber: '#475569', added: '#4ADE80', removed: '#F87171', blockOverlay: 'rgba(0,0,0,0.4)', inlineOverlay: 'rgba(0,0,0,0.2)' },
    interactive: { selected: '#3D2518', hover: '#2A2520', successTint: 'rgba(6, 78, 59, 0.3)' },
  },
  'claude-chat': {
    mode: 'light' as const,
    bg: { primary: '#FAF9F5', secondary: '#FFFFFF', surface: '#F5F4ED', elevated: '#E8E6DC', inset: '#F5F4ED', badge: '#E8E6DC' },
    text: { primary: '#141413', secondary: '#3D3D3A', muted: '#73726C', subtle: '#918E85', dim: '#B0AEA5', onAccent: '#FFFFFF' },
    accent: { primary: '#D97757', light: '#E8A088', lighter: '#F0C4B0', dark: '#C15F3C', userBubble: '#D97757', assistantBubble: '#FAF9F5' },
    status: lightStatus, border: { default: 'rgba(31, 30, 29, 0.20)', subtle: 'rgba(31, 30, 29, 0.10)' },
    code: { text: '#141413', inline: '#C15F3C', background: '#F5F4ED', lineNumber: '#B0AEA5', added: '#265B19', removed: '#7F2C28', blockOverlay: 'rgba(0,0,0,0.05)', inlineOverlay: 'rgba(0,0,0,0.04)' },
    interactive: { selected: '#E8E6DC', hover: '#F5F4ED', successTint: '#E9F1DC' },
  },
  'gpt': {
    mode: 'dark' as const,
    bg: { primary: '#212121', secondary: '#171717', surface: '#2F2F2F', elevated: '#424242', inset: '#171717', badge: '#1A3A2A' },
    text: { primary: '#ECECEC', secondary: '#D1D1D1', muted: '#9B9B9B', subtle: '#7A7A7A', dim: '#5A5A5A', onAccent: '#FFFFFF' },
    accent: { primary: '#10A37F', light: '#1DC990', lighter: '#6DE4B8', dark: '#0D8A6A', userBubble: '#10A37F', assistantBubble: '#2F2F2F' },
    status: darkStatus, border: { default: '#444444', subtle: '#2F2F2F' },
    code: { text: '#D1D1D1', inline: '#1DC990', background: '#171717', lineNumber: '#5A5A5A', added: '#4ADE80', removed: '#F87171', blockOverlay: 'rgba(0,0,0,0.4)', inlineOverlay: 'rgba(0,0,0,0.2)' },
    interactive: { selected: '#1A3A2A', hover: '#2F2F2F', successTint: 'rgba(6, 78, 59, 0.3)' },
  },
  'midnight': {
    mode: 'dark' as const,
    bg: { primary: '#0A0A0A', secondary: '#050505', surface: '#18181B', elevated: '#1E293B', inset: '#050505', badge: '#1E293B' },
    text: { primary: '#FAFAFA', secondary: '#E2E8F0', muted: '#A1A1AA', subtle: '#71717A', dim: '#52525B', onAccent: '#FFFFFF' },
    accent: { primary: '#3B82F6', light: '#60A5FA', lighter: '#93C5FD', dark: '#2563EB', userBubble: '#3B82F6', assistantBubble: '#18181B' },
    status: darkStatus, border: { default: '#27272A', subtle: '#18181B' },
    code: { text: '#E2E8F0', inline: '#A5B4FC', background: '#0F172A', lineNumber: '#52525B', added: '#4ADE80', removed: '#F87171', blockOverlay: 'rgba(0,0,0,0.4)', inlineOverlay: 'rgba(0,0,0,0.2)' },
    interactive: { selected: '#1E3A5F', hover: '#18181B', successTint: 'rgba(6, 78, 59, 0.3)' },
  },
};

export type ThemeKey = keyof typeof themes;
export type ThemePalette = (typeof themes)[ThemeKey];

export const themeList: { key: ThemeKey; name: string; accent: string }[] = [
  { key: 'claude-code', name: 'claude code', accent: '#D97757' },
  { key: 'claude-chat', name: 'claude chat', accent: '#FAF9F5' },
  { key: 'gpt', name: 'gpt', accent: '#10A37F' },
  { key: 'midnight', name: 'midnight', accent: '#3B82F6' },
];
