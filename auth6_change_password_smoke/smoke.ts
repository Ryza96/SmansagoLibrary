// Smoke AUTH-6 — Ubah Password.
// Bagian A: validasi form murni (tanpa DB/Electron) — password lama wajib,
// password baru min 8 / maks 128, konfirmasi cocok.
// Bagian B: service-level pada fresh DB — salah lama, terlalu pendek, sukses,
// session tetap aktif, login lama gagal, login baru sukses.
// Bagian C: kontrak UI — ChangePasswordPage memakai auth.changePassword,
// loading state, anti double submit, error & success in-page, TANPA alert().

import * as fs from 'fs'
import * as path from 'path'
import { validateChangePasswordForm } from '../src/auth/change-password-validation'
import { AuthService } from '../src/main/services/auth.service'
import { AdminRepository } from '../src/main/repositories/admin.repository'
import { PasswordHasher } from '../src/main/services/password-hasher'
import { SessionManager } from '../src/main/services/session-manager'
import { getPrisma } from '../src/main/repositories/base/prisma'

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

const repoRoot = process.cwd()
function readRel(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8')
}

async function main(): Promise<void> {
  console.log('=== BAGIAN A: validasi form murni ===')
  const e1 = validateChangePasswordForm('', '', '')
  check(
    'semua kosong -> error lama + error min (konfirmasi tak ter-trigger, pola validateSetupForm)',
    !!e1.currentPassword && !!e1.newPassword && !e1.confirmPassword
  )

  const e2 = validateChangePasswordForm('', 'password1', 'password1')
  check('password lama kosong -> error lama', !!e2.currentPassword && !e2.newPassword && !e2.confirmPassword)
  check('pesan password lama kosong', e2.currentPassword === 'Password lama wajib diisi.')

  const e3 = validateChangePasswordForm('Password@123', '1234567', '1234567')
  check('password baru 7 karakter -> error min', e3.newPassword === 'Password minimal 8 karakter.')

  const e4 = validateChangePasswordForm('Password@123', '12345678', '12345678')
  check('password baru 8 karakter -> tanpa error', !e4.newPassword && !e4.confirmPassword && !e4.currentPassword)

  const e5 = validateChangePasswordForm('Password@123', 'a'.repeat(128), 'a'.repeat(128))
  check('password baru 128 karakter -> valid', !e5.newPassword)

  const e6 = validateChangePasswordForm('Password@123', 'a'.repeat(129), 'a'.repeat(129))
  check('password baru 129 karakter -> error max', e6.newPassword === 'Password maksimal 128 karakter.')

  const e7 = validateChangePasswordForm('Password@123', 'password1', 'password2')
  check('konfirmasi tidak sama -> error confirm', !!e7.confirmPassword)
  check(
    'pesan konfirmasi tidak sama',
    e7.confirmPassword === 'Password dan konfirmasi password tidak sama.'
  )

  const e8 = validateChangePasswordForm('Password@123', 'password1', 'password1')
  check('konfirmasi cocok -> tanpa error', !e8.currentPassword && !e8.newPassword && !e8.confirmPassword)

  const e9 = validateChangePasswordForm('', '1234567', 'x')
  check('kombinasi salah semua -> 3 error', !!e9.currentPassword && !!e9.newPassword && !!e9.confirmPassword)

  check(
    'validasi murni tanpa window/Electron',
    typeof globalThis.window === 'undefined'
  )

  console.log('=== BAGIAN B: service-level (fresh DB) ===')
  const prisma = getPrisma()
  const repo = new AdminRepository()
  const hasher = new PasswordHasher()
  const sm = new SessionManager()
  const service = new AuthService(repo, hasher, sm)

  const st0 = await service.status()
  expectEqual('status awal needsSetup true', st0.needsSetup, true)

  await service.setup({ username: 'Kepala Perpus', password: 'Password@123' })
  expectEqual('setup berhasil -> session aktif', sm.isAuthenticated(), true)

  service.logout()
  expectEqual('logout dulu -> session tidak aktif', sm.isAuthenticated(), false)
  await expectRejected(
    'changePassword tanpa session ditolak',
    () => service.changePassword({ currentPassword: 'Password@123', newPassword: 'Password@456' }),
    'Sesi tidak aktif'
  )

  await service.login({ username: 'Kepala Perpus', password: 'Password@123' })
  expectEqual('login ulang -> session aktif', sm.isAuthenticated(), true)

  await expectRejected(
    'changePassword password lama salah',
    () => service.changePassword({ currentPassword: 'Salah@123', newPassword: 'Password@456' }),
    'Password lama tidak sesuai'
  )
  await expectRejected(
    'changePassword password baru terlalu pendek',
    () => service.changePassword({ currentPassword: 'Password@123', newPassword: 'pendek' }),
    'Password minimal 8 karakter'
  )
  await expectRejected(
    'changePassword password baru terlalu panjang',
    () => service.changePassword({ currentPassword: 'Password@123', newPassword: 'a'.repeat(129) }),
    'Password maksimal 128 karakter'
  )
  check('gagal changePassword tidak menutup session', sm.isAuthenticated(), '')

  const ch = await service.changePassword({ currentPassword: 'Password@123', newPassword: 'Password@456' })
  expectEqual('changePassword sukses -> ok true', ch.ok, true)
  expectEqual('session tetap aktif setelah ganti', sm.isAuthenticated(), true)
  expectEqual('status masih authenticated', (await service.status()).authenticated, true)

  service.logout()
  await expectRejected(
    'login dengan password lama gagal',
    () => service.login({ username: 'Kepala Perpus', password: 'Password@123' }),
    'Username atau password salah'
  )
  const login2 = await service.login({ username: 'Kepala Perpus', password: 'Password@456' })
  expectEqual('login dengan password baru berhasil', login2.authenticated, true)
  expectEqual('username login baru', login2.username, 'Kepala Perpus')

  expectEqual('admin tetap satu baris', await repo.count(), 1)
  await prisma.$disconnect()

  console.log('=== BAGIAN C: kontrak UI ===')
  const page = readRel('src/pages/auth/ChangePasswordPage.tsx')
  check('ChangePasswordPage memanggil auth.changePassword', page.includes('window.electronAPI.auth.changePassword('))
  check('ChangePasswordPage tidak memakai alert()', !page.includes('alert(') && !page.includes('confirm('))
  check('ChangePasswordPage memakai validateChangePasswordForm', page.includes('validateChangePasswordForm'))
  check('ChangePasswordPage membaca error via authErrorMessageOf', page.includes('authErrorMessageOf(err, LABELS.AUTH.SUBMIT_ERROR_DEFAULT)'))
  check('ChangePasswordPage TIDAK memakai instanceof Error', !page.includes('instanceof Error'))

  check('tombol disabled saat submitting', page.includes('disabled={submitting}'))
  check('spinner dipakai (Loader2 + animate-spin)', page.includes('Loader2') && page.includes('animate-spin'))
  check('no double submit (guard submitting)', page.includes('if (submitting) return'))
  check('error tampil di halaman', page.includes('setSubmitError'))
  check('success tampil di halaman', page.includes('setChanged'))
  check('form reset setelah sukses', page.includes("setCurrentPassword('')") && page.includes("setNewPassword('')") && page.includes("setConfirmPassword('')"))

  const settings = readRel('src/pages/SettingsPage.tsx')
  check('kartu Ubah Password navigasi ke CHANGE_PASSWORD', settings.includes('navigate(ROUTES.CHANGE_PASSWORD)'))
  const comingSoonCount = settings.split('badge={LABELS.SETTINGS.COMING_SOON}').length - 1
  check(
    'kartu Ubah Password TIDAK lagi ber-badge COMING_SOON (sisa 2: Login Admin & Reset Data)',
    comingSoonCount === 2,
    `count=${comingSoonCount}`
  )

  const routes = readRel('src/routes/index.tsx')
  check("route 'settings/change-password' terdaftar", routes.includes("path: 'settings/change-password'"))
  check('ChangePasswordPage dipasang sebagai elemen route', routes.includes('element: <ChangePasswordPage />'))

  const nav = readRel('src/utils/navigation.ts')
  check('ROUTES.CHANGE_PASSWORD ada', nav.includes("CHANGE_PASSWORD: '/settings/change-password'"))

  const labels = readRel('src/utils/labels.ts')
  check('label CURRENT_PASSWORD', labels.includes("CURRENT_PASSWORD: 'Password Lama'"))
  check('label NEW_PASSWORD', labels.includes("NEW_PASSWORD: 'Password Baru'"))
  check('label ERR_CURRENT_PASSWORD_REQUIRED', labels.includes("ERR_CURRENT_PASSWORD_REQUIRED: 'Password lama wajib diisi.'"))
  check('label CHANGE_PASSWORD_TITLE', labels.includes("CHANGE_PASSWORD_TITLE: 'Ubah Password'"))
  check('label CHANGE_PASSWORD_SUCCESS', labels.includes("CHANGE_PASSWORD_SUCCESS: 'Password berhasil diubah. Session tetap aktif.'"))

  console.log('')
  console.log(`RESULT: ${pass} PASS, ${fail} FAIL`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('SMOKE ERROR:', e)
  process.exit(1)
})
