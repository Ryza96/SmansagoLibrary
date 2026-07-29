# Sprint 2 — Laporan Application Shell

**Project:** APLibrary (Aplikasi Perpustakaan Desktop)  
**Tanggal:** 29 Juli 2026  
**Status:** ✅ SELESAI

---

## 1. Ringkasan

Application Shell telah selesai dibangun sebagai struktur UI permanen aplikasi. Seluruh layout, routing, navigasi, dan status bar sudah terpasang dan siap digunakan oleh sprint-sprint berikutnya.

### Yang Diimplementasikan
- Layout 3 bagian: TopBar, Main Area (Sidebar + Content), StatusBar
- Sidebar dengan 8 menu navigasi + icons
- React Router dengan 8 halaman placeholder
- TopBar dengan window controls (minimize, maximize, close) via IPC
- StatusBar dengan informasi database & aplikasi via IPC yang sudah ada
- Tailwind CSS untuk styling
- Window controls IPC handlers di main process

### Yang Tidak Diimplementasikan (sesuai scope)
- CRUD — belum
- Form — belum
- Koneksi ke repository/service — belum (kecuali status database yang sudah ada)
- Fitur bisnis — belum

---

## 2. Struktur Folder

```
src/renderer/src/
├── main.tsx                        # Entry point (tidak berubah)
├── App.tsx                         # Root component → RouterProvider
├── index.html                      # Entry HTML (tidak berubah)
├── env.d.ts                        # Type declarations (+ window controls)
├── assets/
│   └── styles.css                  # + Tailwind directives
├── components/
│   └── layout/
│       ├── AppLayout.tsx           # Layout 3-bagian + Outlet
│       ├── TopBar.tsx              # Header: APLibrary, Admin, Window Controls
│       ├── Sidebar.tsx             # Nav menu: 8 items, NavLink, icons
│       └── StatusBar.tsx           # Footer: SQLite, version, Electron, Node
├── pages/
│   ├── DashboardPage.tsx           # /
│   ├── BooksPage.tsx               # /books
│   ├── MembersPage.tsx             # /members
│   ├── BorrowingsPage.tsx          # /borrowings
│   ├── ReturnsPage.tsx             # /returns
│   ├── InventoryPage.tsx           # /inventory
│   ├── ReportsPage.tsx             # /reports
│   └── SettingsPage.tsx            # /settings
└── routes/
    └── index.tsx                   # createHashRouter config
```

---

## 3. Layout

```
┌─────────────────────────────────────────────────────┐
│ TopBar                                              │
│ APLibrary              Admin  [Settings] [-][□][×]  │
├────────┬────────────────────────────────────────────┤
│        │                                            │
│Sidebar │  Content Area                              │
│        │                                            │
│ 📊 Dash│  Dashboard                                 │
│ 📖 Buku│  Modul Dashboard sedang dalam              │
│ 👥 Angg│  pengembangan.                             │
│ ✅ Pem│                                            │
│ ↩️ Peng│                                            │
│ 📋 Inv│                                            │
│ 📊 Lap│                                            │
│ ⚙️ Peng│                                            │
│        │                                            │
├────────┴────────────────────────────────────────────┤
│ StatusBar                                           │
│ ● SQLite  v0.1.0  Electron 33  Node 22             │
└─────────────────────────────────────────────────────┘
```

### Komponen Layout

| Komponen | Posisi | Fungsi |
|----------|--------|--------|
| TopBar | Atas | Nama aplikasi, user info, window controls |
| Sidebar | Kiri | Navigasi utama (8 menu) |
| Content Area | Tengah | Halaman dirender oleh Router |
| StatusBar | Bawah | Status database, versi aplikasi |

---

## 4. Daftar Halaman & Routes

| Route | File | Judul |
|-------|------|-------|
| `/` | — | Redirect ke `/dashboard` |
| `/dashboard` | `DashboardPage.tsx` | Dashboard |
| `/books` | `BooksPage.tsx` | Buku |
| `/members` | `MembersPage.tsx` | Anggota |
| `/borrowings` | `BorrowingsPage.tsx` | Peminjaman |
| `/returns` | `ReturnsPage.tsx` | Pengembalian |
| `/inventory` | `InventoryPage.tsx` | Inventaris |
| `/reports` | `ReportsPage.tsx` | Laporan |
| `/settings` | `SettingsPage.tsx` | Pengaturan |

Semua halaman berisi judul + kalimat placeholder.

---

## 5. Arsitektur Komunikasi

```
Renderer (Router → Page)
    ↓
IPC (preload/contextBridge)
    ↓
Main Process
    ├── db:ping          → StatusBar
    ├── app:info         → StatusBar
    ├── window:minimize  → TopBar
    ├── window:maximize  → TopBar
    └── window:close     → TopBar
```

Tidak ada Page yang mengakses Repository secara langsung — sesuai arsitektur.

---

## 6. Dependency Baru

| Dependency | Versi | Alasan |
|-----------|-------|--------|
| `react-router-dom` | ^6.x | Routing SPA, single navigation source |
| `lucide-react` | ^0.x | Icon set ringan, tree-shakeable |
| `tailwindcss` | ^3.x (dev) | Styling utility-first, required by spec |
| `postcss` | ^8.x (dev) | PostCSS processor untuk Tailwind |
| `autoprefixer` | ^10.x (dev) | Prefix CSS otomatis |

---

## 7. File yang Dibuat/Diubah

### File Baru (11 files)

| File | Deskripsi |
|------|-----------|
| `src/renderer/src/components/layout/AppLayout.tsx` | Layout wrapper dengan Outlet |
| `src/renderer/src/components/layout/TopBar.tsx` | Header bar |
| `src/renderer/src/components/layout/Sidebar.tsx` | Navigasi sidebar |
| `src/renderer/src/components/layout/StatusBar.tsx` | Status bar bawah |
| `src/renderer/src/pages/DashboardPage.tsx` | Halaman Dashboard |
| `src/renderer/src/pages/BooksPage.tsx` | Halaman Buku |
| `src/renderer/src/pages/MembersPage.tsx` | Halaman Anggota |
| `src/renderer/src/pages/BorrowingsPage.tsx` | Halaman Peminjaman |
| `src/renderer/src/pages/ReturnsPage.tsx` | Halaman Pengembalian |
| `src/renderer/src/pages/InventoryPage.tsx` | Halaman Inventaris |
| `src/renderer/src/pages/ReportsPage.tsx` | Halaman Laporan |
| `src/renderer/src/pages/SettingsPage.tsx` | Halaman Pengaturan |
| `src/renderer/src/routes/index.tsx` | Router configuration |
| `tailwind.config.js` | Tailwind CSS config |
| `postcss.config.js` | PostCSS config |

### File Diubah (5 files)

| File | Perubahan |
|------|-----------|
| `src/renderer/src/App.tsx` | Dari komponen sederhana → RouterProvider |
| `src/renderer/src/assets/styles.css` | + Tailwind directives |
| `src/renderer/src/env.d.ts` | + Window control types |
| `src/main/index.ts` | + IPC handlers: window:minimize, maximize, close |
| `src/preload/index.ts` | + window API (minimize, maximize, close) |
| `package.json` | + dependencies baru |

---

## 8. Hasil Validasi

| Langkah | Status | Keterangan |
|---------|--------|------------|
| `npm run build` | ✅ | Main (2.60 kB), Preload (0.53 kB), Renderer (458 kB JS, 14.2 kB CSS) |
| `npm run lint` (tsc) | ✅ | No errors |

---

## 9. Temuan

Tidak ada temuan signifikan. Semua sesuai spesifikasi.

### Catatan Arsitektur
- **Hash Router**: Menggunakan `createHashRouter` (bukan `createBrowserRouter`) karena Electron menggunakan `file://` protocol. Hash routing adalah standar untuk Electron apps.
- **Window Controls**: Minimize, maximize, close sudah terhubung ke IPC. Toggle maximize (jika sudah maximize, unmaximize).
- **StatusBar**: Mengambil data dari IPC `db:ping` dan `app:info` yang sudah ada sejak Sprint 0.
- **Tailwind**: PostCSS auto-detected oleh Vite, tidak perlu konfigurasi tambahan di `electron.vite.config.ts`.

---

**Kesimpulan: Sprint 2 selesai. Application Shell siap digunakan oleh sprint berikutnya untuk implementasi fitur bisnis.**

*Laporan ini disusun oleh Project Engineer (OpenCode).*
