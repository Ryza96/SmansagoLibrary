export const ActorType = {
  SYSTEM: 'SYSTEM',
  USER: 'USER',
} as const

export type ActorType = (typeof ActorType)[keyof typeof ActorType]
