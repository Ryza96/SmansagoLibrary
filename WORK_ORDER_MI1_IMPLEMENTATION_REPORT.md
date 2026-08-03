# WORK ORDER MI-1 — Member Import Resolver (Skop Eksplisit)

## Ringkasan

MI-1 mengubah `MemberClassResolver` agar import anggota meresolusi kelas terhadap **kombinasi
Academic Year + Curriculum yang dipilih** (RFC §12.1 step 4; WBS WO-17 MI-1), mempertahankan
`classNotFound`/`classAmbiguous` sebagai BLOCKER, dan meneruskan pilihan scope ke seluruh rantai
Service → IPC → preload. **Tanpa UI import baru** (dialog pilih tahun/kurikulum = MI-2), tanpa
schema/migration/DB, tanpa write-phase (tulis `MemberEnrollment` = step 5/MI-2).

**Keputusan kunci:**
- `resolve(rows, academicYearId, curriculumId)` — skop eksplisit. `academicYearId=null` → fallback
  tahun ajaran AKTIF (backward-compat UI lama); `curriculumId=null` → filter tahun saja.
- Class key unik di DB `(academicYearId, curriculumId, educationLevel, parallel)` → dengan skop
  (tahun+kurikulum) eksplisit, satu nama kelas pasti 1 kelas; `classAmbiguous` tetap hidup pada
  jalur tanpa filter kurikulum (nama sama di beberapa kurikulum satu tahun).
- BLOCKER (keputusan PO #5) tidak berubah: DILARANG auto-create; notFound/ambiguous = import gagal;
  error WAJIB memuat `className`.

## Source of Truth

- `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) — §12.1 (step 1 dialog, step 4 resolver
  eksplisit, step 5 write phase), §6 (resolver & batch strategy)
- `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) — WO-17 MI-1: "signature baru", "filter kelas",
  unit test "aktif vs spesifik; 0 kelas → notFound; >1 → ambiguous"
- `WORK_ORDER_E1/E2/E3/E4_IMPLEMENTATION_REPORT.md` (pola laporan)

## Deliverable

| File | Perubahan |
|------|-----------|
| `src/shared/dto/member.ts` | +`MemberImportScope { academicYearId: string; curriculumId: string \| null }` (aditif) |
| `src/main/repositories/class.repository.ts` | +`findByAcademicYearAndCurriculum(academicYearId, curriculumId)` (null → filter tahun saja); `findByAcademicYear` dipertahankan |
| `src/main/services/member-class-resolver.service.ts` | `resolve(rows, academicYearId, curriculumId)` — skop eksplisit + fallback tahun aktif; header RFC §12.1 |
| `src/main/services/member-import.service.ts` | `previewCheck(rows, scope?)` / `import(rows, { ..., scope? })` / `preflight(rows, scope?, onProgress?)` meneruskan scope ke resolver |
| `electron/ipc/member.ipc.ts` | handler `members:previewCheck`/`members:import` menerima argumen ketiga opsional `scope?` |
| `electron/preload/member.preload.ts` | `memberImport.previewCheck(rows, scope?)` / `memberImport.import(rows, scope?)` |
| `src/renderer/env.d.ts` | signature `previewCheck`/`import` + `MemberImportScope` opsional |
| `wo17_mi1_smoke/smoke.ts` | **baru** — 39 assertion (12 step) |

### Tidak diubah

UI Import (dialog masih kirim `rows` saja — tahun/kurikulum dari dialog = MI-2), Schema, Migration,
Bootstrap, write phase (`Member.classId` + `status=INACTIVE` masih ditulis — step 5 = MI-2),
Enrollment, Promotion, DTO lain.

## Desain

### 1. Resolver — skop eksplisit (RFC §12.1 step 4)
```
resolve(rows, academicYearId, curriculumId)
  yearId = academicYearId ?? (findActive)?.id ?? null   // fallback backward-compat
  yearId null → semua baris classNotFound
  classes = findByAcademicYearAndCurriculum(yearId, curriculumId)   // 1 query
  Map<educationLevel|parallel, Class[]> → lookup per baris
    1 kelas → classId | 0 kelas → classNotFound | >1 kelas → classAmbiguous
```
Strategi batch (RFC §6.3) dipertahankan: maksimal 2 query (year + classes), tidak ada query per baris.

### 2. Ambiguity dengan skop eksplisit
Class key komposit DB unik per `(tahun, kurikulum, level, paralel)` → dengan `curriculumId` eksplisit
ambiguity tak mungkin terjadi (diperlihatkan smoke STEP 5: `X A` pada k1 = `classA`, bukan ambiguous).
`classAmbiguous` tetap ditegakkan pada jalur `curriculumId=null` (backward-compat) dan tetap menjadi
BLOCKER bila data melanggar unik.

### 3. Penerusan scope (Service → IPC → preload)
`MemberImportScope` aditif; argumen posisi tidak diubah (no breaking change). `previewCheck(rows, scope?)`
dan `import(rows, { scope?, onProgress? })` meneruskan ke `preflight`, lalu `classResolver.resolve`.
Bila scope tidak diberikan → resolver fallback tahun aktif (perilaku UI lama terjaga).

## Validation

### 1. Lint — PASS
`npm run lint` (tsc node + web) bersih.

### 2. Build — PASS
`npm run build`: main **1,792.23 kB** · preload **8.62 kB** · renderer **999.83 kB**
(renderer identik E-4 = bukti frontend N/A; preload naik ~0.23 kB).

### 3. Smoke MI-1 — 39/39 PASS (fresh DB)
`wo17_mi1_smoke/smoke.ts` pada DB temp (fresh `prisma migrate deploy`, 4 migrations; dibersihkan):
- **Skop eksplisit tahun aktif:** `X A`→`classA`, `X B`→`classB` (0 error).
- **Curriculum berbeda:** `X A` skop k2 → `classC` (kelas kurikulum pilihan).
- **Academic year berbeda (nonaktif):** `X A` skop yearB → `classD` (skop tahun eksplisit).
- **classNotFound BLOCKER:** `XI A` tahun aktif → `memberImport.classNotFound`, error berisi `className`;
  `tanpa-paralel` (tak ter-parse) → notFound; `"x a"` case-insensitive → ter-resolve.
- **classAmbiguous BLOCKER:** `X A` tanpa filter kurikulum → `memberImport.classAmbiguous`;
  dengan k1 eksplisit → `classA` (TIDAK ambigu).
- **Fallback backward-compat:** `academicYearId=null` → tahun aktif; tanpa tahun aktif → semua notFound.
- **Service `previewCheck`:** scope valid → `valid:true`; `XI A` → invalid + classNotFound.
- **Service `import` (regression write phase):** scope k1 → member.classId=`classA` (bukan classC),
  status INACTIVE, memberNumber `S-000001`; tanpa scope → tahun aktif (`classB`); scope k2 → `classC`;
  import classNotFound → `success:false`, `created:0`, baris TIDAK tersimpan.

### 4. Regression smoke E-1/E-2/E-3/E-4 — PASS
`wo13_e1_smoke` **39/39**, `wo14_e2_smoke` **36/36**, `wo15_e3_smoke` **78/78**, `wo16_e4_smoke` **45/45**
di-re-run pada fresh DB masing-masing (signature resolver baru tidak merusak kontrak lama; E-smoke tidak
memakai MemberImportService).

### 5. Migrate diff — no drift
`prisma migrate diff --from-migrations --to-schema-datamodel --script` = empty migration (schema tidak disentuh).

## Kesimpulan

**READY.** Resolver import anggota kini selalu meresolusi terhadap tahun+kurikulum pilihan
(exit criteria WBS), `classNotFound`/`classAmbiguous` tetap BLOCKER, jalur backward-compat
(UI lama tanpa scope) terjaga. Write phase (tulis `MemberEnrollment` + status) tetap = MI-2.

## Technical Debt / Catatan

- `findByAcademicYear` di `class.repository.ts` kini TIDAK dipakai oleh resolver (masih dipakai
  `findByAcademicYear` di ClassRepository untuk keperluan lain / guard — diverifikasi no-dead-call di repo).
- `MemberImportScope.academicYearId` wajib diisi UI MI-2; resolver tetap menolerir `null` (fallback aktif)
  demi backward-compat — jangan hapus fallback sampai UI MI-2 menggantikan dialog lama.
- Write phase masih menulis `Member.classId` (legacy) + `status=INACTIVE`; step 5 RFC §12.1
  (tulis `MemberEnrollment`, `classId` tidak lagi ditulis) = scope MI-2, bukan MI-1.
