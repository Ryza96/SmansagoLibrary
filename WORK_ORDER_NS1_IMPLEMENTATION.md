# WORK ORDER NS-1 — Notification Foundation (Implementasi)

## Ringkasan
Fondasi Notification System v1.0 (fase pertama dari 3 fase sesuai `NOTIFICATION_SYSTEM_ARCHITECTURE.md` yang DISETUJUI Product Owner dengan 11 revisi). Scope: **NotificationProvider, NotificationReducer, Toast, ToastViewport, ConfirmDialog, Configuration, Smoke Test**. BELUM migrasi `alert()`/`confirm()`, BELUM mengubah halaman aplikasi.

## Revisi PO yang diimplementasikan
| # | Revisi | Implementasi |
|---|--------|--------------|
| 1 | ZERO dependency (dilarang library toast) | `package.json` tidak berubah; seluruh kode custom |
| 2 | `createPortal(document.body)` | `ToastViewport` & `ConfirmDialog` memakai `createPortal(..., document.body)` |
| 3 | Posisi TOP RIGHT | `fixed top-14 right-4` (di bawah TopBar `h-12`) |
| 4 | STACK | viewport flex-col gap-2, toast baru di bawah |
| 5 | Maks 3 toast; toast ke-4 menghapus paling lama | `notificationReducer` `toast/add` slice ke `NOTIFICATION_MAX_TOASTS=3` |
| 6 | Animasi slide kanan + fade | `@keyframes toast-enter` (translateX 24px → 0, opacity) di `styles.css` |
| 7 | Durasi 3000/4000/5000/6000 (success/info/warning/error), semua auto-dismiss | `NOTIFICATION_DURATION` di config; timer di `NotificationContext` (per-id) |
| 8 | Tidak ada persistent toast | seluruh tipe auto-dismiss |
| 9 | ConfirmDialog modern (icon/title/description/Cancel/Confirm/danger) | `ConfirmDialog.tsx` — ikon TriangleAlert (danger)/HelpCircle, role=alertdialog, Esc batal, Tab trap, fokus awal Cancel |
| 10 | Reducer pure agar bisa di-smoke | `notificationReducer` tanpa IO; id dibangkitkan caller (`crypto.randomUUID`) |
| 11 | Belum sentuh halaman; belum ganti alert()/confirm() | tidak ada edit ke halaman/routes |

## File
**Baru (8):**
- `src/shared/config/notification.ts` — `NOTIFICATION_DURATION`, `NOTIFICATION_MAX_TOASTS`, `NOTIFICATION_Z_INDEX`
- `src/notification/types.ts` — `ToastType`, `ToastItem`, `ConfirmDescriptor`, `ConfirmOptions`, `Notify`
- `src/notification/notification-reducer.ts` — reducer pure (aksi `toast/add | toast/dismiss | toast/dismissAll | confirm/open | confirm/resolve`)
- `src/notification/NotificationContext.tsx` — provider + `useNotification()` (pola `BookImportContext`)
- `src/notification/ToastItem.tsx` — item toast (ikon per tipe, bar warna, dismiss button, `aria-live`)
- `src/notification/ToastViewport.tsx` — viewport portal top-right
- `src/notification/ConfirmDialog.tsx` — dialog konfirmasi modern (portal, Esc/tab-trap)
- `ns1_notification_smoke/smoke.ts` — 27 asersi reducer + config

**Dimodifikasi (3):**
- `src/renderer/App.tsx` — `<NotificationProvider>` membungkus `<RouterProvider>`
- `tsconfig.web.json` — include `src/notification/**/*`
- `src/renderer/assets/styles.css` — keyframes `toast-enter`

**TIDAK diubah:** package.json (zero dep), schema, migration, halaman, routes, IPC/preload/env.

## API
- `useNotification()` → `{ notify, confirm }`
- `notify.success|error|warning|info(message): string(id)`; `notify.dismiss(id)`; `notify.dismissAll()`
- `confirm({title, message, confirmLabel?, cancelLabel?, danger?}): Promise<boolean>` — resolve false saat dialog baru menggantikan (promise lama di-resolve false)

## Validation
| Gate | Hasil |
|------|-------|
| Smoke `ns1_notification_smoke` | **27/27 PASS** (state awal, FIFO, maks-3 evict tertua, dismiss/dismissAll, open/replace/resolve confirm, kemurnian redux, StrictMode double-invoke identik, durasi per tipe) |
| `npm run lint` | PASS |
| `npm run build` | PASS — main 1,882.54 kB · preload 9.95 kB (identik baseline) · renderer **1,148.88 kB** (+11.22, modul notification) |
| `prisma migrate diff` | "This is an empty migration." (no-drift) |

## Catatan Desain
- Id toast = `crypto.randomUUID()` (browser API tersedia di Electron renderer; pertama kali dipakai di `src/`).
- Timer auto-dismiss dikelola provider (per-id, cleanup saat unmount); reducer tetap murni karena id & duration ada di payload.
- Z-index terpusat di config: toast 90, confirm 100 (di atas semua modal eksisting z-50).
- **Next:** NS-2 — migrasi `alert()`/`confirm()` di halaman sesuai `NOTIFICATION_UX_AUDIT.md` (53 match). BELUM dibuka.
