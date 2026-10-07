/**
 * Tech-Blueprint Design Tokens & Semantic Classifications
 * (SPEC-PW-ZON-01 / TASK-PW-ZON-03)
 */

export const BLUEPRINT_COLORS = {
  navy: {
    950: '#0B132B',
    900: '#0A1128',
    800: '#14213D',
  },
  cornflower: {
    400: '#7AA7E8',
    500: '#4A90E2',
    600: '#6495ED',
  },
  cyan: {
    300: '#33EBFF',
    400: '#00E5FF',
    500: '#00FFFF',
  },
  warning: {
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
  },
} as const;

export const BLUEPRINT_FONTS = {
  mono: "'Roboto Mono', 'Courier', monospace",
  sans: "'Inter', 'SF Pro', system-ui, sans-serif",
} as const;

export const HTN_TRUST_STRING =
  '🔒 Horizon Trust Network (HTN) Data Standards Compliant | PostGIS Spatial Audit Active';
