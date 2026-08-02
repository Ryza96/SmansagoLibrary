# WORK_ORDER_5_P4C_REPORT

## Objective
Mengaktifkan `writePhase()` (sebelumnya stub) pada `MemberImportService`: SATU transaksi berisi alokasi nomor + insert Member chunked, commit sekali, rollback otomatis, dan mapping P2002 → `MemberImportResultDTO` tanpa throw untuk business error. Scope **HANYA** transaction & database write. Tanpa IPC, preload, env.d.ts, UI, progress.

## Files Modified
| File | Perubahan |
|------|-----------|
| `src/main/services/member-import.service.ts` | `writePhase()` diaktifkan (`runTransaction` + `allocateMemberNumbers` + `createManyWithTx`); `buildPayload()` (RFC §6.3); `parseBirthDate()`; `isUniqueConstraintError()`; catch P2002 → result; sentinel stub dihapus; `MEMBER_IMPORT_CREATE_FAILED_MESSAGE_KEY` ditambahkan |
| `src/main/repositories/member.repository.ts` | Tambah `createManyWithTx(tx, rows)` — `createMany` di-chunk per `IMPORT_CONFIG.MEMBER_IMPORT_WRITE_CHUNK` DI DALAM tx yang sama (RFC §8.2) |
| `src/config/import.config.ts` | Tambah `MEMBER_IMPORT_WRITE_CHUNK: 500` (RFC §8.1) |
| `uat_wo5_p4c/transaction-write.smoke.ts` | **BARU** — smoke 48 check (tidak di-commit) |

**TIDAK diubah:** IPC, preload, env.d.ts, UI, progress; P1/P2/P3 services; schema/migrasi; public API `MemberImportService` (tetap persis RFC).

## Transaction Flow
```
import(rows) bersih
  │  single-flight + preflight ulang (read-only)
  ▼
runTransaction(getPrisma(), async (tx) => {        ← SATU $transaction
    numbers = numberGenerator.allocateMemberNumbers(tx, rows.length, 'student')
        → NumberGeneratorService membaca max suffix DI DALAM tx (O(1)),
          mengalokasikan max+1 .. max+count di memori
    payload = buildPayload(rows, classIdByRow, numbers)
        → MemberCreateManyInput per RFC §6.3:
            memberType: 'student'
            status:     'INACTIVE'
            classId:    dari MemberClassResolver (classIdByRow[rowNumber] ?? null)
            memberNumber: nomor berurutan (selaras urutan baris input)
            + fullName, gender, nisn, birthPlace, birthDate (parse),
              address, phone, email
    memberRepository.createManyWithTx(tx, payload)
        → createMany per chunk MEMBER_IMPORT_WRITE_CHUNK=500, SEMUA di dalam tx
    return payload.length
})
  │  COMMIT otomatis di akhir $transaction (commit SEKALI)
  ▼
MemberImportResultDTO { success:true, created, failed:0, ... }
```

- **Commit sekali** — dikelola `prisma.$transaction(fn)` interaktif (`runTransaction` reuse dari `src/main/repositories/base/transaction.ts`). Tidak ada commit per baris.
- **Semua statement tulis** (allocator read + semua chunk `createMany`) memakai objek `tx` yang sama → atomicity & nomor aman dari race.
- **Progress:** tidak ada penambahan apa pun (kondisi PO: jangan membuat progress). Panggilan `onProgress` yang sudah ada dari P4B dibiarkan tidak berubah.

## Rollback Strategy
| Skenario | Perilaku |
|----------|----------|
| Exception apa pun di dalam `fn(tx)` | Prisma **ROLLBACK otomatis** → 0 baris tersimpan (all-or-nothing) |
| P2002 (unique constraint `nisn`/`memberNumber`) saat commit | ROLLBACK penuh → ditangkap `isUniqueConstraintError` → `MemberImportResultDTO { success:false, created:0, failed:totalRows, errors:[{ rowNumber:-1, messageKey:'memberImport.createFailed' }] }`. **Tidak di-throw** (business error → result object) |
| **Nomor tidak hilang setelah rollback (PO #12)** | Alokasi nomor terjadi DI DALAM tx yang sama. ROLLBACK → `max suffix` DB tidak berubah, nomor yang sempat dialokasikan tidak dianggap terpakai. Percobaan berikutnya mengalokasikan ulang dari `max+1` yang sama (diverifikasi S5: setelah rollback, import berikutnya mendapat `S-000004`, bukan melompat) |
| Batch campuran (ada baris bersih + baris duplikat) | Seluruh batch rollback; baris bersih pun tidak tersisa (diverifikasi S7) |
| Error non-P2002 (DB down/timeout) | di-`throw` ulang → reject promise (kontrak error sistem RFC §3.2) |

> Catatan: `createMany` (bulk) tidak mengidentifikasi baris mana yang melanggar constraint → P2002 dipetakan sebagai error global (`rowNumber:-1`, `memberImport.createFailed`). Mapping "per baris" persis hanya mungkin jika insert dilakukan per-baris, yang ditolak keputusan PO #1 (all-or-nothing) — lihat RFC §11.

## Validation
- `npm run lint` (tsc node+web): **PASS**
- `npm run build`: **PASS** (out/main 1,762.82 kB; out/preload 7.26 kB; out/renderer 925.16 kB js + 35.64 kB css)
- Smoke fresh DB (migrate deploy 3 migration; DB temp dibersihkan sesudah run): **48/48 PASS**
  - S1 preflight blocker class → `success:false`, 0 tulis (regresi P4B)
  - S2 **import berhasil** → `success:true, created:2, failed:0`; count 2; nomor berurutan `S-000001,S-000002`; field terverifikasi: `status=INACTIVE`, `memberType=student`, `classId` dari resolver (XI IPA 2 / XII TKJ 1), `nisn`, `email`, `birthPlace`, `birthDate` ter-parse
  - S3 lanjutan nomor berurutan → `S-000003`, `classId` X MIPA 1 benar
  - S4 **duplicate commit menghasilkan rollback** (duplikat nisn dalam batch, lolos preflight) → `success:false, created:0, failed:2, createFailed`; count tetap 3
  - S5 **nomor tidak hilang setelah rollback** → setelah rollback, import bersih mendapat `S-000004` (bukan melompat) — membuktikan alokasi rollback tidak terpakai
  - S6 single-flight (regresi P4B) → import kedua ditolak, tanpa tulis
  - S7 batch campuran → rollback penuh tanpa partial commit; baris bersih tidak tersisa
  - S8 duplikat NISN vs DB → blocker preflight (regresi), tanpa tulis
  - S9 **chunk write** → 505 baris (2 statement `createMany`: 500 + 5), `created:505`, count 509, nomor berlanjut `S-000509`

## Compatibility
- **Tanpa regresi:** lint + build PASS; IPC/preload/env.d.ts/UI tidak tersentuh; public API `MemberImportService` sama persis RFC (`isImportRunning`, `previewCheck`, `import`).
- **Repository additive:** `createManyWithTx` + `MEMBER_IMPORT_WRITE_CHUNK` tidak mengubah perilaku repository/single-create lain.
- **P1–P3 & P4B tetap kompatibel:** `NumberGeneratorService.allocateMemberNumbers(tx, count, 'student')` dipakai apa adanya; `MemberDuplicateChecker`/`MemberClassResolver` read-only; preflight di `import()` tetap diulang (TOCTOU).
- **Siap untuk P5** (IPC/preload/env/bootstrap) dan P6 (UI): `MemberImportResultDTO` kini berisi hasil nyata (`created>0`), `MemberImportPreviewDTO` sudah berfungsi penuh; progress `onProgress` sudah tersedia di `import()` dan tinggal di-wire ke channel `members:importProgress` di P5.

## Status
**DONE — menunggu review Product Owner.** Tanpa IPC, UI, progress; tidak ada commit. Lanjut P5 hanya setelah approval.
