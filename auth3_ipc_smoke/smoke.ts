import { createRequire } from 'node:module'
import { AuthService } from '../src/main/services/auth.service'
import { AdminRepository } from '../src/main/repositories/admin.repository'
import { AdminSessionRepository } from '../src/main/repositories/admin-session.repository'
import { PasswordHasher } from '../src/main/services/password-hasher'
import { SessionManager } from '../src/main/services/session-manager'
import { getPrisma } from '../src/main/repositories/base/prisma'
import type { AuthStatusDTO, ChangePasswordDTO, LoginAdminDTO, SetupAdminDTO } from '../src/shared/dto/auth'

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

async function expectRejected(
  name: string,
  fn: () => Promise<unknown>,
  messagePart: string,
  statusCode?: number
): Promise<void> {
  try {
    await fn()
    check(name, false, 'seharusnya ditolak, tetapi berhasil')
  } catch (e) {
    const err = e as { message?: string; statusCode?: number }
    const msg = err.message ?? String(e)
    const codeOk = statusCode === undefined || err.statusCode === statusCode
    check(name, msg.includes(messagePart) && codeOk, `message="${msg}" statusCode=${String(err.statusCode)}`)
  }
}

// --- Fake electron: menangkap registrasi ipcMain.handle & panggilan ipcRenderer.invoke ---
type IpcHandler = (...args: unknown[]) => unknown

const registeredChannels = new Map<string, IpcHandler>()
const invokedCalls: { channel: string; args: unknown[] }[] = []

const fakeElectron = {
  ipcMain: {
    handle: (channel: string, handler: IpcHandler): void => {
      registeredChannels.set(channel, handler)
    }
  },
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
      invokedCalls.push({ channel, args })
      return Promise.resolve(undefined)
    }
  }
}

// Pasang hook SEBELUM require dinamis auth.ipc/auth.preload.
// Catatan: jangan `import * as Module from 'module'` — tsc commonjs meng-emit
// namespace object (getter-only _load). Ambil class Module via `req('module')`.
type NodeLoadHook = (request: string, parent: NodeModule, isMain: boolean) => unknown

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = registeredChannels.get(channel)
  if (!handler) throw new Error(`channel tidak terdaftar: ${channel}`)
  return handler(undefined, ...args)
}

async function main(): Promise<void> {
  const req = createRequire(__filename)
  const nodeModule = req('module') as unknown as { _load: NodeLoadHook }
  const originalLoad = nodeModule._load
  nodeModule._load = function (request: string, parent: NodeModule, isMain: boolean): unknown {
    if (request === 'electron') return fakeElectron
    return originalLoad(request, parent, isMain)
  }

  const prisma = getPrisma()

  const service = new AuthService(new AdminRepository(), new PasswordHasher(), new SessionManager(new AdminSessionRepository()))

  console.log('--- STEP 1: kontrak channel (RFC §4.1) ---')
  const { registerAuthHandlers } = req('../electron/ipc/auth.ipc') as {
    registerAuthHandlers: (svc: AuthService) => void
  }
  registerAuthHandlers(service)
  const expectedChannels = ['auth:status', 'auth:setup', 'auth:login', 'auth:logout', 'auth:changePassword']
  expectEqual('jumlah channel terdaftar', registeredChannels.size, 5)
  for (const ch of expectedChannels) {
    check(`channel terdaftar: ${ch}`, registeredChannels.has(ch))
  }
  for (const key of registeredChannels.keys()) {
    check(`tidak ada channel non-auth (${key})`, key.startsWith('auth:'), key)
  }

  console.log('--- STEP 2: auth:status (DB kosong) ---')
  const st0 = (await invoke('auth:status')) as AuthStatusDTO
  expectEqual('needsSetup true (DB kosong)', st0.needsSetup, true)
  expectEqual('authenticated false', st0.authenticated, false)
  expectEqual('username kosong (belum login)', st0.username, undefined)
  check('status DTO tidak membocorkan secret', !('passwordHash' in st0) && !('sessionId' in st0), '')

  console.log('--- STEP 3: auth:setup ---')
  const setupResult = (await invoke('auth:setup', {
    username: 'Kepala Perpus',
    password: 'Password@123'
  })) as { authenticated: boolean; username: string }
  expectEqual('setup berhasil -> authenticated true', setupResult.authenticated, true)
  expectEqual('setup -> username', setupResult.username, 'Kepala Perpus')
  check('setup DTO tidak membocorkan secret', !('passwordHash' in setupResult) && !('sessionId' in setupResult), '')
  const st1 = (await invoke('auth:status')) as AuthStatusDTO
  expectEqual('status setelah setup needsSetup false', st1.needsSetup, false)
  expectEqual('status setelah setup authenticated true', st1.authenticated, true)

  console.log('--- STEP 4: auth:setup ulang ditolak (AppError 400 lolos handler) ---')
  await expectRejected(
    'setup ulang ditolak',
    () => invoke('auth:setup', { username: 'Lain', password: 'Password@456' }),
    'Setup admin sudah pernah dilakukan',
    400
  )

  console.log('--- STEP 5: auth:login (Opsi B: password-only) ---')
  await invoke('auth:logout')
  await expectRejected(
    'login password salah (pesan seragam)',
    () => invoke('auth:login', { password: 'Salah@123' }),
    'Username atau password salah',
    401
  )
  await expectRejected(
    'login password salah dgn username (username diabaikan)',
    () => invoke('auth:login', { username: 'Kepala Perpus', password: 'Salah@123' }),
    'Username atau password salah',
    401
  )
  const login = (await invoke('auth:login', { password: 'Password@123' })) as {
    authenticated: boolean
    username: string
  }
  expectEqual('login password-only sukses', login.authenticated, true)
  expectEqual('login -> username asli', login.username, 'Kepala Perpus')
  // Username diinput DIIMPANGGAP (single-admin resolve): sembarang username
  // + password benar tetap sukses.
  const loginIgnored = (await invoke('auth:login', {
    username: 'oranglain',
    password: 'Password@123'
  })) as { authenticated: boolean; username: string }
  expectEqual('login username diabaikan -> sukses', loginIgnored.authenticated, true)

  console.log('--- STEP 6: auth:changePassword ---')
  await invoke('auth:logout')
  await expectRejected(
    'changePassword tanpa session ditolak',
    () => invoke('auth:changePassword', { currentPassword: 'Password@123', newPassword: 'Password@456' }),
    'Sesi tidak aktif',
    401
  )
  await invoke('auth:login', { password: 'Password@123' })
  await expectRejected(
    'changePassword password lama salah',
    () => invoke('auth:changePassword', { currentPassword: 'Salah@123', newPassword: 'Password@456' }),
    'Password lama tidak sesuai',
    400
  )
  const ch = (await invoke('auth:changePassword', {
    currentPassword: 'Password@123',
    newPassword: 'Password@456'
  })) as { ok: boolean }
  expectEqual('changePassword sukses -> ok true', ch.ok, true)

  console.log('--- STEP 7: auth:logout idempoten ---')
  const lo1 = (await invoke('auth:logout')) as { ok: boolean }
  expectEqual('logout -> ok true', lo1.ok, true)
  const lo2 = (await invoke('auth:logout')) as { ok: boolean }
  expectEqual('logout kedua tetap ok (idempoten)', lo2.ok, true)
  const st2 = (await invoke('auth:status')) as AuthStatusDTO
  expectEqual('status authenticated false', st2.authenticated, false)
  expectEqual('status needsSetup false (admin tetap ada)', st2.needsSetup, false)

  console.log('--- STEP 8: kontrak preload (RFC §4.4 authAPI) ---')
  const { authAPI } = req('../electron/preload/auth.preload') as {
    authAPI: {
      auth: {
        status: () => Promise<unknown>
        setup: (i: SetupAdminDTO) => Promise<unknown>
        login: (i: LoginAdminDTO) => Promise<unknown>
        logout: () => Promise<unknown>
        changePassword: (i: ChangePasswordDTO) => Promise<unknown>
      }
    }
  }
  const setupInput: SetupAdminDTO = { username: 'u', password: 'p' }
  const loginInput: LoginAdminDTO = { username: 'u', password: 'p' }
  const changeInput: ChangePasswordDTO = { currentPassword: 'a', newPassword: 'b' }
  await authAPI.auth.status()
  await authAPI.auth.setup(setupInput)
  await authAPI.auth.login(loginInput)
  await authAPI.auth.logout()
  await authAPI.auth.changePassword(changeInput)

  expectEqual('jumlah panggilan invoke', invokedCalls.length, 5)
  check('status -> channel auth:status tanpa arg', invokedCalls[0].channel === 'auth:status' && invokedCalls[0].args.length === 0, JSON.stringify(invokedCalls[0]))
  check('setup -> channel auth:setup dgn input', invokedCalls[1].channel === 'auth:setup' && invokedCalls[1].args[0] === setupInput, JSON.stringify(invokedCalls[1]))
  check('login -> channel auth:login dgn input', invokedCalls[2].channel === 'auth:login' && invokedCalls[2].args[0] === loginInput, JSON.stringify(invokedCalls[2]))
  check('logout -> channel auth:logout tanpa arg', invokedCalls[3].channel === 'auth:logout' && invokedCalls[3].args.length === 0, JSON.stringify(invokedCalls[3]))
  check('changePassword -> channel auth:changePassword dgn input', invokedCalls[4].channel === 'auth:changePassword' && invokedCalls[4].args[0] === changeInput, JSON.stringify(invokedCalls[4]))

  const secretLeaks = invokedCalls
    .flatMap((c) => c.args)
    .filter((a): a is Record<string, unknown> => a !== null && typeof a === 'object')
    .flatMap((a) => Object.keys(a))
  check('tidak ada passwordHash/sessionId di argumen IPC', !secretLeaks.includes('passwordHash') && !secretLeaks.includes('sessionId'), secretLeaks.join(','))

  await prisma.$disconnect()
  console.log('')
  console.log(`RESULT: ${pass} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('SMOKE ERROR:', e)
  process.exit(1)
})
