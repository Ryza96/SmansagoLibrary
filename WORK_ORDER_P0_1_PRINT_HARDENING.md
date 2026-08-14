# WORK ORDER P0-1 — HARDEN BOOK LABEL PRINTING (`printHtml` fail-safe)

**Status: DONE — READY review PO.** Tidak commit, tidak push, tidak package.

## 1. Files Changed

- `electron/main/services/print.service.ts` — **SATU-SATUNYA file source yang diubah** (`git diff --stat`: 105 insertions, 8 deletions).
- `p0_1_print_hardening_smoke/main.cjs` — harness smoke baru (untracked, mengikuti pola smoke project).

## 2. Technical Changes

`PrintService.printHtml` di-rewrite menjadi fail-safe. Kontrak public TIDAK berubah
(signature `printHtml(html, printOptions?)` dan kontrak resolve/reject identik);
seluruh hardening aditif di dalam implementasi:

1. **TIMEOUT menyeluruh** — `setTimeout` mencakup SELURUH operasi cetak
   (load → dialog OS → callback `webContents.print`). Operasi cetak kini TIDAK
   bisa menggantung tanpa batas bila callback tidak pernah datang (Candidate A:
   dialog tersembunyi di balik window yang dimaksimalkan / driver tidak
   merespons).
2. **CLEANUP DIJAMIN** — settlement tunggal + teardown terpusat di `finish`:
   setelah settled, semua jalur (event, callback print, timer) menjadi no-op,
   event listener `did-finish-load`/`did-fail-load` dilepas, lalu
   `printWindow.close()` dipanggil **tepat satu kali**. Tidak ada lagi pola lama
   `if (!printWindow.isDestroyed()) printWindow.close()` yang terduplikasi di 3
   jalur tanpa jaminan.
3. **`loadURL` di-await** — rejection ditangani (sebelumnya fire-and-forget);
   `did-fail-load` dipertahankan sebagai sumber detail (`errorCode`/
   `errorDescription`).
4. **DUA JALUR ERROR TIDAK BISA DOUBLE-SETTLE** — guard `settled` mencegah
   resolve/reject dua kali dari kombinasi {callback gagal, did-fail-load,
   loadURL reject, timeout, close}.
5. **Logging `[Print]` tahap-per-tahap** — `start (timeout=…)`, `loadURL
   selesai`, `print invoked (silent, deviceName)`, `print callback
   success/gagal`, `timeout … tercapai`, `gagal menyiapkan opsi cetak`,
   `did-fail-load`, `loadURL gagal`, `cleanup`. Berguna untuk diagnosis saat
   bug kambuh di perangkat PO.

`resolvePrintOptions` kini melakukan `delete rest.timeoutMs` — field
`timeoutMs` adalah opsi INTERNAL `printHtml`, TIDAK diteruskan ke
`webContents.print` (mencegah properti tak dikenal bocor ke dialog/driver).

## 3. Timeout Value + Rationale

`PRINT_HTML_TIMEOUT_MS = 120_000` (120 s), override per-panggilan via
`printOptions.timeoutMs` (smoke memakai 300 ms agar jalur timeout teruji tanpa
menunggu 120 s).

Rasional: alur cetak memakai dialog OS **non-silent** (`silent:false`) dan
operator bisa memerlukan waktu untuk memilih printer/kertas/mengklik Cetak pada
perangkat lambat. Fungsi timeout adalah **mengikat hang yang TIDAK PERNAH
selesai** (callback tidak datang), bukan menagih operator yang wajar — pada
pemakaian normal 120 s praktis tidak tercapai.

## 4. Cleanup Guarantee

- Settlement tunggal → teardown terpusat → `printWindow.close()` dipanggil
  tepat satu kali di semua jalur (sukses, callback gagal, did-fail-load,
  loadURL reject, timeout).
- Listener event dilepas **sebelum** close agar teardown window tidak memicu
  event tambahan setelah settlement.
- Guard `printWindow.isDestroyed()` sebelum close; `close()` dibungkus
  try/catch (gagal menutup = warning, bukan crash).
- Bukti smoke: setiap kasus (sukses, callback gagal, timeout, loadURL gagal,
  regresi label) memverifikasi window yang dibuat sejak awal kasus tersebut
  TELAH `isDestroyed()` setelah promise selesai (polling singkat karena
  `close()`/`destroy()` bisa selesai pada tick berikutnya).

## 5. Error Surfacing

- **Timeout** → reject `Error` dengan pesan eksplisit:
  `"Cetak tidak selesai dalam <N> ms — dialog cetak mungkin tersembunyi atau
  proses native tidak merespons. Silakan coba lagi."`
- **Callback gagal** → reject `new Error(failureReason ?? 'Gagal mencetak')`
  (perilaku lama dipertahankan).
- **did-fail-load** → reject `Gagal memuat halaman cetak: <errorDescription>`.
- **loadURL reject** → reject error asli.
- Error yang muncul di layar pemanggil (UI) sekarang selalu dalam **batas
  waktu terbatas** — tidak lagi hang diam-diam.

## 6. Tests + Results

Smoke baru `p0_1_print_hardening_smoke` (Electron runtime, kompilasi
`print.service.ts` asli, intercept `BrowserWindow.prototype.loadURL` →
`webContents.print` spy). **12/12 PASS**:

| # | Kasus | Bukti |
|---|-------|-------|
| 1 | Sukses: callback(true) → resolve tanpa throw | resolve |
| 1b | Cleanup: window ditutup setelah sukses | isDestroyed |
| 1c | Opsi cetak TIDAK memuat timeoutMs (di-strip) | captured opts tanpa timeoutMs |
| 2 | Callback gagal → reject dengan reason | message = "dialog closed" |
| 2b | Cleanup setelah callback gagal | isDestroyed |
| 3 | Callback TIDAK PERNAH datang → timeout (timeoutMs=300) | reject pesan timeout; elapsed 320ms ≥ 250ms |
| 3b | Cleanup setelah timeout | isDestroyed |
| 4 | loadURL reject → reject error asli | message = "simulated load failure" |
| 4b | Cleanup walau loadURL gagal | isDestroyed |
| R | Regresi label: `printBookLabels` resolve | jalur label tetap bekerja |
| R2 | Opsi label margins none + TANPA pageSize | captured opts |
| R3 | Cleanup window label | isDestroyed |

`SMOKE_RESULT=PASS`, exit 0.

## 7. Lint Result

`npm run lint` (`tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json
--noEmit`) → **PASS** (exit 0, tanpa output error).

## 8. Build Result

`npm run build` (electron-vite) → **PASS**:
main `out/main/index.js` 2,440.35 kB · preload `out/preload/index.js` 13.24 kB ·
renderer `out/renderer/assets/index-DBa7d455.js` 1,291.04 kB.

Regression `borrow_card_print_fix_smoke` (print pipeline kartu A6 105×148,
PDF MediaBox, label A4) pada kompilasi baru → **17/17 PASS** (`SMOKE_RESULT=PASS`).
Jalur print/PDF yang mengalir lewat `printHtml` ikut teruji dengan implementasi
baru (kartu + label + PDF).

## 9. Out of Scope = NONE

Tidak ada perubahan di luar `print.service.ts` + harness smoke. DB/schema/migration,
IPC/preload/env/bootstrap, UI, layout label/kartu, barcode, auth, impor anggota,
konfigurasi installer, `silent:false` (dipertahankan), dan heuristik `deviceName`
label (tidak dipaksa) semuanya TIDAK disentuh. `git status` hanya menunjukkan
`M electron/main/services/print.service.ts` + file untracked (harness + 5 audit
.md pra-eksisting, tidak diikutkan).

## 10. Root Cause Status

**ROOT CAUSE TETAP "NOT CONFIRMED — Candidate A LIKELY".** Per instruksi PO:
kebenaran fix TIDAK otomatis mengonfirmasi root cause. Fix ini menghilangkan
kemungkinan hang tak terbatas (Candidate A) dan menambah diagnosability, tetapi
bukti definitif (mengapa kartu tidak pernah tercetak di perangkat PO) hanya bisa
diperoleh dari log `[Print]` tahap-per-tahap saat bug kambuh di perangkat
tersebut. **Langkah berikutnya (di luar WO ini):** uji print label di perangkat
PO dengan build baru; jika masih gagal, kumpulkan log `[Print]` dari `main`
untuk mengonfirmasi/mengeliminasi Candidate A. Build/package/commit TIDAK
dilakukan tanpa persetujuan PO.
