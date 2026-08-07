// Smoke AUTH-4 — validasi form Setup Admin (renderer pure, tanpa DB/Electron).
// Menguji kontrak UI: username wajib, password min 8 / max 128, konfirmasi cocok,
// serta arsitektur revisi: Setup/Login = route, AuthGate hanya navigasi.

import * as fs from 'fs'
import * as path from 'path'
import { validateSetupForm } from '../src/auth/setup-validation'

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

// STEP 1 — username wajib
const e1 = validateSetupForm('', 'password1', 'password1')
check('username kosong -> error username', !!e1.username, `msg=${e1.username}`)
check('username kosong -> tidak ada error lain', !e1.password && !e1.confirmPassword)

const e2 = validateSetupForm('   ', 'password1', 'password1')
check('username whitespace-only -> error username', !!e2.username)

// STEP 2 — password min 8
const e3 = validateSetupForm('admin', '1234567', '1234567')
check('password 7 karakter -> error min', e3.password === 'Password minimal 8 karakter.')
const e4 = validateSetupForm('admin', '12345678', '12345678')
check('password 8 karakter -> tanpa error password', !e4.password)

// STEP 3 — password max 128
const e5 = validateSetupForm('admin', 'a'.repeat(128), 'a'.repeat(128))
check('password 128 -> valid', !e5.password)
const e6 = validateSetupForm('admin', 'a'.repeat(129), 'a'.repeat(129))
check('password 129 -> error max', e6.password === 'Password maksimal 128 karakter.')

// STEP 4 — konfirmasi password cocok
const e7 = validateSetupForm('admin', 'password1', 'password2')
check('mismatch -> error confirm', !!e7.confirmPassword)
const e8 = validateSetupForm('admin', 'password1', 'password1')
check('match -> tanpa error confirm', !e8.confirmPassword)

// STEP 5 — kombinasi salah semua
const e9 = validateSetupForm('', '1234567', 'x')
check(
  'kombinasi salah semua -> 3 error',
  !!e9.username && !!e9.password && !!e9.confirmPassword
)

// STEP 6 — valid penuh (trim username tidak dihitung sebagai input error)
const e10 = validateSetupForm(' admin ', 'password1', 'password1')
check('input valid -> tanpa error', !e10.username && !e10.password && !e10.confirmPassword)

// STEP 7 — pesan error persis kontrak label
const e11 = validateSetupForm('', '1234567', '12345678')
check('pesan username', e11.username === 'Username wajib diisi.')
check('pesan password min', e11.password === 'Password minimal 8 karakter.')
check('pesan confirm mismatch', e11.confirmPassword === 'Password dan konfirmasi password tidak sama.')

// STEP 8 — murni: validasi TIDAK memanggil window.electronAPI (headless-testable)
check(
  'tanpa ketergantungan Electron/DB (tidak ada global window di path)',
  typeof globalThis.window === 'undefined'
)

// STEP 9 — revisi arsitektur: Setup/Login = route, AuthGate = navigasi saja
const routesSource = fs.readFileSync(path.join(repoRoot, 'src', 'routes', 'index.tsx'), 'utf8')
check("route '/setup' terdaftar", routesSource.includes("path: '/setup'"))
check("route '/login' terdaftar", routesSource.includes("path: '/login'"))
check('AuthGate dipasang sebagai root guard layout', routesSource.includes('element: <AuthGate />'))
check('SetupPage dipasang sebagai elemen route', routesSource.includes("element: <SetupPage />"))
check('LoginPage dipasang sebagai elemen route', routesSource.includes("element: <LoginPage />"))

const gateSource = fs.readFileSync(path.join(repoRoot, 'src', 'auth', 'AuthGate.tsx'), 'utf8')
check(
  'AuthGate TIDAK merender SetupPage/LoginPage langsung',
  !gateSource.includes('return <SetupPage') && !gateSource.includes('return <LoginPage')
)
check('AuthGate menentukan navigasi via navigate()', gateSource.includes('navigate('))
check('AuthGate menyediakan Outlet (route active)', gateSource.includes('<Outlet />'))

console.log('')
console.log(`RESULT: ${pass} PASS, ${fail} FAIL`)
if (fail > 0) process.exit(1)
