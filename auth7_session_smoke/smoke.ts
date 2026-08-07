import { AuthService } from '../src/main/services/auth.service'
import { AdminRepository } from '../src/main/repositories/admin.repository'
import { AdminSessionRepository } from '../src/main/repositories/admin-session.repository'
import { PasswordHasher } from '../src/main/services/password-hasher'
import { SessionManager } from '../src/main/services/session-manager'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { SESSION_CONFIG } from '../src/shared/config/session'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function expectEqual<T>(name: string, actual: T, expected: T): void {
  check(name, actual === expected, `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`)
}

async function expectRejected(name: string, fn: () => Promise<unknown>, messagePart: string): Promise<void> {
  try {
    await fn()
    check(name, false, 'seharusnya ditolak, tetapi berhasil')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    check(name, msg.includes(messagePart), `message="${msg}"`)
  }
}

async function main(): Promise<void> {
  const prisma = getPrisma()
  const repo = new AdminSessionRepository()
  const hasher = new PasswordHasher()
  const adminRepo = new AdminRepository()

  console.log('--- STEP 1: SESSION_CONFIG + token format (murni) ---')
  expectEqual('tokenBytes == 32', SESSION_CONFIG.tokenBytes, 32)
  expectEqual('ttlHours == 24', SESSION_CONFIG.ttlHours, 24)

  console.log('--- STEP 2: kondisi awal DB kosong ---')
  expectEqual('count session 0', await repo.count(), 0)
  const svc = new AuthService(adminRepo, hasher, new SessionManager(new AdminSessionRepository()))
  const st0 = await svc.status()
  expectEqual('needsSetup true', st0.needsSetup, true)
  expectEqual('authenticated false', st0.authenticated, false)

  console.log('--- STEP 3: open persist=false (in-memory murni, tanpa DB) ---')
  const smMem = new SessionManager(new AdminSessionRepository())
  await smMem.open({ id: 'tidak-ada-di-db', username: 'X' }, false)
  expectEqual('open persist=false tanpa FK error -> authenticated', smMem.isAuthenticated(), true)
  expectEqual('tidak ada row DB', await repo.count(), 0)
  await smMem.close()
  expectEqual('close -> authenticated false', smMem.isAuthenticated(), false)

  console.log('--- STEP 4: setup persist ke DB ---')
  await svc.setup({ username: 'Kepala Perpus', password: 'Password@123' })
  expectEqual('count session 1', await repo.count(), 1)
  const stSetup = await svc.status()
  expectEqual('setelah setup authenticated true', stSetup.authenticated, true)
  expectEqual('username tampil', stSetup.username, 'Kepala Perpus')
  const dto = JSON.stringify(stSetup)
  expectEqual('DTO status TIDAK membocorkan sessionId/token', dto.includes('sessionId'), false)
  const row1 = await repo.findLatestValid()
  check('row DB ada', row1 !== null, '')
  check('token base64url 43 karakter', row1 ? /^[A-Za-z0-9_-]{43}$/.test(row1.sessionId) : false, row1?.sessionId)
  const stLogin = JSON.stringify(await svc.login({ username: 'kepala perpus', password: 'Password@123' }))
  expectEqual('DTO login TIDAK membocorkan sessionId/token', stLogin.includes('sessionId'), false)

  console.log('--- STEP 5: restart simulation (mirror baru + load) ---')
  const sm2 = new SessionManager(new AdminSessionRepository())
  expectEqual('mirror baru kosong', sm2.isAuthenticated(), false)
  const loaded = await sm2.load()
  check('load memulihkan session', loaded !== null, '')
  if (loaded) {
    expectEqual('sessionId sama dengan row DB terbaru', loaded.sessionId, (await repo.findLatestValid())?.sessionId)
    expectEqual('username ter-restore', loaded.username, 'Kepala Perpus')
    expectEqual('expiresAt ~24 jam ke depan', loaded.expiresAt.getTime() > Date.now() + 23 * 60 * 60 * 1000, true)
    expectEqual('isAuthenticated setelah load', sm2.isAuthenticated(), true)
  }

  console.log('--- STEP 6: status() auto-restore pada proses baru ---')
  const svc2 = new AuthService(adminRepo, hasher, new SessionManager(new AdminSessionRepository()))
  const stRestored = await svc2.status()
  expectEqual('status pada proses baru authenticated true', stRestored.authenticated, true)
  expectEqual('username ter-restore', stRestored.username, 'Kepala Perpus')
  expectEqual('needsSetup false (admin tetap ada)', stRestored.needsSetup, false)

  console.log('--- STEP 7: login replace (maksimal satu session) ---')
  const idBefore = row1?.sessionId
  await svc2.login({ username: 'KEPALA PERPUS', password: 'Password@123' })
  expectEqual('count tetap 1 (replace)', await repo.count(), 1)
  const row2 = await repo.findLatestValid()
  check('sessionId baru berbeda dari lama', row2 !== null && row2.sessionId !== idBefore, '')
  const loadedMirror = await new SessionManager(new AdminSessionRepository()).load()
  check('row DB == session aktif (load konsisten)', loadedMirror?.sessionId === row2?.sessionId, '')

  console.log('--- STEP 8: changePassword menjaga session & row tetap ---')
  await svc2.changePassword({ currentPassword: 'Password@123', newPassword: 'Password@456' })
  expectEqual('count tetap 1', await repo.count(), 1)
  const loadedAfter = await new SessionManager(new AdminSessionRepository()).load()
  check('session tetap valid setelah changePassword', loadedAfter !== null && loadedAfter.sessionId === row2?.sessionId, '')
  await expectRejected(
    'login password LAMA ditolak',
    () => svc2.login({ username: 'kepala perpus', password: 'Password@123' }),
    'Username atau password salah'
  )
  const loginNew = await svc2.login({ username: 'kepala perpus', password: 'Password@456' })
  expectEqual('login password baru sukses', loginNew.authenticated, true)

  console.log('--- STEP 9: logout menghapus row ---')
  await svc2.logout()
  expectEqual('count session 0 setelah logout', await repo.count(), 0)
  const loadedNull = await new SessionManager(new AdminSessionRepository()).load()
  expectEqual('load setelah logout -> null', loadedNull, null)
  const svc3 = new AuthService(adminRepo, hasher, new SessionManager(new AdminSessionRepository()))
  const stAfter = await svc3.status()
  expectEqual('status setelah logout authenticated false', stAfter.authenticated, false)
  expectEqual('needsSetup tetap false', stAfter.needsSetup, false)

  console.log('--- STEP 10: expired row ditolak (TTL absolute) ---')
  const adminRow = await prisma.admin.findFirst()
  check('admin ada di DB', adminRow !== null, '')
  if (adminRow) {
    await repo.create({
      sessionId: 'expired-token-00000000000000000000000000000000000',
      adminId: adminRow.id,
      expiresAt: new Date(Date.now() - 1000)
    })
    expectEqual('count 1 (row expired ada)', await repo.count(), 1)
    const loadExpired = await new SessionManager(new AdminSessionRepository()).load()
    expectEqual('load menolak row expired -> null', loadExpired, null)
    const svc4 = new AuthService(adminRepo, hasher, new SessionManager(new AdminSessionRepository()))
    const stExp = await svc4.status()
    expectEqual('status authenticated false (row expired)', stExp.authenticated, false)
    // Login berikutnya: deleteExpired prune row basi lalu create row baru.
    await svc4.login({ username: 'kepala perpus', password: 'Password@456' })
    expectEqual('login prune expired + buat baru -> count 1', await repo.count(), 1)
    const row3 = await repo.findLatestValid()
    check('row baru valid (expiresAt > now)', row3 !== null && row3.expiresAt.getTime() > Date.now(), '')
  }

  console.log('--- STEP 11: AdminSessionRepository (unit DB) ---')
  if (adminRow) {
    await repo.create({
      sessionId: 'token-A-0000000000000000000000000000000000000',
      adminId: adminRow.id,
      expiresAt: new Date(Date.now() + 60_000)
    })
    await repo.create({
      sessionId: 'token-B-0000000000000000000000000000000000000',
      adminId: adminRow.id,
      expiresAt: new Date(Date.now() + 60_000)
    })
    expectEqual('count 3 (row3 + token-A + token-B)', await repo.count(), 3)
    expectEqual('findValidBySessionId match', (await repo.findValidBySessionId('token-A-0000000000000000000000000000000000000'))?.sessionId, 'token-A-0000000000000000000000000000000000000')
    expectEqual('findValidBySessionId tak match -> null', await repo.findValidBySessionId('token-X'), null)
    await repo.deleteBySessionId('token-A-0000000000000000000000000000000000000')
    expectEqual('deleteBySessionId -> count 2', await repo.count(), 2)
    await repo.deleteByAdminId(adminRow.id)
    expectEqual('deleteByAdminId -> count 0', await repo.count(), 0)
    await repo.create({
      sessionId: 'expired-prune-0000000000000000000000000000000000',
      adminId: adminRow.id,
      expiresAt: new Date(Date.now() - 5000)
    })
    expectEqual('count 1 (expired utk prune)', await repo.count(), 1)
    await repo.deleteExpired()
    expectEqual('deleteExpired -> count 0', await repo.count(), 0)
  }

  console.log('--- STEP 12: tutup (login ulang utk state konsisten) ---')
  const finalLogin = await svc3.login({ username: 'kepala perpus', password: 'Password@456' })
  expectEqual('login ulang sukses', finalLogin.authenticated, true)
  expectEqual('count session 1', await repo.count(), 1)

  await prisma.$disconnect()
  console.log('')
  console.log(`RESULT: ${pass} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('SMOKE ERROR:', e)
  process.exit(1)
})
