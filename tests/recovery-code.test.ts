import { describe, it, expect } from 'vitest'
import { generateRecoveryCode, normalizeRecoveryCode, isWellFormedRecoveryCode } from '../src/shared/utils/recovery-code'

describe('generateRecoveryCode', () => {
  it('(a) 1000 code unik, format valid, tanpa karakter ambigu', () => {
    const set = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const code = generateRecoveryCode()
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
      expect(code).not.toMatch(/[01OIL]/)
      expect(isWellFormedRecoveryCode(normalizeRecoveryCode(code))).toBe(true)
      set.add(code)
    }
    expect(set.size).toBe(1000)
  })

  it('(b) normalize menerima huruf kecil, spasi, tanpa tanda hubung', () => {
    expect(normalizeRecoveryCode('abcd-efgh-ijkl-mnop')).toBe('ABCDEFGHIJKLMNOP')
    expect(normalizeRecoveryCode('  abcd efgh ijkl mnop  ')).toBe('ABCDEFGHIJKLMNOP')
    expect(normalizeRecoveryCode('abcdefghijklmnop')).toBe('ABCDEFGHIJKLMNOP')
    expect(isWellFormedRecoveryCode('ABCDEFGHJKMNPQRS')).toBe(true)
    expect(isWellFormedRecoveryCode('ABC')).toBe(false)
  })
})
