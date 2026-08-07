import { hash, verify } from '@node-rs/argon2'
import { ARGON2_ALGORITHM_ID, ARGON2_PARAMS, ARGON2_VERSION } from '../../shared/config/auth'

// Wrapper murni (RFC §11.1) — headless-testable; salt acak dihasilkan library
// dan ter-encode dalam PHC string. DILARANG plain text / MD5 / SHA (RFC §11.1).
const ARGON2_OPTIONS = {
  algorithm: ARGON2_ALGORITHM_ID,
  memoryCost: ARGON2_PARAMS.memoryCost,
  timeCost: ARGON2_PARAMS.timeCost,
  parallelism: ARGON2_PARAMS.parallelism,
  outputLen: ARGON2_PARAMS.outputLen
} as const

export interface Argon2HashMeta {
  algorithm: string
  version: number
  memoryCost: number
  timeCost: number
  parallelism: number
}

// Parse PHC string Argon2: $argon2id$v=19$m=65536,t=3,p=1$<salt>$<digest>.
// Murni (tanpa library) agar bisa diuji headless.
export function parseArgon2Phc(encoded: string): Argon2HashMeta | null {
  const match = /^\$(\w+)\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(encoded)
  if (!match) return null
  return {
    algorithm: match[1],
    version: Number(match[2]),
    memoryCost: Number(match[3]),
    timeCost: Number(match[4]),
    parallelism: Number(match[5])
  }
}

export class PasswordHasher {
  async hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS)
  }

  // verify via library = constant-time (RFC §11.2) — TIDAK pernah membandingkan
  // hash dengan `===`.
  async verify(encoded: string, password: string): Promise<boolean> {
    return verify(encoded, password)
  }

  // True bila hash tidak memakai algoritma/parameter Argon2id saat ini —
  // sinyal untuk re-hash saat login (RFC §11.1; v1 tanpa jalur re-hash otomatis).
  async needsRehash(encoded: string): Promise<boolean> {
    const meta = parseArgon2Phc(encoded)
    if (!meta) return true
    if (meta.algorithm !== 'argon2id') return true
    if (meta.version !== ARGON2_VERSION) return true
    if (meta.memoryCost !== ARGON2_PARAMS.memoryCost) return true
    if (meta.timeCost !== ARGON2_PARAMS.timeCost) return true
    if (meta.parallelism !== ARGON2_PARAMS.parallelism) return true
    return false
  }
}
