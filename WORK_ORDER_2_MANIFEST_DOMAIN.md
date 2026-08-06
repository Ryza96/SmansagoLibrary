# WORK ORDER 2 — MANIFEST DOMAIN

**Status:** DONE — READY review PO (belum lanjut WO berikutnya)
**Source of Truth:** ADR-001_DATA_PROTECTION_FINAL_DECISIONS.md (FINAL APPROVED, SSOT) + RFC_002_BACKUP_FILE_FORMAT.md + RFC_003_BACKUP_ENGINE_ARCHITECTURE.md + RFC_004_RESTORE_ENGINE_ARCHITECTURE.md
**Date:** 2026-08-06

---

## Objective

Membangun **Manifest Domain** — representasi murni dari `manifest.json` pada format backup (RFC-002 §4 / ADR-001 §6) sebagai fondasi bersama Backup Engine (RFC-003) dan Restore Engine (RFC-004).

WO ini **HANYA** membangun Domain Manifest. Tidak membangun Backup Engine, Restore Engine, ZIP, Provider, Electron API, maupun UI. Manifest adalah **domain model**: tidak boleh mengetahui filesystem, zip, electron, sqlite, atau provider.

Target 7 komponen:
1. **Manifest Model** — aggregate root `{ format, meta, files[], summary, checksums }`
2. **Manifest Metadata** — representasi `meta`
3. **Manifest Entry** — satu baris `files[]`
4. **Manifest Summary** — representasi `summary`
5. **Manifest Validator** — memvalidasi manifest mentah (hasil parse JSON) tanpa membaca file
6. **Schema Version Value Object** — identitas skema database (bukan jumlah migration)
7. **Checksum Value Object** — representasi checksum SHA-256 (belum menghitung)

---

## Scope

### Di luar scope (WAJIB tidak disentuh)
- Backup Engine, Restore Engine, manifest builder / writer
- Pembuatan/ekstraksi ZIP, kompresi
- Provider, filesystem I/O, pembacaan file
- Elektron API / IPC / preload / bootstrap / env.d.ts / renderer / UI
- Migration / schema Prisma / database
- Perhitungan SHA-256 aktual (WO Backup Engine)
- Pembacaan migration Prisma untuk mengisi Schema Version (WO Backup Engine)

### Keputusan PO yang mengikat (dari ADR-001 / RFC-002)
- **K1** — Manifest adalah **Single Source of Truth** wadah backup; UI/engine TIDAK menghitung ulang isi dari sumber lain.
- **K2** — `schemaVersion` = **identitas** skema database, BUKAN jumlah migration.
- **K3** — Checksum memakai **SHA-256** (format 64 karakter hex).
- **K4** — Format manifest **additive-only**; field tak dikenal saat validasi **diabaikan** (forward-compat), bukan ditolak.
- **K5** — Path pada `files[]` bersifat **relatif kanonik**: forward-slash, tanpa `../`, tanpa path absolut (memitigasi path-traversal saat restore).
- **K6** — `summary.tables` / `summary.members` (data key DB) tetap **opsional** (ADR-001 §8.2 Q5 masih open — keputusan di WO backup/restore engine).

---

## Implementation

### Lokasi
```
src/main/domain/manifest/
├── domain-error.ts     — ManifestDomainError (error domain murni)
├── schema-version.ts   — SchemaVersion Value Object (+ isSchemaVersion, SCHEMA_VERSION_MAX_LENGTH=128)
├── checksum.ts         — Checksum Value Object (+ isChecksum, SHA256_HEX_LENGTH=64)
├── metadata.ts         — ManifestMetadata Value Object (+ MANIFEST_BACKUP_VERSION=1, MANIFEST_BACKUP_TYPE_FULL='full')
├── entry.ts            — ManifestEntry Value Object (+ MANIFEST_ENTRY_KINDS {database,asset,log}, isRelativeManifestPath)
├── summary.ts          — ManifestSummary Value Object
├── manifest.ts         — Manifest aggregate (+ MANIFEST_FORMAT='aplibrary-backup', isManifestJSON)
└── validator.ts        — ManifestValidator (validate(raw: unknown): ManifestValidationResult)
```

Seluruh modul **murni** — nol import di luar folder `src/main/domain/manifest/` (hanya `Date` bawaan). Tidak ada `fs`, `path`, `electron`, `prisma`, atau provider. Type-check via `tsconfig.node.json` (include `src/main/**/*`).

### Desain tiap komponen

| Komponen | Isi | Validasi |
|---|---|---|
| **SchemaVersion** | string identitas skema (label migration), di-trim | non-kosong, ≤128 karakter, tanpa karakter kontrol |
| **Checksum** | string 64 hex SHA-256, di-normalisasi lowercase | `^[a-f0-9]{64}$` (trim + lowercase) |
| **ManifestMetadata** | `backupVersion, appVersion, schemaVersion, createdAt, appName, type, engine?, integrity?` | backupVersion int ≥1; appVersion/appName/type non-kosong; schemaVersion instanceof; createdAt Date valid |
| **ManifestEntry** | `path, sizeBytes, sha256, kind` | path relatif kanonik; sizeBytes int ≥0; sha256 instanceof Checksum; kind ∈ {database,asset,log} |
| **ManifestSummary** | `files, totalBytes, tables?, members?` | int ≥0 (opsional juga int ≥0) |
| **Manifest (aggregate)** | `format, meta, files[], summary, checksums{manifestSha256}` | format wajib `aplibrary-backup`; komponen bertipe; `toJSON()` faithful ke RFC-002 §4 |
| **ManifestValidator** | `validate(raw)` → `{ok:true,manifest} \| {ok:false,errors[]}` | 5 aturan (di bawah) |

### Manifest Validator — 5 tugas (persis mandat PO)
1. **Field wajib** — `format`, `meta` (+ `backupVersion/appVersion/schemaVersion/createdAt/appName/type`), `files` (array, minimal 1 entri), tiap entry (`path/sizeBytes/sha256/kind`), `summary` (+ `files/totalBytes`), `checksums` (+ `manifestSha256`). Tipe diperiksa.
2. **Schema version** — `meta.schemaVersion` harus memenuhi format SchemaVersion (non-kosong, tanpa kontrol).
3. **Duplicate entry** — `files[]` tidak boleh memuat dua entri dengan `path` sama (apapun kind/size).
4. **Relative path** — tiap `files[].path` harus relatif kanonik: tanpa leading `/` atau `\`, tanpa `\` di tengah, tanpa `../` / `.` / segment kosong, tanpa drive-letter (`C:`), tanpa URI scheme, tanpa trailing `/`, tanpa karakter kontrol.
5. **Checksum format** — tiap `files[].sha256` dan `checksums.manifestSha256` harus 64 karakter hex.

Field **tak dikenal diabaikan** (K4) — `extraTop`, `extraMeta`, `extraEntry`, `extraSummary`, `extraChecksum` tidak menyebabkan kegagalan. `engine`/`integrity` yang hadir dipertahankan dalam `toJSON()`.

### Desain Value Object
- Factory `of(value)` melempar `ManifestDomainError` saat input tak valid (fail-fast untuk konstruksi programatik).
- Predikat `isX(value)` untuk pengecekan non-throwing (dipakai Validator agar bisa mengumpulkan banyak error).
- `equals(other)` perbandingan struktural; nilai kanonik di-trim / di-lowercase.

---

## Validation

| Gate | Hasil |
|---|---|
| `npm run lint` (tsc node + web) | PASS |
| `npm run build` | PASS |
| Smoke `wo2_manifest_domain_smoke/smoke.ts` | **178/178 PASS** |
| `prisma migrate diff` (dari workdir `prisma/`) | "This is an empty migration." (schema tidak disentuh) |
| Grep bundle `out/main/index.js` | `aplibrary-backup`=0, `manifestSha256`=0, `ManifestValidator`=0 → modul TIDAK ter-wire (standalone) |
| Bundle sizes | main 1,841.82 kB · preload 9.71 kB · renderer 1,121.34 kB (manifest tidak masuk bundle — tidak ada wiring) |

### Cakupan smoke (167 assertions, murni tanpa DB/Electron)
- **SchemaVersion (13)** — valid/trim/maks, kosong/spasi/kontrol/terlalu-panjang ditolak, `isValid`, `equals`.
- **Checksum (12)** — valid/uppercase/trim, 63/65/non-hex/kosong/campuran ditolak, `isValid`, `equals`.
- **ManifestMetadata (14)** — valid + getter + toJSON (opsional engine/integrity hadir/tidak), backupVersion 0/-1/pecahan/string ditolak, appVersion/appName/type kosong ditolak, schemaVersion string ditolak, createdAt invalid ditolak, helpers.
- **ManifestEntry + path (28)** — valid + toJSON, sizeBytes negatif/pecahan ditolak, kind tak dikenal/uppercase ditolak, sha256 non-Checksum ditolak; `isRelativeManifestPath` 24 kasus (nested valid, spasi valid; kosong/`.`/`..`/leading slash/backslash/traversal/double-slash/`./`/trailing slash/drive-letter/UNC/URI/kontrol/non-string ditolak).
- **ManifestSummary (10)** — valid, opsional hadir/tidak, negatif/pecahan ditolak.
- **Manifest Model (14)** — create valid + toJSON faithful, format/meta/files/entry/checksums invalid ditolak, `isManifestJSON`.
- **Validator valid + additive (9)** — ok:true, semua field ter-bind, **round-trip `toJSON` == JSON asli**, field tak dikenal diabaikan, engine/integrity dipertahankan.
- **Validator field wajib (28)** — null/string/array, format hilang/salah, meta hilang/bukan-objek, tiap field meta hilang/tipe-salah, createdAt invalid, files hilang/bukan-array/kosong, tiap field entry hilang, summary hilang/field hilang, checksums hilang/field hilang.
- **Validator schema version (6)** — valid diterima; kosong/spasi/kontrol/objek/angka ditolak.
- **Validator duplicate (5)** — dua path sama, path sama kind beda, 3 entri 1 duplikat, path unik diterima, pesan error menyebut path.
- **Validator relative path (12)** — leading slash/backslash/traversal/drive-letter/URI/trailing-slash/kosong/double-slash/`./`/`.`/kontrol ditolak; nested valid diterima.
- **Validator checksum format (10)** — entry/manifestSha pendek/non-hex/kosong ditolak; valid & uppercase diterima.

### Cakupan smoke immutability (11, tambahan revisi PO)
- **`meta.createdAt`** — getter mengembalikan COPY (`createdAt !== createdAt`, `setUTCFullYear(1999)`/`setTime(0)` pada hasil getter tidak mengubah state internal); input `Date` di-`of()` di-copy (mutasi Date sumber setelah konstruksi tidak mengubah state internal).
- **`manifest.files`** — getter mengembalikan COPY (`files !== files`, `push`/`splice` pada hasil getter tidak mengubah state internal, elemen dipertahankan); input array di-`create()` di-copy (mutasi array sumber setelah konstruksi tidak mengubah state internal).
- **`manifest.checksums`** — getter mengembalikan objek baru (mutasi objek hasil getter tidak mengubah state internal).
- **Tanpa perubahan kontrak public** — hanya perbaikan immutability (copy pada getter Array/Date/objek + copy pada konstruksi).

---

## Decision

| # | Keputusan | Alasan |
|---|---|---|
| D1 | **Lokasi `src/main/domain/manifest/`** (bukan `src/shared/`) | Manifest adalah domain main-process (dipakai Backup/Restore Engine); renderer tidak boleh memegang business logic manifest (pola WO-2/P-4/Dashboard). `src/main/infrastructure/` (WO-1) menjadi contoh pemisahan pure-vs-electron. |
| D2 | **Validator = satu pintu parse dari `unknown`** | Manifest dibaca dari JSON on-disk (Restore Engine) → data mentah `unknown`; Validator memeriksa struktur sekaligus membangun tipe `Manifest`. Model `Manifest.create()` tetap ada untuk konstruksi programatik (Backup Engine WO berikutnya). |
| D3 | **Validator mengumpulkan SEMUA error** (bukan fail-fast) | Memberi daftar lengkap masalah manifest → berguna untuk Restore Engine melaporkan alasan penolakan. |
| D4 | **SchemaVersion = string identitas**, tanpa ordering/compare | ADR-001 K2: identitas, bukan versi ordinal; perbandingan version gate + forward-protect dilakukan WO Backup/Restore Engine saat migration dibaca. WO ini murni value object. |
| D5 | **Checksum = format-only (64 hex), tanpa hitung** | ADR-001 K3; komputasi SHA-256 nyata milik Backup Engine. Validator hanya memastikan nilai berformat benar. |
| D6 | **Path relatif divalidasi manual (tanpa `node:path`)** | `node:path` platform-dependent (separator Windows vs POSIX); aturan kanonik RFC-002 (forward-slash, relatif, tanpa `../`) diimplementasikan murni agar konsisten lintas platform dan headless-testable. |
| D7 | **`summary.tables`/`members` opsional** | ADR-001 §8.2 Q5 masih open (keputusan WO backup/restore engine); opsional menjaga kontrak additive tanpa mengunci desain lebih awal. |
| D8 | **Error domain `ManifestDomainError` + predikat `isX`** | Factory `of()` throw (fail-fast) untuk konstruksi; predikat `isX()` non-throwing untuk Validator (collect errors). |

---

## Next

- **BERHENTI — menunggu review PO.** Tidak membuka WO berikutnya (WO-3 Manifest Builder / Backup Engine) sebelum persetujuan.

---

## Revisi (Review PO — Immutability, COMPLETE)

### Ringkasan
- PO meminta Manifest Domain **benar-benar immutable**: getter yang mengembalikan Array harus defensive copy, getter yang mengembalikan Date harus copy Date, dan smoke wajib membuktikan `manifest.files` serta `createdAt` tidak bisa mengubah state internal.
- **Perubahan (4 file source, tanpa mengubah kontrak public):**
  - `src/main/domain/manifest/manifest.ts` — `create()` menyimpan COPY array `files` + COPY objek `checksums` (mutasi input caller tidak menyentuh internal); getter `files` mengembalikan `[...this._props.files]`; getter `checksums` mengembalikan objek baru.
  - `src/main/domain/manifest/metadata.ts` — `of()` menyimpan COPY objek props + COPY `Date` `createdAt`; getter `createdAt` mengembalikan `new Date(...)`.
  - `src/main/domain/manifest/entry.ts` — `of()` menyimpan COPY objek props.
  - `src/main/domain/manifest/summary.ts` — `of()` menyimpan COPY objek props.
- **Smoke (11 assertion baru, total 178):** section 13 "Immutability" — getter createdAt copy + mutasi caller tidak berpengaruh; input createdAt dimutasi tidak berpengaruh; getter files copy + push/splice tidak berpengaruh + elemen dipertahankan; input files dimutasi tidak berpengaruh; getter checksums objek baru + mutasi tidak berpengaruh.
- **Validation PASS:** lint · build · smoke **178/178** · `prisma migrate diff` = empty (schema tidak disentuh) · grep bundle `aplibrary-backup`/`manifestSha256`/`ManifestValidator` = 0 (tetap unwired).
- **Commit:** revisi immutability di-push. Status: **DONE — menunggu review PO** (tidak lanjut WO berikutnya).
