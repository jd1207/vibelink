// claude code-inspired color palette
// warm terracotta accents, slightly warm dark backgrounds, slate text hierarchy

export const colors = {
  bg: {
    primary: '#1A1A1A',
    secondary: '#11100F',
    surface: '#1E1A17',
    elevated: '#2A2520',
    inset: '#0F0E0D',
    badge: '#2A1F17',
  },
  text: {
    primary: '#F8FAFC',
    secondary: '#E2E8F0',
    muted: '#94A3B8',
    subtle: '#64748B',
    dim: '#475569',
    cream: '#FBF0DF',
  },
  accent: {
    primary: '#D97757',
    light: '#E2A48B',
    lighter: '#FFB38A',
    dark: '#C15F3C',
  },
  status: {
    success: '#34D399',
    successDark: '#16A34A',
    error: '#EF4444',
    errorDark: '#DC2626',
    warning: '#FBBF24',
    warningDark: '#F59E0B',
    info: '#60A5FA',
  },
  border: {
    default: '#334155',
    subtle: '#2A2520',
  },
  code: {
    text: '#E2E8F0',
    inline: '#E2A48B',
    background: '#11100F',
    lineNumber: '#475569',
    added: '#4ADE80',
    removed: '#F87171',
  },
  interactive: {
    selected: '#3D2518',
    hover: '#2A2520',
  },
} as const;

export type Colors = typeof colors;
