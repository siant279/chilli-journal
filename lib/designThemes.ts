export type DesignThemeId = 'sierra_sage' | 'warm_journal' | 'trail_soft'

export type DesignTheme = {
  id: DesignThemeId
  name: string
  tagline: string
  fonts: {
    sans: string
    serif: string
    label: string
  }
  radius: {
    card: number
    button: number
    pill: number
    stat: number
  }
  colors: {
    bg: string
    surface: string
    surfaceAlt: string
    ink: string
    inkLight: string
    muted: string
    border: string
    accent: string
    accentSoft: string
    headerBg: string
    headerText: string
    headerSub: string
    statValue: string
    navBg: string
    strava: string
    tagBg: string
    tagText: string
    shadow: string
  }
}

/** CSS custom properties for a scoped preview column */
export function themeToCssVars(theme: DesignTheme): Record<string, string> {
  return {
    '--preview-bg': theme.colors.bg,
    '--preview-surface': theme.colors.surface,
    '--preview-surface-alt': theme.colors.surfaceAlt,
    '--preview-ink': theme.colors.ink,
    '--preview-ink-light': theme.colors.inkLight,
    '--preview-muted': theme.colors.muted,
    '--preview-border': theme.colors.border,
    '--preview-accent': theme.colors.accent,
    '--preview-accent-soft': theme.colors.accentSoft,
    '--preview-header-bg': theme.colors.headerBg,
    '--preview-header-text': theme.colors.headerText,
    '--preview-header-sub': theme.colors.headerSub,
    '--preview-stat-value': theme.colors.statValue,
    '--preview-nav-bg': theme.colors.navBg,
    '--preview-strava': theme.colors.strava,
    '--preview-tag-bg': theme.colors.tagBg,
    '--preview-tag-text': theme.colors.tagText,
    '--preview-shadow': theme.colors.shadow,
    '--preview-font-sans': theme.fonts.sans,
    '--preview-font-serif': theme.fonts.serif,
    '--preview-font-label': theme.fonts.label,
    '--preview-radius-card': `${theme.radius.card}px`,
    '--preview-radius-button': `${theme.radius.button}px`,
    '--preview-radius-pill': `${theme.radius.pill}px`,
    '--preview-radius-stat': `${theme.radius.stat}px`,
  }
}

const INTER = 'var(--font-preview-inter), system-ui, sans-serif'
const LORA = 'var(--font-preview-lora), Georgia, serif'
const FRAUNCES = 'var(--font-preview-fraunces), Georgia, serif'
const SOURCE_SANS = 'var(--font-preview-source-sans), system-ui, sans-serif'

export const SIERRA_SAGE: DesignTheme = {
  id: 'sierra_sage',
  name: 'Sierra Sage',
  tagline: 'Portfolio-adjacent — clean white, sage accent, Inter + Lora',
  fonts: { sans: INTER, serif: LORA, label: INTER },
  radius: { card: 18, button: 12, pill: 999, stat: 12 },
  colors: {
    bg: '#ffffff',
    surface: '#fafbf9',
    surfaceAlt: '#f3f6f4',
    ink: '#141414',
    inkLight: '#3d3d3d',
    muted: '#6b7280',
    border: '#e8ebe9',
    accent: '#4a7c59',
    accentSoft: '#e8f0ea',
    headerBg: '#ffffff',
    headerText: '#141414',
    headerSub: '#6b7280',
    statValue: '#4a7c59',
    navBg: '#f6f8f7',
    strava: '#fc4c02',
    tagBg: '#e8f0ea',
    tagText: '#2d4a38',
    shadow: '0 4px 24px rgba(20, 40, 30, 0.06)',
  },
}

export const WARM_JOURNAL: DesignTheme = {
  id: 'warm_journal',
  name: 'Warm Journal',
  tagline: 'Parchment warmth — modern Inter body, forest accent, rounder cards',
  fonts: { sans: INTER, serif: LORA, label: INTER },
  radius: { card: 22, button: 14, pill: 999, stat: 14 },
  colors: {
    bg: '#f7f2e8',
    surface: '#fffdf7',
    surfaceAlt: '#ede8da',
    ink: '#160800',
    inkLight: '#3d2010',
    muted: '#9a7a5a',
    border: '#e0d4be',
    accent: '#3d6b4f',
    accentSoft: '#e4ede6',
    headerBg: '#f0ebe0',
    headerText: '#160800',
    headerSub: '#7a6048',
    statValue: '#3d6b4f',
    navBg: '#ede8da',
    strava: '#fc4c02',
    tagBg: '#f0e4d0',
    tagText: '#5a4030',
    shadow: '0 4px 20px rgba(22, 8, 0, 0.06)',
  },
}

export const TRAIL_SOFT: DesignTheme = {
  id: 'trail_soft',
  name: 'Trail Soft',
  tagline: 'Sierra sky — stone palette, Fraunces + Source Sans, airy & soft',
  fonts: { sans: SOURCE_SANS, serif: FRAUNCES, label: SOURCE_SANS },
  radius: { card: 24, button: 14, pill: 999, stat: 16 },
  colors: {
    bg: '#f4f3ef',
    surface: '#fafaf8',
    surfaceAlt: '#eceae4',
    ink: '#2c3440',
    inkLight: '#4a5568',
    muted: '#7a8494',
    border: '#ddd9d0',
    accent: '#5b7c99',
    accentSoft: '#e8eef4',
    headerBg: '#fafaf8',
    headerText: '#2c3440',
    headerSub: '#7a8494',
    statValue: '#5b7c99',
    navBg: '#eceae4',
    strava: '#fc4c02',
    tagBg: '#e8eef4',
    tagText: '#3d5568',
    shadow: '0 8px 32px rgba(44, 52, 64, 0.08)',
  },
}

export const DESIGN_THEMES: DesignTheme[] = [SIERRA_SAGE, WARM_JOURNAL, TRAIL_SOFT]
