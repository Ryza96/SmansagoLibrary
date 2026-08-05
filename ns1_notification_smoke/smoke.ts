import { NOTIFICATION_DURATION, NOTIFICATION_MAX_TOASTS } from '../src/shared/config/notification'
import {
  initialNotificationState,
  notificationReducer,
} from '../src/notification/notification-reducer'
import type { ConfirmDescriptor, ToastItem } from '../src/notification/types'

let passed = 0
let failed = 0

function assert(condition: boolean, name: string, detail?: unknown) {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${detail !== undefined ? ` | ${JSON.stringify(detail)}` : ''}`)
  }
}

function toast(id: string, type: ToastItem['type'] = 'success', duration: number = NOTIFICATION_DURATION.success): ToastItem {
  return { id, type, message: `pesan ${id}`, duration }
}

function descriptor(id: string, danger = true): ConfirmDescriptor {
  return {
    id,
    title: `Hapus ${id}?`,
    message: `Yakin ingin menghapus ${id}?`,
    confirmLabel: 'Hapus',
    cancelLabel: 'Batal',
    danger,
  }
}

const ids = (state: ReturnType<typeof notificationReducer>) => state.toasts.map((t) => t.id)

// ---- State awal ----
{
  const s = initialNotificationState
  assert(s.toasts.length === 0, '1. state awal: toasts kosong')
  assert(s.confirm === null, '2. state awal: confirm null')
}

// ---- toast/add ----
{
  const s1 = notificationReducer(initialNotificationState, { type: 'toast/add', toast: toast('a') })
  assert(s1.toasts.length === 1, '3. add 1 toast', s1.toasts)
  assert(s1.toasts[0].id === 'a' && s1.toasts[0].message === 'pesan a', '4. field toast tersimpan')
}

// ---- urutan FIFO ----
{
  const s1 = notificationReducer(initialNotificationState, { type: 'toast/add', toast: toast('a') })
  const s2 = notificationReducer(s1, { type: 'toast/add', toast: toast('b') })
  assert(JSON.stringify(ids(s2)) === JSON.stringify(['a', 'b']), '5. urutan penambahan dipertahankan', ids(s2))
}

// ---- batas maks 3: toast ke-4 menghapus paling lama ----
{
  let s = initialNotificationState
  for (const id of ['a', 'b', 'c', 'd']) {
    s = notificationReducer(s, { type: 'toast/add', toast: toast(id) })
  }
  assert(s.toasts.length === NOTIFICATION_MAX_TOASTS, '6. maks 3 toast setelah 4 add', s.toasts.length)
  assert(JSON.stringify(ids(s)) === JSON.stringify(['b', 'c', 'd']), '7. toast tertua (a) dihapus, urutan terjaga', ids(s))
}

// ---- tepat 3 add: tidak ada yang dihapus ----
{
  let s = initialNotificationState
  for (const id of ['a', 'b', 'c']) {
    s = notificationReducer(s, { type: 'toast/add', toast: toast(id) })
  }
  assert(s.toasts.length === 3 && JSON.stringify(ids(s)) === JSON.stringify(['a', 'b', 'c']), '8. tepat 3 add: semua tersimpan', ids(s))
}

// ---- toast/dismiss ----
{
  let s = initialNotificationState
  for (const id of ['a', 'b', 'c']) {
    s = notificationReducer(s, { type: 'toast/add', toast: toast(id) })
  }
  const s2 = notificationReducer(s, { type: 'toast/dismiss', id: 'b' })
  assert(JSON.stringify(ids(s2)) === JSON.stringify(['a', 'c']), '9. dismiss menghapus hanya id yang ditunjuk', ids(s2))
  const s3 = notificationReducer(s2, { type: 'toast/dismiss', id: 'zzz' })
  assert(JSON.stringify(ids(s3)) === JSON.stringify(['a', 'c']), '10. dismiss id tak dikenal: no-op', ids(s3))
}

// ---- toast/dismissAll ----
{
  let s = initialNotificationState
  for (const id of ['a', 'b', 'c']) {
    s = notificationReducer(s, { type: 'toast/add', toast: toast(id) })
  }
  const s2 = notificationReducer(s, { type: 'toast/dismissAll' })
  assert(s2.toasts.length === 0, '11. dismissAll mengosongkan toasts', s2.toasts.length)
}

// ---- confirm/open ----
{
  const s1 = notificationReducer(initialNotificationState, { type: 'confirm/open', confirm: descriptor('m1') })
  assert(s1.confirm?.id === 'm1', '12. open confirm: descriptor tersimpan', s1.confirm)
  assert(s1.confirm?.danger === true, '13. open confirm: variant danger dipertahankan', s1.confirm)
}

// ---- confirm open kedua menggantikan yang pertama ----
{
  const s1 = notificationReducer(initialNotificationState, { type: 'confirm/open', confirm: descriptor('m1') })
  const s2 = notificationReducer(s1, { type: 'confirm/open', confirm: descriptor('m2', false) })
  assert(s2.confirm?.id === 'm2', '14. open kedua menggantikan confirm pertama', s2.confirm)
  assert(s2.confirm?.danger === false, '15. variant non-danger dipertahankan', s2.confirm)
}

// ---- confirm/resolve ----
{
  const s1 = notificationReducer(initialNotificationState, { type: 'confirm/open', confirm: descriptor('m1') })
  const s2 = notificationReducer(s1, { type: 'confirm/resolve' })
  assert(s2.confirm === null, '16. resolve mengosongkan confirm', s2.confirm)
}

// ---- kemurnian: tidak memutasi input ----
{
  const before = JSON.stringify(initialNotificationState)
  notificationReducer(initialNotificationState, { type: 'toast/add', toast: toast('a') })
  notificationReducer(initialNotificationState, { type: 'toast/dismissAll' })
  notificationReducer(initialNotificationState, { type: 'confirm/open', confirm: descriptor('m1') })
  notificationReducer(initialNotificationState, { type: 'confirm/resolve' })
  assert(JSON.stringify(initialNotificationState) === before, '17. reducer tidak memutasi state input')

  const st = notificationReducer(initialNotificationState, { type: 'toast/add', toast: toast('a') })
  const stBefore = JSON.stringify(st.toasts)
  notificationReducer(st, { type: 'toast/add', toast: toast('b') })
  assert(JSON.stringify(st.toasts) === stBefore, '18. reducer mengembalikan array baru, input array tidak berubah')
}

// ---- kemurnian StrictMode: aplikasi ganda = hasil identik ----
{
  const action = { type: 'toast/add' as const, toast: toast('a') }
  const r1 = notificationReducer(initialNotificationState, action)
  const r2 = notificationReducer(initialNotificationState, action)
  assert(JSON.stringify(r1) === JSON.stringify(r2), '19. StrictMode double-invoke: hasil identik', r1)

  const confirmAction = { type: 'confirm/open' as const, confirm: descriptor('m1') }
  const c1 = notificationReducer(initialNotificationState, confirmAction)
  const c2 = notificationReducer(initialNotificationState, confirmAction)
  assert(JSON.stringify(c1) === JSON.stringify(c2), '20. StrictMode confirm double-invoke: hasil identik', c1)
}

// ---- durasi per tipe (konfigurasi revisi PO) ----
{
  assert(NOTIFICATION_DURATION.success === 3000, '21. durasi success = 3 detik', NOTIFICATION_DURATION.success)
  assert(NOTIFICATION_DURATION.info === 4000, '22. durasi info = 4 detik', NOTIFICATION_DURATION.info)
  assert(NOTIFICATION_DURATION.warning === 5000, '23. durasi warning = 5 detik', NOTIFICATION_DURATION.warning)
  assert(NOTIFICATION_DURATION.error === 6000, '24. durasi error = 6 detik', NOTIFICATION_DURATION.error)
  assert(NOTIFICATION_MAX_TOASTS === 3, '25. maks toast = 3', NOTIFICATION_MAX_TOASTS)
}

// ---- reducer menghormati durasi yang diberikan ----
{
  const s1 = notificationReducer(initialNotificationState, {
    type: 'toast/add',
    toast: toast('w', 'warning', NOTIFICATION_DURATION.warning),
  })
  assert(s1.toasts[0].duration === 5000 && s1.toasts[0].type === 'warning', '26. durasi & tipe toast tersimpan', s1.toasts[0])
}

// ---- kombinasi: add 4 setelah dismiss, sisa dipertahankan ----
{
  let s = initialNotificationState
  for (const id of ['a', 'b', 'c']) s = notificationReducer(s, { type: 'toast/add', toast: toast(id) })
  s = notificationReducer(s, { type: 'toast/dismiss', id: 'a' })
  s = notificationReducer(s, { type: 'toast/add', toast: toast('d') })
  assert(JSON.stringify(ids(s)) === JSON.stringify(['b', 'c', 'd']), '27. add setelah dismiss: tidak ada drop tak perlu', ids(s))
}

console.log(`\nns1_notification_smoke: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
