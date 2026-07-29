# APLibrary

Aplikasi Perpustakaan Desktop — berbasis Electron + React + TypeScript + SQLite.

## Tech Stack

| Layer | Teknologi | Alasan |
|-------|-----------|--------|
| Framework Desktop | Electron 33 | Aplikasi desktop lokal, dapat dikemas jadi .exe. Berjalan tanpa internet. |
| UI | React 18 + TypeScript | Component-based, type-safe, ekosistem luas. |
| Bundler | Vite 5 + electron-vite | HMR cepat, build optimal, integrasi Electron mulus. |
| ORM | Prisma 5 | Type-safe query builder, migration otomatis, SQLite support matang. |
| Database | SQLite | Database file-based, tanpa server, portabel, cocok untuk desktop lokal. |
| Packager | electron-builder 25 | Build .exe (NSIS installer) untuk Windows. |

## Struktur Project

```
APLibrary/
├── package.json                  # Dependency & scripts
├── tsconfig.json                 # Root TS config (references)
├── tsconfig.node.json            # TS config untuk main + preload process
├── tsconfig.web.json             # TS config untuk renderer (React)
├── electron.vite.config.ts       # Vite config untuk Electron (main/preload/renderer)
├── electron-builder.yml          # Electron Builder config untuk packaging .exe
├── .env                          # Environment variables (DATABASE_URL)
├── .env.example                  # Template env
├── .gitignore
├── prisma/
│   └── schema.prisma             # Prisma schema SQLite
├── scripts/
│   ├── dev-setup.ps1             # Setup development (install + migrate)
│   └── run.ps1                   # Jalankan dev server
├── resources/                    # Build resources (icon, dll)
├── src/
│   ├── main/                     # Electron Main Process
│   │   ├── index.ts              # Entry point: window, IPC, lifecycle
│   │   └── database.ts           # Prisma client singleton
│   ├── preload/                  # Preload Script (contextBridge)
│   │   └── index.ts              # Expose API ke renderer via IPC
│   └── renderer/                 # Electron Renderer Process (React)
│       ├── index.html            # Entry HTML
│       └── src/
│           ├── main.tsx          # React entry point
│           ├── App.tsx           # Root component
│           ├── env.d.ts          # Type declarations
│           └── assets/
│               └── styles.css    # Global styles
├── out/                          # Build output (git-ignored)
├── dist/                         # Packaged installer (git-ignored)
└── node_modules/                 # Dependencies (git-ignored)
```

## Prasyarat

- Node.js 18+ (disarankan 20 LTS)
- npm 9+
- Windows 10/11 (target platform)

## Instalasi

### 1. Clone project

```bash
git clone <repository-url>
cd APLibrary
```

### 2. Install dependencies & setup database

**Automatis (Windows):**
```powershell
.\scripts\dev-setup.ps1
```

**Manual:**
```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
```

## Menjalankan Aplikasi

**Development mode (dengan HMR):**
```bash
npm run dev
```

**Build production:**
```bash
npm run build
```

**Package ke .exe (Windows):**
```bash
npm run package:win
```
Hasil installer akan ada di `dist/` folder.

### Scripts Lainnya

| Script | Deskripsi |
|--------|-----------|
| `npm run prisma:studio` | Buka Prisma Studio (GUI database) |
| `npm run prisma:reset` | Reset database (hapus semua data) |
| `npm run lint` | TypeScript type checking |

## Arsitektur Komunikasi

```
Renderer (React)  ←→  Preload (contextBridge)  ←→  Main Process (IPC)  ←→  Prisma ORM  ←→  SQLite
```

- **contextIsolation: true** — Renderer tidak punya akses langsung ke Node.js.
- **nodeIntegration: false** — Keamanan terjaga.
- **IPC (ipcMain/ipcRenderer)** — Satu-satunya jalur komunikasi.
- **Prisma** berjalan di Main Process, bukan di Renderer.

## IPC Channels

| Channel | Arah | Deskripsi |
|---------|------|-----------|
| `db:ping` | Renderer → Main | Cek koneksi database |
| `app:info` | Renderer → Main | Dapatkan info aplikasi & versi |

Channel IPC baru akan ditambahkan seiring pengembangan fitur.

## Dependency

### Production
- `@prisma/client` — Prisma ORM client untuk query database SQLite.

### Development
- `electron` — Framework desktop.
- `electron-vite` — Build tool untuk Electron + Vite.
- `electron-builder` — Packaging aplikasi ke .exe.
- `react`, `react-dom` — UI library.
- `typescript` — Type safety.
- `@vitejs/plugin-react` — Vite plugin untuk React.
- `@types/react`, `@types/react-dom` — Type definitions.
- `prisma` — Prisma CLI (migrate, generate, studio).

## Keamanan

- `contextIsolation: true` — Renderer terisolasi dari Node.js.
- `nodeIntegration: false` — Mencegah akses langsung ke system.
- `sandbox: false` — Diperlukan untuk preload script (Electron 33).
- Content-Security-Policy ketat di index.html.

## Lisensi

Proprietary — Kontenyou
