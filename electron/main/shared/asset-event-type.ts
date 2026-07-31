export const AssetEventType = {
  COPY_CREATED: 'COPY_CREATED',
  CONDITION_CHANGED: 'CONDITION_CHANGED',
} as const

export type AssetEventType = (typeof AssetEventType)[keyof typeof AssetEventType]
