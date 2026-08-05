# NS2_TOAST_INVESTIGATION.md

**Status:** COMPLETE — READ ONLY (root cause ditemukan, TIDAK ada perbaikan, TIDAK ada commit)
**Tanggal:** 2026-08-05
**Sifat:** Investigasi (bug report) — analisis kode + verifikasi artifact build. Source TIDAK diubah.

---

## 1. Gejala

Pada halaman Peminjaman Buku, setelah klik **SIMPAN TRANSAKSI**:
- Tidak muncul `alert()` sama sekali (sukses maupun error).
- Tidak muncul toast notifikasi dari `notify.success('Transaksi berhasil disimpan.')`.
- Aplikasi langsung pindah (navigate) ke halaman pratinjau kartu peminjaman (`/borrowings/:id/receipt-preview`).

Kesimpulan dari gejala: `create()` berhasil (tidak ada alert error dari catch), namun toast yang seharusnya muncul tidak terlihat.

## 2. Pertanyaan Investigasi — Jawaban

| # | Pertanyaan | Jawaban |
|---|-----------|---------|
| 1 | Posisi `<NotificationProvider>` vs `<RouterProvider>` | Provider DI ATAS router (`src/renderer/App.tsx`). Provider TIDAK unmount saat navigasi. |
| 2 | Apakah `notify.success()` benar-benar dipanggil? | **YA.** Di `src/pages/BorrowingsPage.tsx` jalur sukses `handleSave()` setelah `await create()` sukses, sebelum `navigate(...)`. Bukti tidak ada alert sama sekali → `create()` sukses → jalur sukses tereksekusi. |
| 3 | Apakah toast masuk reducer tapi belum dirender? | Toast **masuk reducer** (dispatch sinkron, `toast/add`). Renderer hanya merender viewport bila `toasts.length > 0` — toast tidak pernah hilang dari state sebelum waktu dismiss (3 dtk). Masalahnya BUKAN di state. |
| 4 | Apakah `navigate()` terjadi sebelum frame pertama toast? | Bukan penyebab. React 18 batching meng-flush dispatch + navigate dalam commit yang sama, tetapi `<NotificationProvider>` di atas router TIDAK unmount → viewport tetap terpasang di `document.body` → toast tetap dirender di halaman tujuan (preview) selama durasinya. Navigasi tidak menghapus toast. |
| 5 | Apakah `<ToastViewport>` tetap hidup setelah route berubah? | **YA.** `ToastViewport` di-render oleh `NotificationProvider` (di atas router) dan di-portal ke `document.body` via `createPortal`. Survive lintas route. |

## 3. Root Cause — Tailwind `content` globs tidak mencakup `src/notification/`

`tailwind.config.js`:

```js
content: [
  './src/renderer/index.html',
  './src/renderer/**/*.{js,ts,jsx,tsx}',
  './src/components/**/*.{js,ts,jsx,tsx}',
  './src/pages/**/*.{js,ts,jsx,tsx}',
  './src/routes/**/*.{js,ts,jsx,tsx}'
],
```

**`./src/notification/**/*` tidak ada.** Akibatnya seluruh class utility Tailwind yang HANYA dipakai di `src/notification/*.tsx` TIDAK pernah di-generate ke CSS final. Class tersebut dihapus dari output CSS oleh purge Tailwind saat build. Toast & confirm dialog tetap masuk DOM (JS bundle ada, karena Vite/Rollup bundle semua modul — Tailwind purge terpisah dari bundling), tetapi tanpa style positioning maupun visual.

### 3.1 Kelas yang hilang (verifikasi CSS build `out/renderer/assets/index-BSa87M2u.css`)

Class notification-eksklusif yang **MISSING** di CSS:

| Class | Dipakai di | Efek bila hilang |
|-------|-----------|------------------|
| `top-14`, `right-4`, `z-[90]` | `ToastViewport.tsx:15` | Viewport `fixed` tanpa offset/z-index → duduk di posisi statis (bawah `<body>`, di bawah konten 100vh) → **tak terlihat** |
| `z-[100]` | `ConfirmDialog.tsx` | Dialog confirm tumpang tindih z-index salah |
| `bg-emerald-500`, `bg-rose-500`, `bg-amber-500`, `bg-sky-500` | `ToastItem.tsx:13-16` | Bar aksen kiri toast tidak berwarna |
| `.w-1` | `ToastItem.tsx:27` | Bar aksen tidak tampil |
| `hover:bg-slate-100`, `hover:text-slate-500` | `ToastItem.tsx:33` | Hover tombol tutup mati |
| `.pr-2` | `ToastItem.tsx:25` | Padding kanan toast kurang |

Class yang KEBETULAN ada karena dipakai file lain yang tercakup globs (bukan bukti notification terscan): `.fixed`, `.toast-enter` (keyframes hand-written di `styles.css`), `.w-80`, `rounded-lg`, `bg-white`, `border-slate-200`, `shadow-lg`, `text-emerald-500`.

### 3.2 Mengapa build & lint tetap PASS

- **Tailwind purge bersifat diam-diam** — class yang tidak tercakup `content` dihapus tanpa error.
- `tsconfig.web.json` sudah menambahkan `src/notification/**/*` untuk TypeScript (type-check OK), tapi **scan Tailwind terpisah** dari tsconfig — Tailwind hanya baca globs `content` di `tailwind.config.js`.
- Bundle renderer tetap memuat JS komponen (Vite/Rollup bundle semua source), hanya CSS utility-nya yang di-purge.

## 4. Bukti

1. `tailwind.config.js:3-9` — globs content tanpa `src/notification/**/*`.
2. Grep CSS build `out/renderer/assets/index-BSa87M2u.css`: `top-14`, `right-4`, `z-[90]`, `z-[100]`, `bg-emerald-500`, `.pr-2`, `.w-1`, `hover:bg-slate-100` → semua MISSING.
3. JS bundle `out/renderer/assets/index-BxKcJ9qP.js:15192` masih memuat `className="pointer-events-none fixed top-14 right-4 z-[90] flex flex-col gap-2"` — konfirmasi class TERTULIS di DOM namun rule CSS-nya tidak ada.
4. `src/renderer/App.tsx` — `<NotificationProvider>` membungkus `<RouterProvider>` (bukan penyebab).
5. `src/pages/BorrowingsPage.tsx` — `notify.success` dipanggil di jalur sukses (bukan penyebab).

## 5. Perbaikan yang Disarankan (BELUM dieksekusi — READ ONLY)

Tambahkan glob `./src/notification/**/*.{js,ts,jsx,tsx}` ke `content` di `tailwind.config.js`, lalu **build ulang** (`npm run build`) dan verifikasi CSS baru memuat `top-14`, `right-4`, `z-[90]`, `z-[100]`, `bg-emerald-500` dst. Karena commit terakhir (NS-2) sudah ter-build, artifact `dist/` yang dipakai user juga perlu rebuild+repackage bila perbaikan dieksekusi (pelajaran WO-2 Investigation: uji artifact, bukan source).

## 6. Files Tidak Disentuh (README constraint)

Tidak ada file source yang diubah dalam investigasi ini. Tidak ada commit.
