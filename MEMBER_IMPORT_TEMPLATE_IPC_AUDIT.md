# MEMBER_IMPORT_TEMPLATE_IPC_AUDIT — "No handler registered for 'members:downloadTemplate'"

> Mode: **READ ONLY**. Audit tidak mengubah kode, tidak commit.
> Tanggal audit: 02/08/2026 · Lingkup: rantai renderer → preload → ipc → service untuk Download Template Import Anggota.

## VERDICT

**Source chain LENGKAP & TANPA TYPO.** Semua 6 lapisan sudah ada dan konsisten di source tree.
Error UAT **bukan bug source** — ini masalah **artifact/runtime**: proses main yang berjalan saat UAT
tidak mendaftarkan channel `members:downloadTemplate` (package `dist/` build lama / main dev tidak di-restart).
Lihat bagian "Analisis Akar Masalah".

---

## 1. Apakah renderer memanggil `members:downloadTemplate`?

Renderer TIDAK memanggil string channel secara langsung. Ia memanggil method preload
`window.electronAPI.memberImport.downloadTemplate()` yang membungkus channel tersebut.

| Item | Fakta | Bukti |
|------|-------|-------|
| Panggilan | `await window.electronAPI.memberImport.downloadTemplate()` | `src/components/members/MemberImportDialog.tsx:43` |
| Type | `memberImport.downloadTemplate: () => Promise<DownloadTemplateResult>` | `src/renderer/env.d.ts:99-101` |
| Channel tujuan | `members:downloadTemplate` (via preload, lihat #2) | — |

## 2. Apakah preload mengekspos `members.downloadTemplate`?

**TIDAK** di namespace `members`. Namespace `members` di preload hanya berisi CRUD
(`findMany`, `findById`, `create`, `update`, `delete`).

Download template diekspos di namespace terpisah **`memberImport`** yang invoke channel `members:downloadTemplate`:

| Item | Fakta | Bukti |
|------|-------|-------|
| `members.*` | hanya CRUD (tanpa downloadTemplate) | `electron/preload/member.preload.ts:4-15` |
| `memberImport.downloadTemplate` | `() => ipcRenderer.invoke('members:downloadTemplate')` | `electron/preload/member.preload.ts:16-17` |
| Agregasi | `...memberAPI` dimasukkan ke `electronAPI` | `electron/preload/index.ts:23` (import di `:5`) |
| Ekspos | `contextBridge.exposeInMainWorld('electronAPI', electronAPI)` | `electron/preload/index.ts:37` |

## 3. Apakah `ipcMain.handle()` untuk `members:downloadTemplate` sudah ada?

**YA, sudah ada.**

| Item | Fakta | Bukti |
|------|-------|-------|
| Handle | `ipcMain.handle('members:downloadTemplate', (event) => downloadTemplate(event))` | `electron/ipc/member.ipc.ts:69` |
| Handler fn | `async function downloadTemplate(event: IpcMainInvokeEvent): Promise<DownloadTemplateResult>` | `electron/ipc/member.ipc.ts:15-46` |
| Service | Handler **self-contained** — memakai `app`, `dialog`, `fs`, `path`; TIDAK memakai `memberService` | `electron/ipc/member.ipc.ts:1-3,10-46` |
| Path template | `app.isPackaged ? process.resourcesPath : app.getAppPath()` + `templates/Template_Import_Anggota_v1.0.xlsx` | `electron/ipc/member.ipc.ts:8-13` |

## 4. Apakah handler sudah diregistrasikan di `electron/ipc/index.ts`?

**YA.**

| Item | Fakta | Bukti |
|------|-------|-------|
| Import | `import { registerMemberHandlers } from './member.ipc'` | `electron/ipc/index.ts:27` |
| Registrasi | `registerMemberHandlers(services.memberService)` | `electron/ipc/index.ts:70` |
| Pemicu | `registerAllHandlers(container, ...)` dipanggil di `electron/main/index.ts:41` | `electron/main/index.ts:40-45` |
| Urutan | `registerAllHandlers` **SEBELUM** `createWindow()` → handler terdaftar sebelum renderer load (tidak ada race) | `electron/main/index.ts:41` vs `:45` |

## 5. Apakah service dipakai sudah di-bootstrap di `electron/main/bootstrap.ts`?

Handler `downloadTemplate` **tidak memakai service apa pun** (self-contained; lihat #3), jadi
tidak ada dependensi bootstrap untuk handler ini. Namun `memberService` **tetap di-bootstrap & di-wire**:

| Item | Fakta | Bukti |
|------|-------|-------|
| Instansiasi | `new MemberService(newMemberRepository, numberGeneratorService)` | `electron/main/bootstrap.ts:79` |
| Container | `memberService` masuk `Container` & dikembalikan | `bootstrap.ts:49`, `:113` |
| Wire | diteruskan ke `registerMemberHandlers` via `registerAllHandlers` | `electron/ipc/index.ts:70` |

## 6. Apakah ada typo renderer → preload → ipc → service?

**TIDAK ada typo.** Semua nama fungsi & string channel identik:

| Lapisan | Pemanggilan / Channel | Konsisten |
|---------|----------------------|-----------|
| Renderer | `window.electronAPI.memberImport.downloadTemplate()` | ✓ |
| Preload | `memberImport.downloadTemplate` → `ipcRenderer.invoke('members:downloadTemplate')` | ✓ |
| IPC | `ipcMain.handle('members:downloadTemplate', ...)` | ✓ (string channel sama persis) |
| Service | handler `downloadTemplate` (self-contained) | ✓ |
| Type | `env.d.ts` `memberImport.downloadTemplate → DownloadTemplateResult` | ✓ |

Catatan: channel bernama `members:downloadTemplate` (prefix `members:`), sedangkan namespace preload-nya
`memberImport` — ini pola yang sama dengan book import (`imports:downloadTemplate`). Bukan typo.

---

## Analisis Akar Masalah

### Evidence artifact
- `dist/win-unpacked/resources/app.asar` — build **01/08/2026 16:48**:
  - `members:downloadTemplate` → **0** kemunculan
  - `memberImport` → **0** kemunculan
  - `Import Siswa` → **0** kemunculan (tombol Import Siswa TIDAK ada di bundle renderer)
  - `imports:downloadTemplate` → 2 (book import template ADA)
  - `members:findMany` → 2, `members:delete` → 2 (CRUD member ADA)
  → **Package `dist/` mempredate seluruh fitur Import Anggota (WO-1..WO-3)**; hanya book-import (Sprint 10) yang ada.
- `dist/win-unpacked/resources/templates/` hanya berisi `Template_Import_Buku_v2.0.xlsx`;
  `Template_Import_Anggota_v1.0.xlsx` **belum ter-pack** di package lama. (Config `electron-builder.yml:19-23`
  sudah mencantumkannya → rebuild akan memasukkannya.)

### Evidence build terkini (`out/`)
- `out/main/index.js` (build **08/02/2026 14:33**): `members:downloadTemplate` → **1** (handler terdaftar)
- `out/preload/index.js`: `memberImport` → **1** (preload mengekspos)
  → `out/` hasil `npm run build` **sudah lengkap & benar**.

### Kesimpulan
Error "No handler registered for 'members:downloadTemplate'" muncul hanya jika proses **main** yang berjalan
tidak mendaftarkan channel tersebut. Karena source lengkap dan build `out/` terkini lengkap, penyebabnya
adalah salah satu dari:
1. **Package `dist/` basi** (build 01/08 16:48) — jika PO menjalankan app terinstal dari `dist/` (atau versi
   terinstal lebih lama), fitur tidak ada sama sekali.
2. **Dev mode tanpa restart main** — `npm run dev` melakukan hot-reload renderer, tetapi `ipcMain.handle`
   hanya diregistrasi saat proses main start; jika source ditambah/diubah saat app dev sudah berjalan tanpa
   restart penuh, renderer sudah punya tombol/method baru namun main belum mendaftarkan handler → persis
   error ini.

**Bukan bug source. Tidak ada typo. Handler, preload, registrasi, dan bootstrap sudah benar.**

## Rekomendasi (BELUM dieksekusi — mode read-only)
1. `npm run build` (regenerasi `out/`) — sudah terbukti menghasilkan bundle benar.
2. Repackage: `npx electron-builder` → verifikasi ulang `app.asar` memuat `members:downloadTemplate` &
   `memberImport`, dan `resources/templates/Template_Import_Anggota_v1.0.xlsx` ter-pack.
3. Bila memakai dev: **restart penuh** `npm run dev` (bukan hanya HMR).
4. UAT ulang alur Import Siswa → Download Template.

## Status
**AUDIT SELESAI — READ ONLY.** Tidak ada perubahan kode. Tidak ada commit.
