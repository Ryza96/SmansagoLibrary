# WO7_DISCOVERY_REPORT

**WO-7 — CL-1: Class Immutability Guard (rename = row baru)**
**Mode: DISCOVERY ONLY — READ ONLY. Tidak ada kode yang diubah.**
**Tanggal: 2026-08-03**

> **Pemetaan penomoran:** WO-7 (urutan eksekusi sesi ini) = **WBS #8 CL-1 — Class immutability guard**.
> Domain yang dilabeli "Class Master" oleh PO dipecah WBS menjadi **CL-1** (guard immutability, WO ini) →
> **CL-2a** (Class Master UI CRUD) → **CL-2b** (clone ke tahun baru). **WO ini hanya CL-1.**
> Fase A2 roadmap: `AY-1a → AY-1b → AY-2 ∥ C-1 ∥ CL-1 → CL-2a → CL-2b`.

---

## 1. Current Architecture

### 1.1 Prisma Schema — `model Class` (`prisma/schema.prisma:41-60`)
```prisma
model Class {
  id              String   @id @default(uuid())
  academicYearId  String
  curriculumId    String
  educationLevel  String
  parallel        String
  homeroomTeacher String?
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  academicYear     AcademicYear @relation(fields: [academicYearId], references: [id])
  curriculum       Curriculum   @relation(fields: [curriculumId], references: [id])
  members          Member[]
  memberEnrollments MemberEnrollment[]
  @@unique([academicYearId, curriculumId, educationLevel, parallel])
  @@index([academicYearId])
  @@index([curriculumId])
}
```
- Komposit identitas kelas = `(academicYearId, curriculumId, educationLevel, parallel)` — `@@unique`.
- `MemberEnrollment` (F2a, sudah ada) mereferensikan `Class` → **row lama tetap dirujuk histori** → alasan immutability.

### 1.2 Repository — `src/main/repositories/class.repository.ts`
| Method | Catatan |
|--------|---------|
| `create` / `update` / `delete` / `findById` | CRUD dasar, `update` menerima field apa pun |
| `findMany(options)` | paginated `{data,total,...}`, `search` hanya di `parallel` (`contains`) |
| `findByAcademicYear(academicYearId)` | dipakai `MemberClassResolver` |
| `findDuplicate(ayId, curId, level, parallel, excludeId?)` | cek komposit unik |
| `countByAcademicYear` / `countByCurriculum` / `count` | guard delete kurikulum / tahun |

### 1.3 Service — `src/main/services/class.service.ts`
- `create(input)`: cek `academicYearRepository.existsById` + `curriculumRepository.existsById` + `findDuplicate` → `repository.create`. **TIDAK memvalidasi `educationLevel` terhadap F1.**
- `update(id, input)`: **GAP — saat ini MENGIZINKAN mengubah `educationLevel` dan `parallel`** (line 80-122 merge input → `repository.update`). `comboChanged` mencakup 4 kolom komposit.
- `delete(id)`: guard `memberRepository.countByClass(id) > 0` → 400 (masih `Member.classId` legacy — RFC F2/E-2 yang akan pindah ke `enrollment.count`; **di luar scope CL-1**).
- `findById` → 404 bila tidak ada; `toDTO` membangun `displayName = "${level} ${parallel}"`.

### 1.4 IPC / Preload / env.d.ts / DTO — lengkap & ter-wire
| Layer | File | Status |
|-------|------|--------|
| IPC | `electron/ipc/class.ipc.ts` | 5 channel: `classes:findMany/findById/create/update/delete` |
| Preload | `electron/preload/class.preload.ts` | `api.classes.*` (create/update input `Record<string,unknown>`) |
| env.d.ts | `src/renderer/env.d.ts:162-174` | tipe penuh, DTO dari `src/shared/dto/academic` |
| DTO | `src/shared/dto/academic.ts:40-68` | `ClassDTO` / `CreateClassDTO` / `UpdateClassDTO` |
| Bootstrap | `electron/main/bootstrap.ts:105` | `new ClassService(classRepo, ayRepo, curRepo, newMemberRepository)` |
| IPC index | `electron/ipc/index.ts:54,80` | `classService` di-inject + `registerClassHandlers` |

### 1.5 F1 Config — `src/shared/config/education-level.ts` (single source of truth)
```ts
export const EDUCATION_LEVELS = new Set(['X', 'XI', 'XII'])
export function levelOrder(level: string): number { return ORDER[level] ?? NaN }
```
- Sudah dipakai `MemberClassResolver` (parse className import). **BELUM dipakai `ClassService`.**

### 1.6 Konsumen UI
- **0 konsumen** `classes:*` di `src/` (grep `api.classes|.classes.findMany|create|update|delete` = 0 match); tidak ada route class. Backend kelas **belum dipakai UI** — itu scope CL-2a, bukan WO ini.

---

## 2. Files Impact Analysis

### DIMODIFIKASI (1 file source)
| File | Perubahan |
|------|-----------|
| `src/main/services/class.service.ts` | (a) `create`: normalisasi + validasi `educationLevel` via `EDUCATION_LEVELS` (F1); (b) `update`: **blokir** perubahan `educationLevel`/`parallel` → AppError 400; bersihkan kedua field dari payload `repository.update`. |

### DIBUAT (1 file smoke)
| File | Keterangan |
|------|-----------|
| `wo7_cl1_smoke/smoke.ts` | Test positif + negatif pada fresh DB temp (pola `wo6_c1_smoke`). |

### N/A (eksplisit — TIDAK disentuh)
Repository, IPC, Preload, env.d.ts, DTO, schema, migration, bootstrap, resolver, seluruh UI, AcademicYear, Curriculum, MemberEnrollment, PromotionRun(+Item).

---

## 3. Dependency Analysis

| Dependensi | Status | Catatan |
|-----------|--------|---------|
| **F1** (`EDUCATION_LEVELS` / `levelOrder`) | ✅ tersedia | WBS CL-1 Dependency: F1; config sudah ada & dipakai resolver |
| `ClassRepository` / `AcademicYearRepository` / `CurriculumRepository` / `MemberRepository` | ✅ tersedia | sudah di-inject bootstrap |
| `AppError` (`electron/main/errorHandler`) | ✅ tersedia | error guard mengalir via handler IPC yang ada |
| IPC/Preload/env.d.ts | N/A | guard di Service → error otomatis terpropagasi; **tidak perlu perubahan channel** |
| Schema / migration | N/A | **tanpa schema, tanpa migration** |

**Tidak ada dependensi baru.** Tidak ada perubahan `package.json`.

---

## 4. Risk Analysis

| # | Risiko | Severity | Mitigasi / Keputusan |
|---|--------|----------|----------------------|
| R1 | **Update in-place `academicYearId`/`curriculumId`** masih diizinkan (di luar 2 kolom WBS) — memindah kelas ke tahun/kurikulum lain memalsukan histori enrollment | Medium | WBS CL-1 scope = **tolak 2 kolom** (`educationLevel`+`parallel`). Keputusan PO opsional: bisa ditambahkan sebagai hardening (recommended defense-in-depth), default = tetap WBS-strict. |
| R2 | **Level non-baku** (`"x"`, `" ix "`, `"XIIA"`) lolos create → row `"x"` vs `"X"` dua baris → resolver import jadi `classAmbiguous` (key di-uppercase) | Medium | Normalisasi `trim().toUpperCase()` sebelum validasi & simpan → cegah duplikat casing. |
| R3 | **Parallel whitespace** tidak dinormalisasi (di luar scope) — kolisi ambigu serupa R2 bila ada spasi ekstra | Low | Opsional: `trim()`+collapse. Default CL-1 tidak menyentuh (perilaku create saat ini dipertahankan). |
| R4 | **Delete guard tetap `Member.classId`** legacy | Info | RFC F2 → WO E-2 (cutover ke `enrollment.count`). Bukan scope CL-1; jangan diubah di WO ini. |
| R5 | **DTO `UpdateClassDTO` masih punya `educationLevel`/`parallel`** — field tersisa tapi ditolak service | Low | SENG AJA dibiarkan: CL-2a UI tidak akan mengirimnya; menghapus field dari DTO akan melanggar aturan "jangan ubah DTO di WO guard" dan bisa pecah kontrak. Guard = service layer (pola WBS). |
| R6 | **Regresi duplicate-check** saat normalisasi level | Low | `findDuplicate` & `repository.create` memakai nilai ternormalisasi → konsisten. Smoke regresi duplicate disertakan. |

---

## 5. Architecture Compliance

| Aturan (RFC/WBS) | Kepatuhan WO ini |
|------------------|------------------|
| RFC §13 (PO #3): `educationLevel` + `parallel` **immutable**; rename = row baru; row lama dirujuk histori | ✅ Guard di `update` (tolak 2 kolom) → **tidak ada jalur mengubah nama kelas eksisting**; alur "row baru" di bangun CL-2a/CL-2b |
| RFC §12.1 & keputusan F1: validasi level lewat config terpusat | ✅ `EDUCATION_LEVELS` (F1) dipakai `ClassService.create` |
| WBS §3 Flow: `Service → Testing → PO Review` (Repository/IPC/Preload/UI = N/A) | ✅ layer dilewati dinyatakan N/A eksplisit |
| WBS §4 Gate: lint, build, manual test, docs, PO approval | ✅ dipenuhi (lihat §7) |
| WBS CL-1 Deliverable: "Guard + test"; Validasi: "unit: update parallel → error; level invalid → error" | ✅ smoke negatif mencakup keduanya |
| JANGAN: schema/migration, AY, Curriculum, Enrollment, Promotion | ✅ tidak disentuh (0 perubahan schema) |

---

## 6. Implementation Plan

1. **`src/main/services/class.service.ts` — `create`:**
   - Normalisasi: `const level = input.educationLevel.trim().toUpperCase()`.
   - Validasi: `if (!EDUCATION_LEVELS.has(level))` → `AppError(400, 'Conflict', \`Tingkat pendidikan ${input.educationLevel} tidak valid (X/XI/XII)\`)`.
   - Pakai `level` ternormalisasi untuk `findDuplicate` dan `repository.create`.
2. **`src/main/services/class.service.ts` — `update`:**
   - Jika `input.educationLevel !== undefined || input.parallel !== undefined` → `AppError(400, 'Conflict', 'Kelas tidak dapat diubah (educationLevel/parallel immutable — buat kelas baru untuk rename)')`.
   - Hapus `educationLevel`/`parallel` dari argumen `repository.update` (tetap kirim `academicYearId`, `curriculumId`, `homeroomTeacher`, `isActive` bila ada).
   - Simpan logika `comboChanged` (AY/curriculum) apa adanya.
3. **`wo7_cl1_smoke/smoke.ts`** (fresh DB temp, compile tsc commonjs, pola wo6):
   - S1 create level valid → PASS; S2 create level invalid `"IX"` → 400; S3 create lowercase `"x"` → tersimpan sebagai `"X"` (normalisasi); S4 duplicate komposit → 400 (regresi); S5 update `parallel` → 400; S6 update `educationLevel` → 400; S7 update `homeroomTeacher` → sukses; S8 update `isActive` → sukses; S9 `findMany` list + search → PASS; S10 (regresi) delete kelas ber-anggota → 400 tetap.
4. `npm run lint` → `npm run build`.
5. Tulis laporan (Implementation / Final Review / Release), update `AGENTS.md` (section WO-7/CL-1).
6. `git status` (hanya file WO-7) → ONE FINAL COMMIT → push → **BERHENTI menunggu review PO.**

---

## 7. Validation Plan

| # | Check | Cara |
|---|-------|------|
| 1 | lint PASS | `npm run lint` (tsc node + web) |
| 2 | build PASS | `npm run build` — bandingkan ukuran bundle (tidak ada perubahan renderer) |
| 3 | Negative: update parallel → error | smoke S5 (AppError 400) |
| 4 | Negative: level invalid → error | smoke S2 (AppError 400) |
| 5 | Positive: CRUD lain tak terganggu | smoke S1,S7,S8,S9 |
| 6 | Regresi guard duplicate + delete | smoke S4,S10 |
| 7 | DB live dev tidak disentuh | smoke pakai fresh DB temp (`file:C:/Users/hp/AppData/Local/Temp/opencode/...`) + dibersihkan |
| 8 | Documentation | AGENTS.md + 3 laporan + (jika ada perubahan env.d.ts/DTO — **tidak ada**) |

---

## 8. Exit Criteria

1. **Tidak ada jalur mengubah `educationLevel`/`parallel` kelas eksisting** — `ClassService.update` melempar 400 (verifikasi smoke S5/S6).
2. `educationLevel` saat create hanya menerima **X/XI/XII** (via F1 config) setelah normalisasi trim+uppercase (verifikasi S2/S3).
3. lint + build PASS; smoke **10/10 PASS** pada fresh DB temp.
4. Laporan WO (Implementation / Final Review / Release) + `AGENTS.md` di-update; N/A layer dinyatakan eksplisit.
5. ONE FINAL COMMIT + push → **BERHENTI** menunggu review PO (tidak lanjut CL-2a).

---

## Verdict

# ✅ READY FOR IMPLEMENTATION

**Alasan:**
- Scope CL-1 jelas & sempit: **satu file source** (`class.service.ts`) + smoke. Backend (IPC/Preload/env.d.ts/DTO), schema, migration **tidak perlu diubah** — semua kontrak sudah ada sejak WO-005/F1.
- Dependensi F1 sudah tersedia dan sudah dipakai resolver → tinggal diadopsi `ClassService`.
- Gap yang ditutup terukur: (1) `update` saat ini mengizinkan mutasi kolom immutable; (2) `create` tidak memvalidasi level. Keduanya diverifikasi via smoke negatif.
- Tidak ada benturan dengan RFC §13 / WBS; layer Repository/IPC/Preload/UI dinyatakan N/A (WBS §3 mengizinkan).
- Risk R1 (AY/curriculum tetap bisa diubah) = keputusan PO opsional, **bukan blocker**; default mengikuti WBS-strict.

**Catatan untuk PO:** bila ingin, R1 bisa sekaligus memblokir perubahan `academicYearId`/`curriculumId` (hardening immutability menyeluruh) — cukup konfirmasi, maka dimasukkan dalam Implementation Plan.
