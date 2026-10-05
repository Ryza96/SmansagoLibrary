// Recovery code — murni, tanpa DB. Alfabet 32 simbol tanpa karakter ambigu (tanpa 0,O,1,I,L).
import { randomBytes } from 'crypto'

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const GROUPS = 4
const GROUP_LEN = 4
const TOTAL_SYMBOLS = GROUPS * GROUP_LEN

// Pemetaan seragam tanpa modulo bias: reject byte >= floor(256/31)*31 = 248.
function uniformIndex(): number {
  for (;;) {
    const b = randomBytes(1)[0]
    if (b < 248) return b % ALPHABET.length
  }
}

export function generateRecoveryCode(): string {
  const chars: string[] = []
  for (let i = 0; i < TOTAL_SYMBOLS; i++) chars.push(ALPHABET[uniformIndex()])
  const groups: string[] = []
  for (let g = 0; g < GROUPS; g++) groups.push(chars.slice(g * GROUP_LEN, (g + 1) * GROUP_LEN).join(''))
  return groups.join('-')
}

export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '')
}

export function isWellFormedRecoveryCode(normalized: string): boolean {
  if (normalized.length !== TOTAL_SYMBOLS) return false
  for (const ch of normalized) {
    if (!ALPHABET.includes(ch)) return false
  }
  return true
}
