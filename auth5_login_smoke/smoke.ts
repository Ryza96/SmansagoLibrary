// Smoke AUTH-5 REVISI — Login Experience (renderer pure, tanpa DB/Electron).
// REVISI 1: renderer TIDAK bergantung pada `instanceof Error` — membaca kontrak
// DTO `AuthErrorDTO` (message, code bila tersedia).
// REVISI 2: Logout dipindah ke TopBar sebagai Account Action; Sidebar hanya
// berisi navigasi aplikasi.
// Menguji: validasi login, helper error DTO, kontrak UI (auth.login/logout,
// loading state, error in-page, TANPA alert()), dan AuthGate tetap penentu.

import * as fs from 'fs'
import * as path from 'path'
import { validateLoginForm } from '../src/auth/login-validation'
import {
  authErrorPayload,
  authErrorMessageOf,
  authErrorCodeOf,
  cleanAuthErrorMessage
} from '../src/auth/auth-error'

let pass = 0
let fail = 0

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    pass++
    console.log(`PASS  ${name}${detail ? ` :: ${detail}` : ''}`)
  } else {
    fail++
    console.log(`FAIL  ${name}${detail ? ` :: ${detail}` : ''}`)
  }
}

const repoRoot = process.cwd()
function readRel(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8')
}

// STEP 1 — validasi login murni (Opsi B: password-only, tanpa username)
const e1 = validateLoginForm('')
check('password kosong -> error password', !!e1.password && !('username' in e1))
const e4 = validateLoginForm('secret123')
check('input valid -> tanpa error', !e4.password && !('username' in e4))
const e5 = validateLoginForm('')
check('pesan password persis label', e5.password === 'Password wajib diisi.')

// STEP 1b — kontrak error DTO (REVISI 1): tanpa instanceof Error
const errObj = { message: 'Username atau password salah.' }
check(
  'payload DTO membaca message dari objek polos',
  authErrorPayload(errObj)?.message === 'Username atau password salah.'
)
const errObjCode = { message: 'Token kedaluwarsa.', code: 'AUTH_EXPIRED' }
check('payload DTO membaca code bila tersedia', authErrorCodeOf(errObjCode) === 'AUTH_EXPIRED')
check('errorMessageOf memakai message DTO', authErrorMessageOf(errObjCode, 'fallback') === 'Token kedaluwarsa.')
check(
  'errorMessageOf tidak bergantung pada instanceof Error (objek polos)',
  authErrorMessageOf({ message: 'A' }, 'fallback') === 'A'
)
check(
  'errorMessageOf fallback untuk nilai non-objek (string)',
  authErrorMessageOf('gagal', 'fallback') === 'fallback'
)
check('errorMessageOf fallback untuk null', authErrorMessageOf(null, 'fallback') === 'fallback')
check('errorMessageOf fallback untuk message kosong', authErrorMessageOf({ message: '   ' }, 'fallback') === 'fallback')
check('errorMessageOf membaca message dari Error (bukan lewat instanceof)', authErrorMessageOf(new Error('E1'), 'fallback') === 'E1')
check('errorCodeOf undefined bila code bukan string', authErrorCodeOf({ message: 'X', code: 5 }) === undefined)
check(
  'helper tidak memakai instanceof Error',
  !authErrorMessageOf.toString().includes('instanceof')
)

// STEP 1c — pesan BERSIH (fix tech debt B-7 jalur AUTH): Electron membungkus
// error main menjadi `Error invoking remote method '<channel>': AppError: <pesan>`.
// authErrorMessageOf harus memangkas prefix sehingga hanya pesan yang tampil ke user.
const wrappedLogin = new Error("Error invoking remote method 'auth:login': AppError: Username atau password salah")
check(
  'pesan login gagal dibersihkan dari prefix Electron + AppError',
  authErrorMessageOf(wrappedLogin, 'fallback') === 'Username atau password salah'
)
const wrappedStatus = new Error("Error invoking remote method 'auth:status': AppError: Sesi tidak aktif")
check(
  'pesan status dibersihkan untuk channel lain (auth:status)',
  authErrorMessageOf(wrappedStatus, 'fallback') === 'Sesi tidak aktif'
)
const wrappedNoMarker = new Error("Error invoking remote method 'auth:logout': Gagal logout")
check(
  'strip prefix TANPA marker AppError tetap bersih',
  authErrorMessageOf(wrappedNoMarker, 'fallback') === 'Gagal logout'
)
const cleanLogin = authErrorMessageOf(wrappedLogin, 'fallback')
check('hasil bersih TANPA "Error invoking"', !cleanLogin.includes('Error invoking'))
check('hasil bersih TANPA "AppError:"', !cleanLogin.includes('AppError:'))
check('hasil bersih TANPA channel "auth:login"', !cleanLogin.includes('auth:login'))
check(
  'pesan tanpa prefix tetap utuh (regresi)',
  authErrorMessageOf({ message: 'Username atau password salah' }, 'fallback') === 'Username atau password salah'
)
check(
  'cleanAuthErrorMessage murni: whitespace dirapikan (trim)',
  cleanAuthErrorMessage("   Error invoking remote method 'auth:login': AppError:   Pesan beranda   ") === 'Pesan beranda'
)
check(
  'cleanAuthErrorMessage murni: pesan polos dipertahankan',
  cleanAuthErrorMessage('Password salah.') === 'Password salah.'
)
check(
  'fallback ikut dibersihkan (tanpa prefix = no-op)',
  authErrorMessageOf(null, 'Terjadi kesalahan. Coba lagi.') === 'Terjadi kesalahan. Coba lagi.'
)

// STEP 2 — LoginPage memakai kontrak auth.login & helper DTO
const loginSrc = readRel('src/pages/auth/LoginPage.tsx')
check('LoginPage memanggil auth.login', loginSrc.includes('window.electronAPI.auth.login('))
check(
  'LoginPage TIDAK memiliki field username (Opsi B password-only)',
  !loginSrc.includes('LABELS.AUTH.USERNAME') && !loginSrc.includes('setUsername') && !loginSrc.includes('autoComplete="username"')
)
check(
  'LoginPage mengirim login password-only',
  loginSrc.includes('window.electronAPI.auth.login({ password })')
)
check(
  'LoginPage tidak memakai alert()',
  !loginSrc.includes('alert(') && !loginSrc.includes('confirm(')
)
check('LoginPage memakai refreshStatus (via useAuthGate)', loginSrc.includes('useAuthGate()'))
check('LoginPage merender pesan error di halaman', loginSrc.includes('setSubmitError'))
check(
  'LoginPage TIDAK memakai instanceof Error (REVISI 1)',
  !loginSrc.includes('instanceof Error')
)
check(
  'LoginPage membaca pesan via authErrorMessageOf (kontrak DTO)',
  loginSrc.includes('authErrorMessageOf(err, LABELS.AUTH.SUBMIT_ERROR_DEFAULT)')
)

// STEP 3 — loading state
check('tombol disabled saat submitting', loginSrc.includes('disabled={submitting}'))
check('spinner dipakai (Loader2 + animate-spin)', loginSrc.includes('Loader2') && loginSrc.includes('animate-spin'))
check('no double submit (guard submitting)', loginSrc.includes('if (submitting) return'))

// STEP 4 — Logout di TopBar sebagai Account Action (REVISI 2)
const topBarSrc = readRel('src/components/layout/TopBar.tsx')
check('TopBar memanggil auth.logout', topBarSrc.includes('window.electronAPI.auth.logout('))
check('TopBar memakai refreshStatus (useAuthGate)', topBarSrc.includes('useAuthGate()'))
check('TopBar memakai label LOGOUT', topBarSrc.includes('LABELS.AUTH.LOGOUT'))
check('TopBar tidak memakai alert()', !topBarSrc.includes('alert(') && !topBarSrc.includes('confirm('))
check('TopBar memakai icon LogOut', topBarSrc.includes('LogOut'))
check('TopBar membaca error logout via authErrorMessageOf (kontrak DTO)', topBarSrc.includes('authErrorMessageOf(err, LABELS.AUTH.LOGOUT_FAILED)'))
check('TopBar TIDAK memakai instanceof Error (REVISI 1)', !topBarSrc.includes('instanceof Error'))
check('TopBar loading state logout (disabled)', topBarSrc.includes('disabled={loggingOut}'))

// STEP 4b — Sidebar hanya navigasi (REVISI 2)
const sideSrc = readRel('src/components/layout/Sidebar.tsx')
check('Sidebar TIDAK memuat Logout', !sideSrc.includes('auth.logout') && !sideSrc.includes('LogOut'))
check('Sidebar TIDAK memakai useAuthGate', !sideSrc.includes('useAuthGate'))
check('Sidebar TIDAK memakai useNotification', !sideSrc.includes('useNotification'))
check('Sidebar tidak punya mt-auto action', !sideSrc.includes('mt-auto'))

// STEP 5 — AuthGate tetap penentu status (Dashboard atau Login)
const gateSrc = readRel('src/auth/AuthGate.tsx')
check('AuthGate masih memanggil auth.status()', gateSrc.includes('window.electronAPI.auth.status('))
check('AuthGate masih navigate /login saat unauthenticated', gateSrc.includes("navigate('/login'"))
check('AuthGate masih navigate / saat authenticated', gateSrc.includes("navigate('/', { replace: true })"))
check('AuthGate tidak me-render LoginPage langsung', !gateSrc.includes('return <LoginPage'))

// STEP 6 — scope exclusion: tidak ada implementasi fitur yang BELUM masuk
const loginDir = readRel('src/pages/auth/LoginPage.tsx')
check(
  'TIDAK ada remember me / forgot / change password di LoginPage',
  !loginDir.includes('remember') &&
    !loginDir.toLowerCase().includes('forgot') &&
    !loginDir.toLowerCase().includes('change password')
)

console.log('')
console.log(`RESULT: ${pass} PASS, ${fail} FAIL`)
if (fail > 0) process.exit(1)
