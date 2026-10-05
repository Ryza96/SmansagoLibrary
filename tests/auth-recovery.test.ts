import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { AuthService } from '../src/main/services/auth.service'
import { AdminRepository } from '../src/main/repositories/admin.repository'
import { PasswordHasher } from '../src/main/services/password-hasher'
import { SessionManager } from '../src/main/services/session-manager'
import { AdminSessionRepository } from '../src/main/repositories/admin-session.repository'
import { RecoveryAttemptLimiter } from '../src/main/services/recovery-attempt-limiter'

const prisma = getPrisma()

let now = new Date('2026-10-06T10:00:00')
let service: AuthService

async function cleanup() {
  await prisma.adminSession.deleteMany()
  await prisma.admin.deleteMany()
}

beforeEach(async () => {
  await cleanup()
  now = new Date('2026-10-06T10:00:00')
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const adminRepo = new AdminRepository()
  const hasher = new PasswordHasher()
  const sessionRepo = new AdminSessionRepository()
  const sessionManager = new SessionManager(sessionRepo)
  const limiter = new RecoveryAttemptLimiter(() => new Date())
  service = new AuthService(adminRepo, hasher, sessionManager, limiter)
})

afterAll(async () => {
  vi.useRealTimers()
  await cleanup()
  await prisma.$disconnect()
})

describe('recovery code', () => {
  it('(c) issueRecoveryCode dengan password salah ditolak, hash tidak berubah', async () => {
    await service.setup({ username: 'admin', password: 'password123' })
    const before = (await prisma.admin.findFirst())!.recoveryCodeHash
    await expect(service.issueRecoveryCode('wrong')).rejects.toThrow()
    const after = (await prisma.admin.findFirst())!.recoveryCodeHash
    expect(after).toBe(before)
  })

  it('(d) issue lalu reset: password baru bisa login, sesi lama dicabut, code lama tak bisa, code baru ada', async () => {
    const setup = await service.setup({ username: 'admin', password: 'password123' })
    const firstCode = setup.recoveryCode!
    const issued = await service.issueRecoveryCode('password123')
    const code = issued.recoveryCode

    const reset = await service.resetPasswordWithRecoveryCode({ code, newPassword: 'newpassword456' })
    expect(reset.recoveryCode).toBeDefined()

    // semua sesi lama dicabut
    expect(await prisma.adminSession.count()).toBe(0)

    // password lama tidak bisa login, password baru bisa
    await expect(service.login({ password: 'password123' })).rejects.toThrow()
    await expect(service.login({ password: 'newpassword456' })).resolves.toBeDefined()

    // code lama tidak bisa dipakai lagi
    await expect(service.resetPasswordWithRecoveryCode({ code, newPassword: 'another789' })).rejects.toThrow('Kode pemulihan tidak valid.')

    // code baru bisa dipakai
    await expect(
      service.resetPasswordWithRecoveryCode({ code: reset.recoveryCode, newPassword: 'another789' })
    ).resolves.toBeDefined()
  })

  it('(e) code salah → error generik; admin tanpa recovery code → error generik sama', async () => {
    await service.setup({ username: 'admin', password: 'password123' })
    const fresh = new AuthService(new AdminRepository(), new PasswordHasher(), new SessionManager(new AdminSessionRepository()), new RecoveryAttemptLimiter())
    await expect(fresh.resetPasswordWithRecoveryCode({ code: 'AAAA-BBBB-CCCC-DDDD', newPassword: 'x' })).rejects.toThrow('Kode pemulihan tidak valid.')
    // hapus hash → admin tanpa recovery code → error sama
    await prisma.admin.updateMany({ data: { recoveryCodeHash: null } })
    await expect(fresh.resetPasswordWithRecoveryCode({ code: 'AAAA-BBBB-CCCC-DDDD', newPassword: 'x' })).rejects.toThrow('Kode pemulihan tidak valid.')
  })

  it('(f) 5 kegagalan → terkunci; code benar ditolak; setelah 15 menit bisa', async () => {
    const setup = await service.setup({ username: 'admin', password: 'password123' })
    const code = setup.recoveryCode!
    const fresh = new AuthService(new AdminRepository(), new PasswordHasher(), new SessionManager(new AdminSessionRepository()), new RecoveryAttemptLimiter(() => new Date()))
    for (let i = 0; i < 5; i++) {
      await expect(fresh.resetPasswordWithRecoveryCode({ code: 'AAAA-BBBB-CCCC-DDDD', newPassword: 'x' })).rejects.toThrow()
    }
    // code benar pun ditolak saat terkunci
    await expect(fresh.resetPasswordWithRecoveryCode({ code, newPassword: 'newpassword456' })).rejects.toThrow(/Coba lagi dalam/)
    // maju 15 menit
    now = new Date(now.getTime() + 15 * 60 * 1000 + 1000)
    vi.setSystemTime(now)
    await expect(fresh.resetPasswordWithRecoveryCode({ code, newPassword: 'newpassword456' })).resolves.toBeDefined()
  })

  it('(g) newPassword melanggar kebijakan → ditolak, password & code tidak berubah, limiter tidak mengunci salah', async () => {
    const setup = await service.setup({ username: 'admin', password: 'password123' })
    const code = setup.recoveryCode!
    const hashBefore = (await prisma.admin.findFirst())!.recoveryCodeHash
    await expect(service.resetPasswordWithRecoveryCode({ code, newPassword: '123' })).rejects.toThrow()
    const admin = await prisma.admin.findFirst()
    expect(admin!.passwordHash).not.toBe(await new PasswordHasher().hash('123'))
    expect(admin!.recoveryCodeHash).toBe(hashBefore)
    // tidak mengunci limiter → code benar masih diterima
    await expect(service.resetPasswordWithRecoveryCode({ code, newPassword: 'newpassword456' })).resolves.toBeDefined()
  })

  it('(h) hash di DB bukan teks code asli', async () => {
    const setup = await service.setup({ username: 'admin', password: 'password123' })
    const admin = await prisma.admin.findFirst()
    expect(admin!.recoveryCodeHash).not.toContain(setup.recoveryCode!)
    expect(admin!.recoveryCodeHash).toContain('$argon2id$')
  })

  it('(i) setup menghasilkan code valid untuk reset', async () => {
    const setup = await service.setup({ username: 'admin', password: 'password123' })
    expect(setup.recoveryCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    await expect(
      service.resetPasswordWithRecoveryCode({ code: setup.recoveryCode!, newPassword: 'newpassword456' })
    ).resolves.toBeDefined()
  })
})
