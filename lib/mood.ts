export const MOOD_STYLES: Record<
  string,
  { emoji: string; color: string; border: string; label: string }
> = {
  EPIC: { emoji: '🐺', color: '#5b21b6', border: '#7c3aed', label: 'EPIC' },
  EXCELLENT: { emoji: '⭐', color: '#92400e', border: '#d97706', label: 'EXCELLENT' },
  SOLID: { emoji: '🐾', color: '#065f46', border: '#10b981', label: 'SOLID' },
  SUSPICIOUS: { emoji: '🐿️', color: '#7f1d1d', border: '#ef4444', label: 'SUSPICIOUS' },
  CHAOTIC: { emoji: '🌪️', color: '#0e7490', border: '#06b6d4', label: 'CHAOTIC' },
}

export function getMoodStyle(mood: string) {
  return MOOD_STYLES[mood] || MOOD_STYLES.SOLID
}
