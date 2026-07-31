export const BookCopyCondition = {
  GOOD: 'GOOD',
  LIGHT_DAMAGE: 'LIGHT_DAMAGE',
  HEAVY_DAMAGE: 'HEAVY_DAMAGE',
} as const

export type BookCopyCondition = (typeof BookCopyCondition)[keyof typeof BookCopyCondition]