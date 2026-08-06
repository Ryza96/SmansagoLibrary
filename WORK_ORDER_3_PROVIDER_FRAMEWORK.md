# WORK ORDER 3 — PROVIDER FRAMEWORK

**Status:** DONE — READY review PO (belum lanjut WO berikutnya)
**Source of Truth:** ADR_001_DATA_PROTECTION_FINAL_DECISIONS.md (FINAL APPROVED, SSOT) + RFC_003_BACKUP_ENGINE_ARCHITECTURE.md + RFC_004_RESTORE_ENGINE_ARCHITECTURE.md
**Date:** 2026-08-06

---

## Objective

Membangun **Provider Framework** — fondasi arsitektur berbasis Provider (RFC-003 §3 / ADR-001 §3.4): dua sisi dari SATU jenis data (Provider arah backup, Restore Handler arah restore) + Registry masing-masing + model Pre-flight Validation & Failure decision, serta **DatabaseProvider** (satu-satunya jenis data rilis pertama: Database WAJIB, ADR-001 §8.2).

WO ini **HANYA** membangun framework provider + DatabaseProvider. Tidak membangun Backup Engine, Restore Engine, ZIP/packaging, Manifest Builder, UI, ataupun IPC.

Target komponen:
1. **Provider Domain** — kontrak `BackupProvider` (id/version · required/optional · collect/verify/cleanup) + value objects (ProviderId, ProviderKind, requirement) + error domain
2. **Restore Handler Domain** — kontrak `RestoreHandler` (id/version · required/optional · matches/stage/verifyStaged/swapToLive/rollbackFrom/cleanup)
3. **Provider Registry & Restore Handler Registry** — titik pendaftaran tunggal (extensibility tanpa ubah engine)
4. **Pre-flight Model** — `PreflightItem`/`PreflightReport` + `decideProviderPreflight` (Failure Strategy ADR)
5. **DatabaseProvider** — implementasi infra (VACUUM INTO + PRAGMA integrity_check + cleanup)

---

## Scope

### Di luar scope (WAJIB tidak disentuh)
- Backup Engine / Restore Engine (pipeline, orchestrator, sesi, status akhir) — WO berikutnya
- ZIP / packaging / format wadah `.apbackup` — WO berikutnya
- Manifest Builder / pembacaan migration untuk Schema Version — WO berikutnya
- Elektron API / IPC / preload / env.d.ts / renderer / UI — WO berikutnya
- Migration / schema Prisma / database (tidak ada perubahan DB)

### Keputusan PO yang mengikat (dari ADR-001 / RFC-003)
- **K1** — Engine = **satu orkestrator** yang tidak tahu detail sumber data; mengoordinasikan Provider via kontrak seragam.
- **K2** — Provider & Restore Handler adalah **dua sisi dari SATU jenis data**; keduanya didaftarkan lewat registry masing-masing.
- **K3** — Kontrak Provider: `id/version` · `required/optional` · `collect()` · `verify()` · `cleanup()`.
- **K4** — Kontrak Restore Handler: `id/version` · `required/optional` · `matches(kind)` · `stage()` · `verifyStaged()` · `swapToLive()` (hanya dipanggil Swapper) · `rollbackFrom(snapshot)` · `cleanup()`.
- **K5** — Failure Strategy: Provider **WAJIB** gagal → Abort; Provider **OPSIONAL** gagal → SUCCESS_WITH_WARNING (manifest menandai provider yang dilewati).
- **K6** — Kebijakan kegagalan **identik** untuk Restore Handler (WAJIB → Abort; OPSIONAL → SUCCESS_WITH_WARNING).
- **K7** — Semua kegagalan pre-flight = **batalkan SEBELUM menulis apa pun** (RFC-003 §4.3).
- **K8** — Jenis data saat ini: **Database (WAJIB)**; aset/configuration/log didaftarkan saat data-nya tersedia (future) — extensibility tanpa mengubah engine/pipeline.
- **K9** — Registrasi satu titik pendaftaran (pola wiring bootstrap/container).

---

## Implementation

### Lokasi
```
src/main/domain/provider/
├── domain-error.ts       — ProviderDomainError (error domain murni)
├── provider-id.ts        — ProviderId VO (name+version, fullName=nama@versi, equals, toJSON)
├── provider-kind.ts      — PROVIDER_KINDS {database, asset, configuration, log} + isProviderKind
├── provider.ts           — BackupProvider kontrak + PROVIDER_REQUIREMENTS + collectResultOf/verifyResultOf
├── restore-handler.ts    — RestoreHandler kontrak + restoreVerifyResultOf + assertProviderRequirement
├── provider-registry.ts  — ProviderRegistry + RestoreHandlerRegistry
└── preflight.ts          — PreflightItem/PreflightReport + ProviderPreflightState + decideProviderPreflight

src/main/infrastructure/providers/
└── database.provider.ts  — DatabaseProvider (implementasi BackupProvider, VACUUM INTO + integrity_check)
```

Seluruh modul domain **murni** — nol import di luar folder `src/main/domain/provider/` + `../manifest/entry` (kontrak pasif ManifestEntry, dibagikan lintas arah). DatabaseProvider (infra) memakai `getPrisma()` dari `src/main/repositories/base/prisma.ts` — pola existing.

### Desain tiap komponen

| Komponen | Isi | Validasi |
|---|---|---|
| **ProviderId** | `{name, version}` | name/version non-kosong (trim), name ≤64, version ≤32; `fullName = name@version`; `equals` struktural |
| **ProviderKind** | `database/asset/configuration/log` | `isProviderKind` |
| **ProviderRequirement** | `required/optional` | `isProviderRequirement`; `PROVIDER_REQUIREMENT_LABEL` = WAJIB/OPSIONAL |
| **BackupProvider** (kontrak) | `id, kind, requirement, collect(), verify(entry), cleanup()` | `collectResultOf`/`verifyResultOf` memvalidasi bentuk hasil |
| **RestoreHandler** (kontrak) | `id, kind, requirement, matches(entry), stage(entry), verifyStaged(entry), swapToLive(entry), rollbackFrom(entry), cleanup()` | `restoreVerifyResultOf`; `swapToLive` HANYA dipanggil Swapper (WO restore) |
| **ProviderRegistry** | `register` (duplikat → throw), `discover`, `count`, `findById`, `findByKind`, `requiredProviders`, `optionalProviders` | — |
| **RestoreHandlerRegistry** | sama bentuk dengan ProviderRegistry | — |
| **PreflightItem/PreflightReport** | `{name, status, message}`; status ∈ pass/fail/warning | non-kosong, status dikenal |
| **decideProviderPreflight** | states[] → `{proceed, abortedBecause, skippedProviders, warnings}` | K5/K7: FAIL required → abort; FAIL optional → skip+warning; warning → warning |

### DatabaseProvider
- `id = database@1.0.0`, `kind = database`, `requirement = required` (satu-satunya provider rilis pertama, ADR-001 §8.2).
- Konstanta: `DATABASE_SNAPSHOT_FILENAME = 'aplibrary.db'`, `DATABASE_PROVIDER_ENGINE = 'vacuum-into'`.
- `snapshotPath = <stagingDir>/aplibrary.db`.
- `collect()`: unlink target bila sudah ada (edge case `output file already exists`) → `VACUUM INTO` via `getPrisma().$executeRawUnsafe` → stat size → `collectResultOf({kind: database, relativePath: 'aplibrary.db', sizeBytes})`.
- `verify(entry)`: cek file ada → ukuran cocok → sha256 file cocok dgn entry → `PRAGMA integrity_check` pada snapshot (PrismaClient terpisah pada file snapshot) → `verifyResultOf`.
- `cleanup()`: hapus snapshot.

---

## Validation

| Gate | Hasil |
|---|---|
| `npm run lint` (tsc node + web) | PASS |
| `npm run build` | PASS (bundle main 1,893,255 bytes · preload 9.95 kB · renderer 1,147.66 kB) |
| Smoke `wo3_provider_smoke/smoke.ts` | **111/111 PASS** (murni domain + DatabaseProvider DB-backed fresh temp DB) |
| `prisma migrate diff` | "This is an empty migration." (schema tidak disentuh) |
| Grep bundle `out/main/index.js` | `providerRegistry`=True, `RestoreHandlerRegistry`=True, `aplibrary.db`=True, `VACUUM INTO`=True (ter-wire di container) |

### Cakupan smoke (111 assertions)
- **ProviderId (15)** — valid + fullName + equals + toJSON; name/version kosong/trim/over-limit ditolak; `isProviderIdJSON`.
- **ProviderKind & Requirement (9)** — keempat kind valid; tak dikenal/uppercase ditolak; required/optional valid; label WAJIB/OPSIONAL.
- **Provider contract (12)** — `collectResultOf` valid/kind invalid/size invalid/relativePath invalid; `verifyResultOf` ok boolean/messages array.
- **Restore Handler contract (9)** — `restoreVerifyResultOf` valid/invalid; `assertProviderRequirement`.
- **ProviderRegistry (15)** — register+discover, duplikat id → `ProviderDomainError`, count, findById, findByKind, required/optional grouping.
- **RestoreHandlerRegistry (9)** — register+discover, duplikat → error, findById/findByKind/required/optional.
- **Pre-flight (24)** — PreflightItem valid/invalid, PreflightReport ok/hasWarning/failedItems/warningItems, decideProviderPreflight: semua pass → proceed, required fail → abort, optional fail → skip+warning, warning → warning tanpa skip, campuran.
- **DatabaseProvider DB-backed (18)** — collect → snapshot ada + ukuran > 0 + relativePath `aplibrary.db`; verify pass; entry salah (size/sha256) → verify fail; cleanup → snapshot hilang; collect idempoten (2× tanpa error).

### Catatan wiring
- `electron/main/bootstrap.ts` — `createContainer(paths)`: `databaseProvider = new DatabaseProvider({ stagingDir: paths.tempDir })`, didaftarkan ke `ProviderRegistry`; `RestoreHandlerRegistry` dibuat (kosong — handler database di WO Restore Engine). Dua field baru di interface `Container`.
- Belum ada pemicu (engine) yang memanggil provider — DatabaseProvider siap dipanggil Backup Engine WO-4.

---

## Decision

| # | Keputusan | Alasan |
|---|---|---|
| D1 | **Lokasi `src/main/domain/provider/`** (murni) + `src/main/infrastructure/providers/` (infra) | Pola pemisahan pure-vs-electron (WO-1 infra); domain headless-testable, infra menyentuh sqlite/filesystem. |
| D2 | **Kontrak `collect()` mengembalikan `{kind, relativePath, sizeBytes}`** (metadata awal), checksum dihitung Manifest Builder | RFC-003 §5: checksum tiap unit dihitung pada tahap Manifest (bukan oleh provider). Provider menyuplai data + metadata awal. |
| D3 | **`verify(entry)` menerima `ManifestEntry`** | Verifikasi unit (ukuran/sha256/integritas) butuh nilai manifest; kontrak pasif ManifestEntry dibagikan lintas arah (backup & restore). |
| D4 | **Registry anti-duplikat via `equals`** | Dua provider dengan id sama = ambiguitas sumber data; throw lebih aman daripada silent overwrite. |
| D5 | **`decideProviderPreflight` murni & stateless** | Failure Strategy ADR (K5/K7) diekspresikan sebagai fungsi murni dari states → mudah diuji headless; engine tinggal memanggil. |
| D6 | **`RestoreHandler.swapToLive` hanya dipanggil Swapper** | Invarian ADR-001 §3.3/§7: Swapper = satu-satunya komponen yang menulis DB live/aset; kontrak menegaskan pembatasan. |
| D7 | **DatabaseProvider staging = `paths.tempDir`** (dari WO-1 infra) | Lokasi staging final (ADR-001 §8.2 Q8) masih open; `temp/` sudah ada & selalu dibersihkan — tidak menetapkan keputusan open. |
| D8 | **Metode snapshot = VACUUM INTO (`vacuum-into`)** | ADR-001 §3.2: metode teknis bebas, hasil wajib konsisten; VACUUM INTO terbukti menghasilkan snapshot konsisten (database-discovery + probe). Dikomunikasikan di `meta.engine` nanti. |

---

## Next

- **BERHENTI — menunggu review PO.** Tidak membuka WO berikutnya (WO-4 Backup Engine) sebelum persetujuan.
