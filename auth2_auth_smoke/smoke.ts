import { AuthService } from '../src/main/services/auth.service'
import { AdminRepository } from '../src/main/repositories/admin.repository'
import { AdminSessionRepository } from '../src/main/repositories/admin-session.repository'
import { PasswordHasher, parseArgon2Phc } from '../src/main/services/password-hasher'
import { SessionManager } from '../src/main/services/session-manager'
import { validatePassword, isValidPassword } from '../src/main/services/password-policy'
import { getPrisma } from '../src/main/repositories/base/prisma'
import { PASSWORD_POLICY, ARGON2_PARAMS, ARGON2_VERSION } from '../src/shared/config/auth'

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
  const hasher = new PasswordHasher()

  console.log('--- STEP 1: password policy (murni) ---')
  expectEqual('min 8', isValidPassword('abcdefgh'), true)
  expectEqual('exact 8', isValidPassword('12345678'), true)
  expectEqual('7 ditolak', isValidPassword('1234567'), false)
  expectEqual('7 -> pesan', validatePassword('1234567'), 'Password minimal 8 karakter')
  expectEqual('129 ditolak', isValidPassword('a'.repeat(129)), false)
  expectEqual('128 valid', isValidPassword('a'.repeat(128)), true)
  expectEqual('128 -> pesan null', validatePassword('a'.repeat(128)), null)
  expectEqual('tanpa syarat kompleksitas (angka saja diterima)', isValidPassword('12345678'), true)
  expectEqual('tanpa syarat kompleksitas (simbol saja diterima)', isValidPassword('!!!!!!!!'), true)
  expectEqual('tanpa syarat kompleksitas (huruf kecil saja diterima)', isValidPassword('abcdefgh'), true)

  console.log('--- STEP 2: PasswordHasher (Argon2id via @node-rs/argon2) ---')
  const hash1 = await hasher.hash('s3cureP@ss')
  check('hash berformat PHC argon2id', hash1.startsWith('$argon2id$'), `hash=${hash1.slice(0, 20)}...`)
  const meta = parseArgon2Phc(hash1)
  check('parseArgon2Phc ok', meta !== null)
  if (meta) {
    expectEqual('algorithm', meta.algorithm, 'argon2id')
    expectEqual('version', meta.version, ARGON2_VERSION)
    expectEqual('memoryCost (KB)', meta.memoryCost, ARGON2_PARAMS.memoryCost)
    expectEqual('timeCost', meta.timeCost, ARGON2_PARAMS.timeCost)
    expectEqual('parallelism', meta.parallelism, ARGON2_PARAMS.parallelism)
  }
  check('verify benar', await hasher.verify(hash1, 's3cureP@ss'), '')
  check('verify salah', (await hasher.verify(hash1, 'wrongPass1')) === false, '')
  check('needsRehash false (param sekarang)', (await hasher.needsRehash(hash1)) === false, '')
  check('needsRehash true (argon2i)', await hasher.needsRehash('$argon2i$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$c29tZXNhbHQ='), '')
  check('needsRehash true (memoryCost lama)', await hasher.needsRehash('$argon2id$v=19$m=4096,t=3,p=1$c29tZXNhbHQ$c29tZXNhbHQ='), '')
  check('needsRehash true (version lama)', await hasher.needsRehash('$argon2id$v=16$m=65536,t=3,p=1$c29tZXNhbHQ$c29tZXNhbHQ='), '')
  check('hash unik tiap pemanggilan (salt acak)', hash1 !== (await hasher.hash('s3cureP@ss')), '')
  const hash2 = await hasher.hash('s3cureP@ss')
  check('dua hash password sama tetap verify', await hasher.verify(hash2, 's3cureP@ss'), '')
  check('parseArgon2Phc format rusak -> null', parseArgon2Phc('bukan-hash') === null, '')

  console.log('--- STEP 3: SessionManager (in-memory, persist=false) ---')
  const sm = new SessionManager(new AdminSessionRepository())
  expectEqual('awal belum autentikasi', sm.isAuthenticated(), false)
  expectEqual('currentAdmin awal null', sm.currentAdmin(), null)
  // persist=false: admin id 'a1' belum ada di DB (uji murni in-memory, tanpa FK).
  const s1 = await sm.open({ id: 'a1', username: 'Admin' }, false)
  check('session id terisi', s1.sessionId !== '', '')
  expectEqual('currentAdmin', sm.currentAdmin()?.username, 'Admin')
  expectEqual('isAuthenticated setelah open', sm.isAuthenticated(), true)
  const s2 = await sm.open({ id: 'a1', username: 'Admin' }, false)
  check('open kedua replace session lama', s2.sessionId !== s1.sessionId, '')
  await sm.close()
  expectEqual('close -> false', sm.isAuthenticated(), false)
  expectEqual('close -> currentAdmin null', sm.currentAdmin(), null)

  console.log('--- STEP 4: AuthService — setup + status (DB kosong) ---')
  const repo = new AdminRepository()
  const service = new AuthService(repo, hasher, sm)
  const st0 = await service.status()
  expectEqual('status awal needsSetup true (DB kosong)', st0.needsSetup, true)
  expectEqual('status awal authenticated false', st0.authenticated, false)
  await expectRejected(
    'setup password pendek ditolak',
    () => service.setup({ username: 'X', password: 'pendek' }),
    'Password minimal 8 karakter'
  )
  const setup1 = await service.setup({ username: 'Kepala Perpus', password: 'Password@123' })
  expectEqual('setup berhasil -> authenticated true', setup1.authenticated, true)
  expectEqual('setup -> username', setup1.username, 'Kepala Perpus')
  expectEqual('status setelah setup needsSetup false', (await service.status()).needsSetup, false)
  expectEqual('status setelah setup authenticated true', (await service.status()).authenticated, true)
  expectEqual('status.username dari session', (await service.status()).username, 'Kepala Perpus')
  await expectRejected(
    'setup ulang ditolak (conflict)',
    () => service.setup({ username: 'Lain', password: 'Password@456' }),
    'Setup admin sudah pernah dilakukan'
  )

  console.log('--- STEP 5: AuthService — login (Opsi B: password-only) ---')
  await service.logout()
  expectEqual('logout dulu -> false', sm.isAuthenticated(), false)
  await expectRejected(
    'login password salah (pesan seragam)',
    () => service.login({ password: 'Salah@123' }),
    'Username atau password salah'
  )
  await expectRejected(
    'login password salah dgn username (username diabaikan, tetap ditolak)',
    () => service.login({ username: 'Kepala Perpus', password: 'Salah@123' }),
    'Username atau password salah'
  )
  const login1 = await service.login({ password: 'Password@123' })
  expectEqual('login password-only sukses', login1.authenticated, true)
  expectEqual('login -> username asli', login1.username, 'Kepala Perpus')
  expectEqual('status authenticated true', (await service.status()).authenticated, true)
  await service.logout()
  // Username pada input DIIMPANGGAP (single-admin resolve) — sembarang username
  // + password benar tetap sukses.
  const loginIgnored = await service.login({ username: 'oranglain', password: 'Password@123' })
  expectEqual('username diabaikan (single-admin resolve)', loginIgnored.authenticated, true)
  expectEqual('login ignored -> username asli', loginIgnored.username, 'Kepala Perpus')

  console.log('--- STEP 6: AuthService — changePassword ---')
  await service.logout()
  await expectRejected(
    'changePassword tanpa session ditolak',
    () => service.changePassword({ currentPassword: 'Password@123', newPassword: 'Password@456' }),
    'Sesi tidak aktif'
  )
  await service.login({ password: 'Password@123' })
  await expectRejected(
    'changePassword password lama salah',
    () => service.changePassword({ currentPassword: 'Salah@123', newPassword: 'Password@456' }),
    'Password lama tidak sesuai'
  )
  await expectRejected(
    'changePassword password baru pendek',
    () => service.changePassword({ currentPassword: 'Password@123', newPassword: 'pendek' }),
    'Password minimal 8 karakter'
  )
  const ch = await service.changePassword({ currentPassword: 'Password@123', newPassword: 'Password@456' })
  expectEqual('changePassword sukses -> ok true', ch.ok, true)
  expectEqual('session tetap aktif setelah changePassword', sm.isAuthenticated(), true)
  await service.logout()
  await expectRejected(
    'login password lama ditolak setelah ganti',
    () => service.login({ password: 'Password@123' }),
    'Username atau password salah'
  )
  const login2 = await service.login({ password: 'Password@456' })
  expectEqual('login password baru sukses', login2.authenticated, true)

  console.log('--- STEP 7: AuthService — logout idempoten ---')
  const lo1 = await service.logout()
  expectEqual('logout -> ok true', lo1.ok, true)
  const lo2 = await service.logout()
  expectEqual('logout kedua tetap ok (idempoten)', lo2.ok, true)
  expectEqual('status authenticated false', (await service.status()).authenticated, false)
  expectEqual('status needsSetup false (admin tetap ada)', (await service.status()).needsSetup, false)
  expectEqual('count admin tetap 1', await repo.count(), 1)

  console.log('--- STEP 8: AdminRepository (DB) ---')
  const created = await repo.create({
    username: '  KepalaPerpus  ',
    passwordHash: hash1,
    passwordChangedAt: new Date()
  })
  check('create: id terisi', created.id !== '', '')
  expectEqual('count == 2 (repo boleh create langsung)', await repo.count(), 2)
  expectEqual('findById', (await repo.findById(created.id))?.username, '  KepalaPerpus  ')
  expectEqual(
    'findByUsernameCaseInsensitive (match case beda)',
    (await repo.findByUsernameCaseInsensitive('kepalaperpus'))?.id,
    created.id
  )
  expectEqual(
    'findByUsernameCaseInsensitive (spasi tepi diabaikan)',
    (await repo.findByUsernameCaseInsensitive('  KEPALAPERPUS  '))?.id,
    created.id
  )
  expectEqual(
    'findByUsernameCaseInsensitive (tidak match)',
    await repo.findByUsernameCaseInsensitive('lain'),
    null
  )
  const updatedPw = await repo.updatePassword(created.id, hash2, new Date())
  expectEqual('updatePassword: hash berubah', updatedPw.passwordHash, hash2)
  const lastLogin = await repo.updateLastLogin(created.id)
  check('updateLastLogin: lastLoginAt terisi', lastLogin.lastLoginAt !== null, '')
  const single = await repo.findSingle()
  check('findSingle: admin ter-resolve (findFirst)', single !== null, '')
  expectEqual(
    'findSingle: deterministik — admin pertama dibuat (createdAt asc)',
    single?.username,
    'Kepala Perpus'
  )

  await prisma.$disconnect()
  console.log('')
  console.log(`RESULT: ${pass} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('SMOKE ERROR:', e)
  process.exit(1)
})
