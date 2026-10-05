import { describe, it, expect } from 'vitest'
import { validateRecoveryForm } from '../src/auth/recovery-validation'

describe('validateRecoveryForm', () => {
  it('wajib kode', () => {
    expect(validateRecoveryForm('', 'password123', 'password123').code).toBeDefined()
    expect(validateRecoveryForm('  ', 'password123', 'password123').code).toBeDefined()
  })

  it('password minimal 8', () => {
    expect(validateRecoveryForm('CODE', 'short', 'short').password).toBeDefined()
  })

  it('konfirmasi tidak sama', () => {
    expect(validateRecoveryForm('CODE', 'password123', 'password124').confirmPassword).toBeDefined()
  })

  it('valid', () => {
    expect(validateRecoveryForm('CODE', 'password123', 'password123')).toEqual({})
  })
})
