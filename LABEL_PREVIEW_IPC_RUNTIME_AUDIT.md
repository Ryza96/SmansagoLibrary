# LABEL_PREVIEW_IPC_RUNTIME_AUDIT.md

Work Order: **Audit Chain IPC — `printing:labelPreview`**
Mode: READ ONLY (kecuali tindakan diagnostik `npm run build`/pembacaan artefak — tidak mengubah source, tidak staging, tidak commit)
Date: 2026-08-02
Error target: `Error invoking remote method 'printing:labelPreview'` / `No handler registered for 'printing:labelPreview'`

---

## Ringkasan Eksekutif

**Rantai IPC di SOURCE 100% benar dan lengkap.** `ipcMain.handle('printing:labelPreview', …)` ada, terdaftar, memakai instance yang sama, dan nama channel identik di preload. Error runtime **bukan** berasal dari kode.

**Root cause: main process yang sedang berjalan adalah build lama (stale).** Proses Electron yang hidup dimulai **01/08 22:25:49**, sedangkan handler baru ditulis di source pada **02/08 00:09:14** dan `out/main/index.js` baru di-build pada **02/08 00:34:09**. `ipcMain.handle()` hanya dieksekusi **sekali saat startup** (`app.whenReady` → `registerAllHandlers`). Main process yang berjalan sejak 22:25 memuat `out/main/index.js` lama yang **belum punya** `printing:labelPreview`, sehingga pada runtime channel tersebut tidak pernah didaftarkan. Renderer (kode baru, lewat dev/HMR) memanggil `ipcRenderer.invoke('printing:labelPreview', …)` → main membalas "No handler registered".

**Perbaikan (belum dieksekusi — READ ONLY): cukup RESTART aplikasi / `npm run dev`** agar main me-reload `out/main/index.js` fresh yang sudah berisi handler (sudah diverifikasi).

---

## Jawaban per Pertanyaan (dengan bukti)

### 1. `electron/ipc/print.ipc.ts` — apakah berisi `ipcMain.handle('printing:labelPreview', ...)`?

**YA.** `electron/ipc/print.ipc.ts:6-8`:

```ts
export function registerPrintHandlers(printService: PrintService): void {
  ipcMain.handle('printing:labelPreview', async (_event, data: BookLabelData) =>
    printService.getLabelPreviewHtml(data)
  )
  ...
}
```

### 2. `electron/ipc/index.ts` — apakah `registerPrintHandlers()` benar-benar dipanggil?

**YA.** `electron/ipc/index.ts:32` mengimpor `registerPrintHandlers` dari `./print.ipc`, dan **`electron/ipc/index.ts:75`** memanggilnya di dalam `registerAllHandlers`:

```ts
registerPrintHandlers(services.printService)
```

### 3. `electron/main/bootstrap.ts` — instance `PrintService` sama?

**YA.** Satu-satunya `PrintService` dibuat di `electron/main/bootstrap.ts:94` (`const printService = new PrintService(borrowRepository, settingService)`), dimasukkan ke container (`bootstrap.ts:115`), dan `electron/main/index.ts:40-41` memanggil `createContainer()` lalu `registerAllHandlers(container, () => mainWindow)` — container yang sama diteruskan, jadi handler memakai instance yang persis sama.

### 4. Perbandingan channel preload vs IPC — identik?

**YA. Identik huruf-demi-huruf:**

| Sisi | Lokasi | Channel |
|---|---|---|
| Preload | `electron/preload/print.preload.ts:6` | `ipcRenderer.invoke('printing:labelPreview', data)` |
| Main | `electron/ipc/print.ipc.ts:6` | `ipcMain.handle('printing:labelPreview', ...)` |

### 5. Jika semua benar, mengapa Electron masih bilang "No handler registered"?

**Karena main process yang sedang berjalan tidak pernah mendaftarkan channel itu.** Bukti (timeline file & proses, bukan dugaan):

| Artefak | Waktu |
|---|---|
| `electron/ipc/print.ipc.ts` (handler ditambahkan) | 02/08 00:09:14 |
| `electron/preload/print.preload.ts` (method ditambahkan) | 02/08 00:09:19 |
| **`out/main/index.js` di-build (sudah berisi handler)** | **02/08 00:34:09** |
| **Proses Electron yang sedang hidup (`node_modules\electron\dist\electron.exe`, PID 1664/2832/11608/22432)** | **01/08 22:25:49–50** |

- Main process berjalan **~2 jam sebelum** `out/main/index.js` di-build. Yang dimuatnya adalah versi lama **tanpa** `printing:labelPreview`.
- `ipcMain.handle()` dieksekusi **sekali saat startup** (`electron/main/index.ts:36-45` → `app.whenReady` → `registerAllHandlers`). Proses yang sudah berjalan **tidak pernah** mengeksekusi baris pendaftaran handler baru — berapa pun kali renderer memanggilnya.
- Tidak ada `ipcMain.removeHandler`/`removeAllListeners` di seluruh `electron/` (grep = 0), jadi handler tidak mungkin di-unregister setelah startup.

Verifikasi build fresh:
- `npm run build` (02/08 00:34, dan dijalankan ulang pada audit ini) → **PASS**.
- `out/main/index.js` **memuat** string `printing:labelPreview` dan blok `ipcMain.handle("printing:labelPreview", …)` di dalam `registerPrintHandlers` (diverifikasi lewat inspect byte bundle).
- `out/preload/index.js` **memuat** `getLabelPreviewHtml` dan `printing:labelPreview` (diverifikasi).
- Artifak paket `dist/win-unpacked/resources/app.asar` (52,3 MB) **TIDAK** memuat `printing:labelPreview`, `getLabelPreviewHtml`, maupun route `labels-preview` — paket juga stale (mendahului fitur). Jadi error ini konsisten dengan menjalankan instance yang berbasis build sebelum fitur ada.

Mengapa pesan spesifiknya "No handler registered" (bukan "function not defined")? Pesan itu dihasilkan saat renderer **berhasil memanggil** `ipcRenderer.invoke('printing:labelPreview', …)` — artinya preload/renderer yang dipakai sudah versi baru (kode renderer baru tampil lewat dev/HMR), tetapi main yang menanggapi adalah proses lama tanpa handler. Kombinasi **renderer baru + main lama** inilah yang memunculkan error persis ini.

### Catatan soal log sementara
Pembuktian tambahan dengan `console.log` di `registerPrintHandlers` **tidak diperlukan** — bukti timestamp di atas sudah menentukan: proses main berjalan sebelum handler ada di source/build, dan `ipcMain.handle` adalah registrasi sekali-startup. (Sekalipun log ditambahkan, proses lama tidak akan menampilkannya tanpa restart.)

---

## Kesimpulan

- SOURCE chain: **PASS** (Q1–Q4 benar semua).
- RUNTIME: **stale main process** — proses Electron dimulai 01/08 22:25:49, mendahului penambahan handler (02/08 00:09) dan build (02/08 00:34). Error "No handler registered for 'printing:labelPreview'" adalah konsekuensi main yang berjalan memuat bundle lama.
- **Fix paling sederhana (tidak dieksekusi, READ ONLY): restart aplikasi / jalankan ulang `npm run dev`** agar main memuat `out/main/index.js` fresh yang sudah berisi handler.

## Status

**ROOT CAUSE DITEMUKAN — bukan bug source. Perbaikan = restart main process. Berhenti di sini.**
