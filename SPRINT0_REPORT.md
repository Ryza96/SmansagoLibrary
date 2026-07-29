# Sprint 0 — Laporan Readiness Foundation Project Initialization

**Project:** APLibrary (Aplikasi Perpustakaan Desktop)  
**Tanggal:** 29 Juli 2026  
**Status:** ✅ READY

---

## 1. Ringkasan

Sprint 0 berhasil menyelesaikan fondasi project APLibrary. Seluruh konfigurasi, struktur, dan toolchain telah siap. Project dapat dijalankan dalam mode development dan di-build menjadi aplikasi desktop (.exe).

---

## 2. Checklist Readiness

| Item | Status | Keterangan |
|------|--------|------------|
| Inisialisasi project ✅ | `package.json`, dependency terinstall |
| Struktur project ✅ | main, preload, renderer, prisma, scripts |
| TypeScript ✅ | Strict mode, 3 tsconfig files (root/node/web) |
| Vite + electron-vite ✅ | Build multi-process (main, preload, renderer) |
| React 18 ✅ | Renderer process dengan React + TypeScript |
| Electron 33 ✅ | Main process, preload, IPC, window management |
| SQLite ✅ | Database file-based, sudah terkonfigurasi |
| Prisma ORM ✅ | Schema, generate, migrate — semua berhasil |
| IPC Communication ✅ | contextBridge + ipcMain/ipcRenderer |
| Keamanan ✅ | contextIsolation, nodeIntegration disabled, CSP |
| electron-builder ✅ | Konfigurasi NSIS installer untuk Windows |
| Build verification ✅ | `npm run build` berhasil (main 2.26 kB, preload 0.31 kB, renderer 216 kB) |
| Type check ✅ | `tsc --noEmit` lulus tanpa error |
| Development scripts ✅ | `dev-setup.ps1`, `run.ps1`, `npm run dev` |
| Dokumentasi ✅ | README.md dengan struktur, instalasi, cara menjalankan |

---

## 3. Keputusan Implementasi

### 3.1. Electron + Vite via electron-vite
Menggunakan `electron-vite` (alex8088) sebagai build tool karena menyediakan konfigurasi terpadu untuk main, preload, dan renderer process dalam satu Vite config. Mendukung HMR di renderer, fast reload di main process, dan output terstruktur.

### 3.2. Arsitektur 3 Layer (Main – Preload – Renderer)
- **Main Process**: Node.js runtime, Prisma ORM, IPC handlers.
- **Preload**: contextBridge untuk expose API terbatas ke renderer.
- **Renderer**: React SPA, tidak ada akses langsung ke Node.js atau database.

### 3.3. Prisma di Main Process
Prisma client diinisialisasi sebagai singleton di main process (`src/main/database.ts`). Renderer tidak boleh mengakses Prisma langsung — seluruh operasi database melalui IPC. Ini adalah praktik standar Electron untuk keamanan dan performa.

### 3.4. SQLite dengan Prisma
SQLite dipilih sebagai database lokal karena zero-config, file-based, portabel, dan tidak memerlukan server terpisah. File database (`aplibrary.db`) akan berada di folder `prisma/`.

### 3.5. electron-builder untuk Packaging
Menggunakan NSIS installer untuk Windows. Konfigurasi `electron-builder.yml` sudah mencakup:
- Prisma native binary (`.node` files) ikut di-pack.
- `asarUnpack` untuk file binary Prisma.
- OneClick installer opsional (nonaktif).

### 3.6. TypeScript Strict Mode
Seluruh project menggunakan TypeScript strict mode untuk memastikan type safety sejak awal.

---

## 4. Dependency & Alasan

### Production Dependencies

| Dependency | Versi | Alasan |
|------------|-------|--------|
| `@prisma/client` | ^5.22.0 | ORM client untuk query SQLite. Type-safe, auto-generated. |

### Development Dependencies

| Dependency | Versi | Alasan |
|------------|-------|--------|
| `electron` | ^33.2.1 | Framework desktop utama. Target Windows .exe. |
| `react` | ^18.3.1 | UI library untuk renderer process. |
| `react-dom` | ^18.3.1 | React DOM renderer. |
| `electron-vite` | ^2.3.0 | Build tool: Vite + Electron integration. HMR, multi-process build. |
| `@vitejs/plugin-react` | ^4.3.4 | Vite plugin untuk React Fast Refresh. |
| `typescript` | ^5.6.3 | Type safety & developer experience. |
| `electron-builder` | ^25.1.8 | Packaging Electron app ke .exe (NSIS installer). |
| `prisma` | ^5.22.0 | Prisma CLI: schema management, migrasi, studio, generate. |
| `@types/react` | ^18.3.12 | Type definitions untuk React. |
| `@types/react-dom` | ^18.3.1 | Type definitions untuk React DOM. |

Tidak ada tambahan dependency lain karena belum ada fitur bisnis yang diimplementasikan.

---

## 5. Catatan untuk Sprint Berikutnya

### Persiapan yang sudah dilakukan:
- Struktur project siap menerima fitur baru.
- Komponen IPC sudah siap — tinggal menambah handler dan channel baru.
- Prisma schema siap — tinggal menambah model bisnis (Buku, Anggota, Peminjaman, dll).
- React root component `App.tsx` siap — tinggal menambah routing dan komponen fitur.

### Yang perlu diperhatikan:
- **Prisma native binary**: Saat packaging, pastikan binary `.node` files ikut serta. Konfigurasi di `electron-builder.yml` sudah mengatur ini.
- **Path database di production**: Di environment production, path database perlu diarahkan ke `app.getPath('userData')` agar data tersimpan di folder yang benar saat aplikasi sudah di-install.
- **Auto-updater**: Belum dikonfigurasi — akan dibahas di sprint mendatang jika diperlukan.

---

## 6. Verifikasi

| Langkah | Hasil |
|---------|-------|
| `npm install` | ✅ 479 packages, tanpa error |
| `npx prisma generate` | ✅ Prisma Client generated |
| `npx prisma migrate dev --name init` | ✅ Migration applied, SQLite database created |
| `npm run build` | ✅ Main (2.26 kB), Preload (0.31 kB), Renderer (216 kB) |
| `npm run lint` (tsc --noEmit) | ✅ No type errors |

---

**Kesimpulan: Sprint 0 selesai. Project siap memasuki Sprint 1 untuk implementasi fitur bisnis.**

*Laporan ini disusun oleh Project Engineer (OpenCode).*
