# NS2_TOAST_FIX_FINAL_REVIEW.md

**Status:** COMPLETE — READY review PO
**WO:** Perbaikan NS-2 Toast tidak terlihat (Tailwind content scan)

---

## 1. Ringkasan

Bug "toast tidak muncul setelah SIMPAN TRANSAKSI" (ditemukan di NS-2, root cause didokumentasikan di `NS2_TOAST_INVESTIGATION.md`) diperbaiki dengan menambahkan glob `./src/notification/**/*` ke `content` `tailwind.config.js`. Perbaikan murni build-config — **tidak ada perubahan kode aplikasi**.

## 2. Gate Validation

| Gate | Hasil |
|------|-------|
| `npm run lint` (tsc node + web) | PASS |
| `npm run build` | PASS — main 1,882.54 kB · preload 9.95 kB · renderer 1,147.66 kB |
| CSS build memuat 5 class wajib | PASS — `top-14`, `right-4`, `z-[90]`, `z-[100]`, `bg-emerald-500` semua FOUND di `index-Catve8Qm.css` |
| `prisma migrate diff --from-migrations` | "This is an empty migration." (schema tidak disentuh) |
| `git status` | hanya `tailwind.config.js` + laporan + AGENTS.md (file untracked WO lain tidak diikutkan) |

## 3. UAT (sesuai instruksi)

Alur: **Klik SIMPAN TRANSAKSI → Toast hijau muncul → Toast tetap terlihat meskipun halaman berpindah ke Preview.**

### Verifikasi headless (otomatis, PASS)

1. **Kode path sukses** (`src/pages/BorrowingsPage.tsx:120-137`):
   - `const result = await window.electronAPI.borrowings.create(input)` → sukses
   - `notify.success('Transaksi berhasil disimpan.')` (baris 129)
   - `navigate(receiptPreviewPath(result.id))` (baris 130) — notify dipanggil SEBELUM navigate
2. **Provider di atas router** (`src/renderer/App.tsx`): `<NotificationProvider>` membungkus `<RouterProvider>` → provider & ToastViewport (portal ke `document.body`) tetap hidup saat route pindah ke `/borrowings/:id/receipt-preview`. Toast bertahan 3 detik (auto-dismiss `NOTIFICATION_DURATION.success`) dan terlihat di halaman preview.
3. **CSS class toast sekarang di-generate** — semua class viewport/toast FOUND di bundle CSS:
   - `pointer-events-none fixed top-14 right-4 z-[90]` → viewport terposisi top-right, z-index di atas konten
   - `bg-emerald-500` → bar aksen hijau (status success) tampil
   - `.toast-enter` (animasi hand-written di `styles.css`) tetap ada
4. **JS bundle renderer memuat** `Transaksi berhasil disimpan.`, `top-14 right-4 z-[90]`, `toast-enter`, `receipt-preview` → semua FOUND di `index-BtTFigCP.js`.

### Item yang memerlukan runtime Electron (manual PO)

Klik nyata pada SIMPAN TRANSAKSI, visual toast hijau di pojok kanan atas, dan persistensinya ke halaman preview memerlukan runtime Electron + UI. Verifikasi otomatis di atas membuktikan kode path + CSS + bundle; konfirmasi visual manual oleh PO direkomendasikan (pola yang sama dengan FINAL UAT Borrow Card).

## 4. Kesimpulan

Fix benar dan minimal. Root cause (Tailwind purge tanpa `src/notification/`) tereliminasi; CSS build kini memuat seluruh utility Notification System. Tidak ada perubahan perilaku lain. **DONE — READY review PO.**

## 5. Catatan pelajaran

- **Tailwind `content` ≠ tsconfig include.** `tsconfig.web.json` bisa meng-*include* `src/notification/**` (type-check PASS) padahal Tailwind tidak men-scan folder itu → build hijau tapi class di-purge. Verifikasi bug UI bergaya Tailwind harus mengecek CSS hasil build (grep `top-14`/`z-[90]`/dst), bukan hanya tsc.
- **Class yang "ada" di CSS belum tentu dari file itu** — `.fixed`, `.w-80`, `bg-white` dkk KEBETULAN di-generate oleh file lain yang tercakup globs. Bukti scan Notification yang benar = class eksklusif-nya (`top-14`, `z-[90]`, `z-[100]`, `bg-emerald-500`) baru muncul setelah glob ditambahkan.
