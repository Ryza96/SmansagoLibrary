# NOTIFICATION_SYSTEM_ARCHITECTURE.md

**Status:** DISCOVERY — READ ONLY
**Peran:** Project Engineer → untuk review Product Owner
**Tanggal:** 2026-08-05
**Prinsip:** JANGAN implementasi sampai PO menyetujui desain ini. Tidak ada commit.

---

## 1. Ringkasan Eksekutif

- Aplikasi saat ini memakai **53** `window.alert()` / `window.confirm()` tersebar di 25+ file (`NOTIFICATION_UX_AUDIT.md`), **tanpa infrastruktur global** (grep toast/snackbar/Notification = 0).
- **Rekomendasi:** Bangun **Notification System sendiri (zero new dependency)** — React Context + `createPortal` + Tailwind + `lucide-react` (semuanya sudah ada). Bukan library pihak ketiga.
- **Alasan utama:** (1) aplikasi offline desktop tanpa kebutuhan animasi/library besar; (2) pola Context sudah ada (`BookImportContext`); (3) UI 100% mengikuti design system Tailwind yang dipakai; (4) `confirm()` async berbasis Promise bisa menjadi satu-satunya mekanisme konfirmasi — library toast pihak ketiga TIDAK menyediakan `confirm()` yang konsisten; (5) bundle tetap kecil (renderer saat ini ~1.14 MB).
- **API:** `notify.success() / notify.error() / notify.warning() / notify.info() / notify.dismiss() / confirm()` — persis permintaan PO.
- **Migrasi bertahap dalam 3 fase** tanpa merusak aplikasi: sistem bersifat aditif; setiap halaman di-migrasi terpisah dan diverifikasi.

---

## 2. Analisis Arsitektur Saat Ini (React + Electron)

### 2.1 Stack renderer (terverifikasi)
| Aspek | Kondisi | Implikasi |
|---|---|---|
| React | 18.3.1, `react-dom/client` | StrictMode aktif di `main.tsx` → reducer/effect wajib murni |
| Router | `react-router-dom` v7, `createHashRouter` | Entry `App.tsx` hanya `<RouterProvider router={router}>` |
| Styling | Tailwind CSS 3 (utilities), `styles.css` | Tidak ada UI library; semua styling Tailwind murni |
| Ikon | `lucide-react` (sudah dependency) | Ikon variant/confirm tersedia tanpa deps baru |
| State | React Context saja (`BookImportContext`); **tidak ada** redux/zustand/jotai | Pola Context + custom hook = konvensi resmi |
| Modal eksisting | `ClassCloneModal` (overlay `fixed inset-0 z-50`, click-outside, stopPropagation) | Modal baru harus mengikuti pola ini + portal |
| Build | electron-vite; tsconfig.web `moduleResolution: bundler` | Bundling global; no SSR; renderer offline |
| UI library | Tidak ada (grep = 0) | Keputusan "custom vs library" terbuka |

### 2.2 Pohon render (relevan untuk penempatan provider)
```
main.tsx
  <StrictMode>
    <App>                       ← <-- NotificationProvider harus DI SINI
      <RouterProvider router>
        <AppLayout>             (TopBar + Sidebar + main(Outlet) + StatusBar)
          <Outlet/> → halaman
```

- **Semua halaman** hidup di bawah satu `AppLayout` route (112 baris `routes/index.tsx`). Provider yang diletakkan di `App.tsx` (di luar RouterProvider) otomatis menjangkau **semua halaman termasuk 404/redirect** tanpa menyentuh router.
- **`main` punya `overflow-y-auto`** dan tabel punya `overflow-x-auto` → toast/confirm **WAJIB dirender via `createPortal(document.body)`** agar tidak terpotong oleh stacking context/overflow parent.

### 2.3 Konvensi yang harus diikuti
- Context file di `src/contexts/` (pola `BookImportContext.tsx`: `createContext` + `useMemo` value + custom hook + guard `if (!context) throw`).
- Komponen UI di `src/components/ui/` (pola `InlineAddModal.tsx`, `SearchableSelect.tsx`).
- Semua string UI di `src/utils/labels.ts` (blok per fitur) — pesan notifikasi wajib masuk ke sini (blok `NOTIFICATION`).

---

## 3. Desain NotificationProvider Global

### 3.1 Lokasi & struktur file
```
src/contexts/NotificationContext.tsx     ← Provider + useNotification() + tipe
src/components/ui/ToastViewport.tsx     ← portal, container toasts (fixed, stack)
src/components/ui/ToastItem.tsx         ← satu toast (ikon + pesan + auto-dismiss)
src/components/ui/ConfirmDialog.tsx     ← portal, dialog konfirmasi (replaces window.confirm)
src/shared/config/notification.ts       ← (opsional) z-index scale / durasi default / position — leaf node
```

Ditempatkan di `App.tsx`:
```tsx
export default function App() {
  return (
    <NotificationProvider>
      <RouterProvider router={router} />
    </NotificationProvider>
  )
}
```

### 3.2 Model state (murni, bisa di-smoke)
```ts
type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string            // crypto.randomUUID() — sudah dipakai di repo
  type: ToastType
  message: string
  duration: number      // ms; -1 = persist (error/butuh aksi)
  dismissed: boolean
}

interface ConfirmState {
  id: string
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
  resolve: (value: boolean) => void   // Promise-based
}
```

Reducer `NotificationReducer` (pure, diekspor untuk smoke): aksi `TOAST_ADD | TOAST_DISMISS | TOAST_DISMISS_ALL | CONFIRM_OPEN | CONFIRM_RESOLVE`.

Provider memegang:
- `toasts: ToastItem[]` + timers per id (auto-dismiss).
- `confirm: ConfirmState | null` (satu pada satu waktu; bila terbuka saat ada confirm lain → resolve false yang lama).
- `notify` / `confirm` di-stabilkan `useCallback` (StrictMode-safe, mencegah re-render konsumen).

### 3.3 Render
- `ToastViewport` → `createPortal(..., document.body)`: container `fixed bottom-4 right-4 z-[90]` dengan stack column + `pointer-events-none`; tiap toast `pointer-events-auto`.
- `ConfirmDialog` → `createPortal(..., document.body)`: overlay `fixed inset-0 z-[100] bg-black/30`, kartu putih mengikuti pola `ClassCloneModal`; fokus ke tombol Cancel saat mount; **Esc = batal**, **Enter = konfirmasi**; focus trap sederhana; `role="alertdialog"` + `aria-modal`.
- Toast ikon via `lucide-react`: `CheckCircle2` (success, emerald), `AlertTriangle` (warning, amber), `XCircle` (error, rose), `Info` (info, sky).

### 3.4 Akses
```ts
const { notify, confirm } = useNotification()
```

---

## 4. Spesifikasi API (sederhana & ber-typestring)

```ts
interface Notify {
  success(message: string, opts?: ToastOptions): string   // id
  error(message: string, opts?: ToastOptions): string
  warning(message: string, opts?: ToastOptions): string
  info(message: string, opts?: ToastOptions): string
  dismiss(id: string): void
  dismissAll(): void
}

interface ToastOptions {
  duration?: number       // default per type (success 3000, info 4000, warning 5000, error -1/persist)
  onClose?: () => void
}

// Menggantikan window.confirm — Promise, dipakai dengan `await` di handler async
interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string   // default "Ya"
  cancelLabel?: string    // default "Batal"
  danger?: boolean        // default false (tombol confirm merah utk destruktif)
}
function confirm(opts: ConfirmOptions): Promise<boolean>
```

**Kontrak migrasi `confirm` (PENTING):** `window.confirm` sinkron, API ini async. Semua 13 call site saat ini berada **di dalam `async function`** (handleDelete/handleExecute/etc), sehingga penggantiannya adalah **drop-in**:
```ts
// LAMA:  if (!window.confirm(msg)) return
// BARU:  if (!(await confirm({ title, message: msg }))) return
```

**Catatan scope:** `notify.promise()` (loading/success/error dari satu async op) **TIDAK masuk v1** — tambah hanya bila PO minta. Native OS Notification (main-process `new Notification`) juga di luar scope v1 (semua feedback user mengalir via IPC resolve/reject ke renderer).

---

## 5. Renderer TANPA library besar

- **Implementasi sendiri** = React + `createPortal` (react-dom, sudah ada) + Tailwind utility + `lucide-react` (sudah ada). **0 dependency baru**, estimasi ~250–350 baris source.
- Tidak ada animasi library: animasi masuk/keluar pakai **CSS transition + Tailwind** (`transition-all`, `translate-x`, `opacity`) — cukup untuk desktop app, tanpa bundle tambahan.
- Bundle impact: beberapa KB (vs `react-toastify` ~30kb+ gzip + transitif; `sonner` ~15kb; `react-hot-toast` ~11kb).

---

## 6. Library Pihak Ketiga vs Implementasi Sendiri

| Kriteria | Custom (Rekomendasi) | react-hot-toast (~11kb) | sonner (~15kb) | react-toastify (~30kb+) | Radix/Headless UI |
|---|---|---|---|---|---|
| Dependency baru | 0 | 1 | 1 | 1 (+ transitif) | 2+ paket |
| `confirm()` terintegrasi | **Ya** (API sendiri) | Tidak (perlu lib lain) | Tidak | Tidak | Perlu `AlertDialog` terpisah |
| Kesesuaian design system | 100% Tailwind | Perlu styling ulang | Tailwind-friendly | Perlu override CSS | High (headless) |
| Bundle | ~KB | ~11kb gzip | ~15kb | ~30kb+ | sedang |
| A11y siap pakai | Harus diimplementasi (Esc, trap, aria) | Dasar (role=status) | Baik | Baik | **Terbaik** |
| Konsistensi 50+ halaman | Dijamin (satu API) | Baik | Baik | Baik | Baik |
| Offline desktop | Aman | Aman | Aman | Aman | Aman |
| Perawatan | Kita yang punya bug | Vendor | Vendor | Vendor | Vendor |
| Smoke testable (pure reducer) | **Ya** (sesuai budaya repo) | Tidak | Tidak | Tidak | Tidak |

**Rekomendasi: CUSTOM.** Alasan kuat:
1. **`confirm()` adalah pembeda utama** — tidak ada library toast yang menyediakan konfirmasi konsisten; kita tetap perlu membangun `ConfirmDialog` sendiri apapun pilihannya.
2. **Budaya repo** — smoke berbasis service/pure function (`decide()`, `diffDays`, dll). Reducer murni bisa di-smoke tanpa framework test; library pihak ketiga tidak.
3. **Offline desktop** — tidak butuh fitur web ekosistem (SSR, hydration, resize observability lanjutan).
4. **Pola Context sudah ada** — mengikuti `BookImportContext` persis; tidak menambah paradigma.

**Fallback:** bila PO ingin battle-tested untuk toast saja (bukan confirm), `react-hot-toast` adalah kandidat terkecil; tapi v1 tetap perlu `ConfirmDialog` custom. Rekomendasi tetap custom untuk keseluruhan.

---

## 7. Konsistensi di 50+ Halaman

### 7.1 Pilar konsistensi
1. **Satu provider, satu API** — semua notifikasi melalui `useNotification()`; `alert/confirm` dihapus bertahap.
2. **Pesan di satu tempat** — blok `LABELS.NOTIFICATION.*` di `src/utils/labels.ts`; **dilarang string inline** (konsisten WO-2/PO stance: renderer tidak menurunkan pesan bisnis; namun pesan UI notifikasi adalah konstanta label).
3. **Guard lint untuk cegah regresi** — aturan ESLint `no-restricted-syntax` (atau `eslint-plugin` custom) memblokir `window.alert`, `alert(`, `window.confirm`, `confirm(` di `src/`. Ini menjamin 50+ halaman berikutnya tidak memunculkan kembali native dialog.
4. **Skala z-index terdokumentasi** — modals eksisting `z-50`; toast `z-[90]`; confirm `z-[100]`. Ditulis di `src/shared/config/notification.ts` agar halaman baru tidak bentrok.
5. **Position tetap** — toast di `bottom-right` (di atas StatusBar), satu posisi di seluruh app.

### 7.2 A11y (standar untuk desktop app)
- Toast success/info: `role="status"` + `aria-live="polite"`.
- Toast error/warning: `role="alert"` + `aria-live="assertive"`.
- Confirm: `role="alertdialog"` + `aria-modal="true"`, autofocus Cancel, Esc/Enter, focus trap.

### 7.3 Konvensi tipe notifikasi (rule of thumb)
| Situasi | API |
|---|---|
| Operasi sukses (simpan, hapus, kembali, aktifkan) | `notify.success` |
| Gagal operasi / guard service (AppError) | `notify.error(err.message)` |
| Peringatan alur (scan duplikat, buku tidak tersedia) | `notify.warning` (non-blocking, tak menghentikan alur scan) |
| Info (mis. `PDF_SAVED` path) | `notify.info` |
| Aksi destruktif / state-change berisiko | `confirm(...)` |
| Tombol "belum tersedia" (placeholder) | **hapus placeholder-alert** → disabled + tooltip (WO terpisah) |

---

## 8. Migrasi Bertahap (53 penggunaan) Tanpa Merusak Aplikasi

### 8.1 Prinsip keamanan
- **Aditif & reversibel:** Provider dipasang tanpa mengubah perilaku halaman manapun. Setiap halaman di-migrasi SATU per SATU dan diverifikasi lint+build+manual. Halaman yang belum dimigrasi tetap memakai `window.alert` dan TETAP berfungsi.
- **Dua lapis per halaman:** setelah migrasi suatu halaman, grep halaman itu = 0 match `alert(`/`confirm(`.
- **Tidak ada perubahan bisnis logic** selama migrasi — hanya penggantian mekanisme tampilan. `AppError.message` dari service tetap satu-satunya sumber pesan error.

### 8.2 Tahapan

**Fase 0 — Fondasi (tanpa ubah halaman)**
1. Tulis `NotificationContext` + `ToastViewport` + `ToastItem` + `ConfirmDialog` + config + label block.
2. Pasang provider di `App.tsx`.
3. Smoke murni: `NotificationReducer` (add/dismiss/dismissAll/open/resolve/StrictMode double-invoke).
4. Guard lint anti-`alert/confirm` di **mode warning** dulu.
5. Validasi: lint, build, bundle grep (`role="status"`/`createPortal` ter-render).

**Fase 1 — Toast untuk success/warning/info + error (34 penggunaan; NON-DESTRUCTIVE)**
Penggantian drop-in `alert(...)` → `notify.error/success/warning(...)` tanpa mengubah alur (tidak menambah/menghapus await/navigate).
- Sukses (4): `BorrowingsPage:130`, `ReturnsPage:49`, `AYList:61,72`.
- Warning scan (3): `BorrowingsPage:82,90,97` → `notify.warning` (alur scan TIDAK berhenti — perbaikan UX langsung).
- Error (27): form ×7, list ×9, circulation ×7, promotion ×2, preview/print ×3, settings ×1.
- **Urutan rekomendasi (volume tertinggi dulu):** BorrowingsPage (6) → ReturnsPage (4) → AYList (8) → master forms (7×1) → master lists (6×2) → sisa (Promotion, ReceiptPreview, LabelPreview, BooksPage, BookDetail, Settings).

**Fase 2 — Confirm (13; PERLU PERHATIAN ASYNC)**
Ganti `if (!window.confirm(m)) return` → `if (!(await confirm({...}))) return`. **Prasyarat:** setiap call site sudah di dalam `async function` (diverifikasi semua 13 benar). Konfirmasi diperkaya: tambah `danger: true` untuk delete/decommission.
- 13 lokasi: BooksPage:40, MembersPage:38, MemberListPage:46, AuthorList:47, CategoryList:43, PublisherList:43, CurriculumList:43, ClassList:83, AYList:48/58/69, PromotionPage:134, BookDetail:78.

**Fase 3 — Bersihkan sisa (terpisah dari inti notifikasi)**
- F3 bug audit: tambah try/catch di `MembersPage` & `MemberListPage` handleDelete.
- 6 placeholder-alert: ubah tombol ke `disabled` + tooltip (hapus `alert`).
- Pindahkan string inline (Borrowings/Returns/MemberList confirm) ke `LABELS.NOTIFICATION.*`.
- **Aktifkan** guard lint (warning → error) setelah fase 2 selesai.

### 8.3 Tabel tracking migrasi (diisi saat eksekusi)
| Fase | Kategori | Jumlah | File | Status |
|---|---|---|---|---|
| 1 | success | 4 | Borrowings, Returns, AYList | ☐ |
| 1 | warning scan | 3 | Borrowings | ☐ |
| 1 | error | 27 | form/list/circulation/promotion/preview/settings | ☐ |
| 2 | confirm | 13 | delete/activate/deactivate/execute/decommission | ☐ |
| 3 | bug F3 + placeholder + string inline | 9 | Members/MemberList + 6 placeholder + 2 string | ☐ |

---

## 9. Validasi

1. **Smoke murni (tanpa Electron/DB):** `notification_reducer_smoke/smoke.ts` — add/dismiss/dismissAll, open/resolve confirm (true/false), buffer satu confirm, StrictMode double-invoke idempoten.
2. **Regression build:** `npm run lint` PASS, `npm run build` PASS (ukuran bundle dicatat sebagai baseline per fase).
3. **Bundle grep:** marker `createPortal`/`role="status"`/`role="alertdialog"` ter-render di bundle renderer; `alert(`/`window.confirm(` = 0 di bundle renderer setelah fase 2.
4. **Manual PO:** verifikasi visual toast (posisi/ikon/auto-dismiss) + confirm (Esc/Enter/fokus) di runtime Electron.
5. **Regression domain:** tidak menyentuh backend; `prisma migrate diff` = empty (tanpa schema/migration).

---

## 10. Keputusan yang Perlu PO Setujui

1. **Custom implementation (0 dependency baru)** — setuju? (alternatif: `react-hot-toast` untuk toast + ConfirmDialog custom).
2. **API nama:** `notify.success/error/warning/info` + `confirm` — ok?
3. **Posisi toast:** bottom-right (rekomendasi) vs top-right.
4. **Error persist vs auto-dismiss:** error default `-1` (perlu dismiss manual) vs auto-dismiss 5s.
5. **Guard lint anti-`alert/confirm`** diaktifkan sebagai error setelah migrasi — setuju?
6. **Placeholder-alert** (6 lokasi "belum tersedia") diperlakukan di Fase 3 (disabled) — setuju?

---

## 11. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Async `confirm` merusak alur (await tidak ada di call site) | Verifikasi semua 13 site sudah async sebelum migrasi; smoke/sel memeriksa tsc |
| StrictMode double-mount membuat id duplikat / timer ganda | Reducer murni + id via `crypto.randomUUID()`; cleanup timer di effect |
| Toast terpotong stacking context (`overflow` di main/tabel) | `createPortal(document.body)` — wajib |
| Toast menghalangi tombol (StatusBar/TopBar) | Posisi bottom-right di atas StatusBar dengan offset; `pointer-events-none` pada container |
| Bundle membengkak | Custom ~KB; dicatat per fase di laporan build |
| Halaman baru memunculkan kembali `alert` | Guard lint diaktifkan sebagai error di akhir |

---

**Status: DONE — menunggu review PO.** Tidak ada implementasi, tidak ada commit.
