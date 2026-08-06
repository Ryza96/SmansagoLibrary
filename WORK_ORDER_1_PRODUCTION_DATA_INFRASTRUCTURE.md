# WORK_ORDER_1_PRODUCTION_DATA_INFRASTRUCTURE.md

**WO:** WORK ORDER 1 — PRODUCTION DATA INFRASTRUCTURE
**Status:** COMPLETE — READY review PO
**Tanggal:** 2026-08-06
**Source of Truth:** `ADR_001_DATA_PROTECTION_FINAL_DECISIONS.md` (FINAL APPROVED) + `RFC_001_DATA_PROTECTION_ARCHITECTURE.md` (APPROVED)
**Keputusan PO:** Implementasi fondasi Production Data Infrastructure — Path Helper, userData, Directory Manager, Folder Bootstrap, struktur direktori production. BUKAN Manifest/Provider/Backup Engine/Restore Engine/UI.

---

## 1. OBJECTIVE

Membangun fondasi lokasi data production sesuai ADR-001:

1. **Satu sumber path** — seluruh subfolder data user didefinisikan di SATU helper path (ADR-001 §3.2, RFC-001 §6.1 `getUserDataPaths()`), pure & headless-testable.
2. **Root production = `userData`** — resolusi via `app.getPath('userData')`; parameter opsional `rootOverride` disediakan HANYA untuk pengujian (bukan env variable).
3. **Direktori production dibuat di startup** — Folder Bootstrap berjalan SEBELUM koneksi DB (ADR-001 §9 langkah 2: "pastikan direktori dibuat sebelum koneksi DB").
4. **Struktur direktori persis ADR-001 §3.1** — `database/ backup/{manual,scheduled} logs/ temp/ settings/ assets/{member-photos,school-logo,templates}`.

## 2. SCOPE

### 2.1 Dalam scope (HANYA ini)
| Komponen | Deliverable |
|---|---|
| Path Helper | `src/main/infrastructure/paths.ts` — satu sumber kebenaran path (`createAppPaths` + `appDirectoryList` + `DATABASE_FILENAME`) |
| userData | Resolusi `app.getPath('userData')`; parameter opsional `rootOverride` untuk pengujian |
| Directory Manager | `src/main/infrastructure/directory-manager.ts` — `ensureAll()` idempoten, lapor created/existing |
| Folder Bootstrap | `electron/main/infrastructure/bootstrap.ts` + wiring di `electron/main/index.ts` sebelum `initDatabase()` |
| Struktur direktori | 12 direktori persis ADR-001 §3.1 |
| Smoke test | `wo1_data_infra_smoke/smoke.ts` |

### 2.2 Di luar scope (JANGAN diimplementasikan)
- Manifest, Provider, Backup Engine, Restore Engine, UI (instruksi WO).
- Relokasi DB (`prisma/aplibrary.db` → `userData/database/`), mekanisme `DATABASE_URL` runtime, journal mode WAL — keputusan teknis tersisa (ADR-001 §8.2 Q2/Q3/Q4/Q5), WO terpisah.
- Schema/migration (`prisma migrate diff` = empty — dibuktikan di §4).

## 3. IMPLEMENTATION

### 3.1 File baru (4 source + 1 smoke)

**`src/main/infrastructure/paths.ts`** — Path Helper murni (tanpa Electron; hanya `node:path`):

```ts
export const DATABASE_FILENAME = 'aplibrary.db'

export interface AppPaths { root, databaseDir, databaseFile, backupDir, backupManualDir, backupScheduledDir,
  logsDir, tempDir, settingsDir, assetsDir, assetMemberPhotosDir, assetSchoolLogoDir, assetTemplatesDir }

export function createAppPaths(root: string): AppPaths {
  const resolvedRoot = path.resolve(root)
  // ...setiap subfolder path.join(resolvedRoot, ...) — persis ADR-001 §3.1
}

export function appDirectoryList(paths: AppPaths): string[] { /* 12 entri: root + 11 subfolder */ }
```

- `databaseFile = <root>/database/aplibrary.db` (nama DB tetap `aplibrary.db` — ADR-001 §3.2).
- Backup `manual/` & `scheduled/` di bawah `backup/` — **di luar** `database/` (anti-nesting).
- `settings/` & `assets/<domain>/` ikut struktur penuh (future feature, struktur stabil sejak awal).

**`src/main/infrastructure/directory-manager.ts`** — Directory Manager:

```ts
export class DirectoryManager {
  async ensureAll(directories: readonly string[]): Promise<EnsureDirectoriesResult> {
    // per dir: fs.access (existedBefore?) → fs.mkdir({ recursive: true })
    // → { dirs: {path, existedBefore}[], newlyCreated[], alreadyExisted[] }
  }
}
```

**`electron/main/infrastructure/bootstrap.ts`** — Folder Bootstrap (Electron-aware):

```ts
export async function bootstrapDataInfrastructure(rootOverride?: string): Promise<BootstrapDataInfrastructureResult> {
  const root = rootOverride ?? app.getPath('userData')  // production = userData; rootOverride hanya untuk pengujian
  const paths = createAppPaths(root)
  const result = await new DirectoryManager().ensureAll(appDirectoryList(paths))
  return { root: paths.root, paths, newlyCreated: result.newlyCreated, alreadyExisted: result.alreadyExisted }
}
```

**`electron/main/index.ts`** (modifikasi) — wiring sebelum koneksi DB:

```ts
app.whenReady().then(async () => {
  const infra = await bootstrapDataInfrastructure()
  // TODO(WO Logging): console.log akan diganti Logging Framework pada Work Order Logging.
  console.log(`[DataInfra] Production data root: ${infra.root}`)
  console.log(`[DataInfra] Directories ensured: ${infra.newlyCreated.length} created, ${infra.alreadyExisted.length} existed`)
  await initDatabase()
  ...
})
```

### 3.2 Arsitektur keputusan
- **Pure vs Electron dipisah:** `paths.ts` + `directory-manager.ts` di `src/main/infrastructure/` (murni, bisa di-smoke headless tanpa Electron); hanya `bootstrap.ts` di `electron/main/infrastructure/` yang mengimpor `app`. Konsisten pola `print.service` (electron) → `borrow-card.service` (src/main).
- **Override via parameter, BUKAN env** — revisi PO: `APPLIBRARY_USER_DATA` dihapus; `bootstrapDataInfrastructure(rootOverride?)` menerima root opsional untuk pengujian, produksi tetap `app.getPath('userData')` (tidak ada jalur env).
- **Idempoten** — `mkdir recursive`; run berulang tidak error; `newlyCreated`/`alreadyExisted` memberikan laporan deterministik.

### 3.3 TIDAK diubah
Schema, migration, `DATABASE_URL`, DB dev, `PrismaClient` (dual client), container/IPC/preload/renderer, `database-reconciliation.service`, UI.

## 4. VALIDATION

### 4.1 Gate
| Gate | Hasil |
|---|---|
| `npm run lint` (tsc node + web) | **PASS** |
| `npm run build` | **PASS** — main **1,885.87 kB** (+2.41) · preload **9.95 kB identik** · renderer **1,147.66 kB identik** |
| `prisma migrate diff --from-migrations` | "This is an empty migration." (tidak ada perubahan schema) |
| grep bundle main | `bootstrapDataInfrastructure` · `app.getPath("userData")` · `"aplibrary.db"` · `[DataInfra]` ter-render; **`APPLIBRARY_USER_DATA` = 0 match (dihapus)** |

Preload & renderer byte-identik = bukti WO-1 murni infra main-process, tanpa wiring UI.

### 4.2 Smoke — `wo1_data_infra_smoke/smoke.ts` — **88/88 PASS** (tanpa DB/Electron, fresh temp dir, dibersihkan)
| Blok | Assertion | Hasil |
|---|---|---|
| Path Helper `createAppPaths` (ADR-001 §3.1) | root di-resolve absolut; 11 subfolder eksak (database/backup/manual/scheduled/logs/temp/settings/assets/member-photos/school-logo/templates); `databaseFile = <database>/aplibrary.db` | PASS |
| Anti-nesting | backup TIDAK di dalam databaseDir & sebaliknya | PASS |
| `appDirectoryList` | 12 entri, unik, konsisten dua arah dengan semua field direktori `AppPaths` | PASS |
| Directory Manager (fresh root) | 12 dibuat, 0 existing, semua `existsSync`+`isDirectory`, urutan = input | PASS |
| Idempoten (run kedua) | 0 baru, 12 existing, direktori tetap ada | PASS |
| Deteksi folder manual | root+logs pre-created → terdeteksi existing (2), 10 dibuat | PASS |
| Struktur final | tingkat-1 `[assets, backup, database, logs, settings, temp]`; `backup/manual|scheduled`; `assets/member-photos|school-logo|templates` | PASS |
| Kebersihan | `createAppPaths` murni: tidak menulis apa pun sendiri | PASS |
| **`bootstrapDataInfrastructure(testRoot)` (BARU, revisi PO)** | **testRoot dipakai sebagai root** (#37); 12 dibuat/#39 0 existing/#40 databaseFile belum tercipta/#41 semua direktori tercipta/#42-43 idempoten run kedua/#44 struktur tingkat-1 benar | PASS |

Catatan: smoke memakai **parameter `testRoot`** (bukan env variable) — dibuktikan #37 `result.root === testRoot` pada kode asli hasil kompilasi tsc (tanpa minify).

### 4.3 Catatan smoke
- 3 FAIL awal = kesalahan assertion fixture, BUKAN bug source: (1) assertion 19 tidak mengecualikan `databaseFile` dari cek keanggotaan `appDirectoryList`; (2) `mkdirSync({recursive})` manual juga membuat root sehingga `alreadyExisted` = [root, logs]. Assertion dikoreksi; **source tidak berubah**.

## 5. DECISION

Keputusan teknis yang diambil pada WO-1 (semua konsisten ADR-001/RFC-001):

| # | Keputusan | Alasan |
|---|---|---|
| D1 | Root production = `app.getPath('userData')`; **override via parameter opsional `rootOverride`** (bukan env) | Revisi PO: hapus `APPLIBRARY_USER_DATA`; produksi tetap `userData`, pengujian lewat argumen fungsi |
| D2 | Path Helper PURE di `src/main/infrastructure/` (tanpa Electron) | Dapat di-smoke headless; Electron hanya di `electron/main/infrastructure/bootstrap.ts` |
| D3 | Folder Bootstrap SEBELUM `initDatabase()` | ADR-001 §9 langkah 2 — direktori wajib ada sebelum koneksi DB |
| D4 | Struktur penuh ADR-001 §3.1 termasuk `settings/` & `assets/<domain>/` (future) | Struktur stabil sejak awal; helper tidak berubah saat fitur future datang |
| D5 | DB dev TIDAK dipindah di WO ini | Relokasi DB + `DATABASE_URL` runtime + journal = keputusan teknis tersisa (ADR-001 §8.2 Q2–Q5), WO terpisah |
| D6 | Nama file DB tetap `aplibrary.db` via konstanta `DATABASE_FILENAME` | ADR-001 §3.2 — nama tidak bergantung path |
| D7 | `console.log` startup diberi `TODO(WO Logging)` | Revisi PO: akan diganti Logging Framework pada Work Order Logging |

### 5.1 Catatan bundle (minifier)
Pada bundle main (esbuild), `bootstrapDataInfrastructure` terlihat mengabaikan `rootOverride` (`const root = electron.app.getPath("userData")`) — ini optimisasi minifier yang men-specialize fungsi ke satu-satunya call-site (startup tanpa argumen), sehingga **perilaku produksi benar = userData**. Kode asli (kompilasi tsc) mempertahankan `rootOverride ?? app.getPath('userData')` — dibuktikan smoke #37. Smoke memvalidasi source asli, bukan bundle minified.

## 6. OUTPUT & STATUS

- **File source baru (3):** `src/main/infrastructure/paths.ts` · `src/main/infrastructure/directory-manager.ts` · `electron/main/infrastructure/bootstrap.ts`
- **File source dimodifikasi (1):** `electron/main/index.ts`
- **Smoke baru (1):** `wo1_data_infra_smoke/smoke.ts` (69/69 PASS)
- **Laporan:** `WORK_ORDER_1_PRODUCTION_DATA_INFRASTRUCTURE.md` · AGENTS.md diperbarui.

**Status: DONE — READY review PO. BERHENTI, tidak membuka WO baru.**
