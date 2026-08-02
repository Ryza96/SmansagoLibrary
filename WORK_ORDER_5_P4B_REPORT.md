# WORK_ORDER_5_P4B_REPORT

## Objective
Membuat `MemberImportService` sebagai orchestrator CORE import anggota (WO-5 P4B) sesuai `MEMBER_IMPORT_SERVICE_ARCHITECTURE_RFC.md` (APPROVED). Scope **HANYA core**: constructor DI, `previewCheck()`, `import()` (single-flight + re-preflight + validasi blocker), struktur internal siap untuk P4C. **TANPA** transaksi, insert, createMany, IPC, perubahan UI.

## Files Modified
| File | Perubahan |
|------|-----------|
| `src/main/services/member-import.service.ts` | **BARU** — `MemberImportService` orchestrator core |
| `src/shared/dto/member.ts` | Tambah 5 DTO: `MemberImportPreviewIssue`, `MemberImportPreviewDTO`, `MemberImportResultDTO`, `MemberImportStage`, `MemberImportProgressEvent` |
| `uat_wo5_p4b/member-import-core.smoke.ts` | **BARU** — smoke 45 check (tidak di-commit) |

**TIDAK diubah:** P1/P2/P3 services, repository, config, IPC, preload, env.d.ts, bootstrap, UI, schema/migrasi.

## Architecture
`MemberImportService` = orchestrator tipis, single-flight, dependensi di-inject via constructor (4 buah, sesuai RFC §7.1/§8):

```
MemberImportService
├─ MemberDuplicateChecker  (P2)  → preflight Tahap 2 (DB duplikat NISN/email, chunked IN)
├─ MemberClassResolver     (P3)  → preflight kelas (findActive + findByAcademicYear, map in-memory)
├─ NumberGeneratorService  (P1)  → reserved untuk P4C (allocateMemberNumbers(tx, count, 'student'))
└─ MemberRepository              → reserved untuk P4C (createManyWithTx)
```

Alur:
- **`previewCheck(rows)`** → `preflight()` read-only (Duplicate DB → Resolve Class → gabung) → `MemberImportPreviewDTO` (`valid/errorCount/warningCount/errors/warnings`). Tanpa tulis, tanpa progress (RFC §9.3).
- **`import(rows, { onProgress? })`** → guard single-flight → `preflight()` **diulang** (defense-in-depth / TOCTOU) → ada blocker → langsung `MemberImportResultDTO { success:false, created:0, failed:totalRows, errors }` tanpa tulis. Preflight bersih → memanggil `writePhase()` (stub P4B yang melempar sentinel → dikembalikan `success:false` deterministik dengan `memberImport.importFailed`; **belum ada tulis**).
- **Struktur untuk P4C:** fase tulis diisolasi di `writePhase(rows, classIdByRow, onProgress)` — P4C cukup mengisi body-nya dengan SATU `$transaction` (`allocateMemberNumbers` + `createManyWithTx` + mapping P2002 per baris) tanpa mengubah public API. `preflight()` sudah menyiapkan `classIdByRow: Map<rowNumber, classId>` untuk pembangunan payload.

**Kontrak lempar-vs-return (RFC §3.2/§9):** kasus bisnis (blocker preflight, P2002 saat commit, single-flight) → result object; error sistem (DB down/timeout) → throw → reject promise.

## Public API
```ts
class MemberImportService {
  constructor(
    duplicateChecker: MemberDuplicateChecker,
    classResolver: MemberClassResolver,
    numberGenerator: NumberGeneratorService,
    memberRepository: MemberRepository
  )
  isImportRunning(): boolean
  previewCheck(rows: MemberImportRowInput[]): Promise<MemberImportPreviewDTO>
  import(rows: MemberImportRowInput[], options?: { onProgress?: (e: MemberImportProgressEvent) => void }): Promise<MemberImportResultDTO>
}
```
Persis RFC — tidak ada penambahan/pengurangan. `numberGenerator`/`memberRepository` belum dipakai sampai P4C (reserved via DI).

## Validation
- `npm run lint` (tsc node+web): **PASS**
- `npm run build`: **PASS** (out/main 1,762.56 kB; out/preload 7.26 kB; out/renderer 925.16 kB js + 35.64 kB css)
- Smoke fresh DB (migrate deploy 3 migration; DB temp dibersihkan sesudah run): **45/45 PASS**
  - S1 preview bersih → `valid:true`, errorCount 0, tanpa tulis
  - S2 class tidak ditemukan → `classNotFound` + rowNumber 18 + className "XI Merdeka 1"
  - S3 class ambigu → `classAmbiguous` + className "X MIPA 1"
  - S4/S4b duplikat DB → `duplicateNisnInDb` (field/existingMemberNumber/existingMemberName) & `duplicateEmailInDb`
  - S5 gabungan blocker → 2 error (keduanya tampil sekaligus)
  - S6 import preflight gagal → `success:false, created:0, failed=totalRows, errors` + DB count tetap
  - S7 import preflight bersih (P4B) → `success:false, created:0, importFailed` deterministik, tanpa tulis; progress `preparing→checking-duplicate→resolving-class→generating-number`, `completed` tidak terkirim
  - S8 single-flight → import kedua ditolak (`importFailed`), import pertama `classNotFound`, `isImportRunning()` true saat berjalan / false setelah selesai

## Compatibility
- **Tanpa regresi:** lint + build PASS; P1/P2/P3, repository, IPC/preload/bootstrap, UI tidak tersentuh.
- **DTO baru** hanya additive di `src/shared/dto/member.ts`; `MemberImportPreviewIssue` struktural kompatibel dengan `MatchingIssue` (`{ rowNumber, messageKey }` + field opsional).
- **Public API stabil** untuk P4C (transaksi + `createManyWithTx`) dan P5 (IPC/preload/env/bootstrap wiring) — keduanya tinggal memanfaatkan kontrak yang sama tanpa mengubah core.
- **Belum ada `createManyWithTx`/`MEMBER_IMPORT_WRITE_CHUNK`** (sengaja — scope P4C). Nomor anggota tetap `S-...` dijalur single-create; import belum menulis apa pun di P4B.

## Status
**DONE — menunggu review Product Owner.** Tidak ada transaksi, insert, IPC, UI; tidak ada commit. Lanjut P4C hanya setelah approval.
