export const EDUCATION_LEVELS = new Set(['X', 'XI', 'XII'])

const EDUCATION_LEVEL_ORDER: Record<string, number> = {
  X: 1,
  XI: 2,
  XII: 3
}

export function levelOrder(level: string): number {
  return EDUCATION_LEVEL_ORDER[level] ?? NaN
}
