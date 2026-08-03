# P1_DISCOVERY_REPORT — WO P-1: Promotion Foundation (DISCOVERY ONLY)

- **Status:** DISCOVERY — READ ONLY. Tidak ada perubahan kode/schema/migration/DTO/IPC/UI.
- **Sumber kebenaran:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED, WO-21 P-1) + kode aktual repo.
- **Output:** laporan ini. Berhenti menunggu review Product Owner.

---

## 1. Current Architecture

### 1.1 Model database (SUDAH ADA — deliverable F2a, migration `20260803_wo2_f2a_master_data_akademik`)

Ketiga model fondasi promosi sudah ada di schema dan ter-validasi (smoke `wo2_f2a_smoke` 35/35):

| Model | Schema line | Keterangan |
|-------|-------------|------------|
| `MemberEnrollment` | `prisma/schema.prisma:65` | aggregate root akademik; `status` bebas string (ACTIVE/PROMOTED/REPEATED/REDISTRIBUTED/TRANSFERRED/DROPPED/GRADUATED); **tanpa** `@@unique([memberId, academicYearId])` |
| `PromotionRun` | `prisma/schema.prisma:91` | audit operasi massal; `mode` (AUTOMATIC/MAPPING/BULK_EDIT), `status` (SUCCESS/PARTIAL/FAILED), `summary` JSON, `fromYearId`/`toYearId` |
| `PromotionRunItem` | `prisma/schema.prisma:111` | per-anggota; `outcome` (PROMOTED/REPEATED/REDISTRIBUTED/GRADUATED/NO_TARGET/ERROR), `sourceClassId`, `targetClassId?` |

Relasi: `AcademicYear.promotionRunsFrom` (named `PromotionRunFromYear`) + `promotionRunsTo` (named `PromotionRunToYear`) — schema l.28–29; `Member.promotionRunItems` — l.186.

**Keputusan desain (RFC §2.2, sudah dibuktikan wo2_f2a):** `mode`/`status`/`outcome` adalah **string tanpa DB DEFAULT** — validasi enum ada di Service layer, bukan DB. Uniqueness "satu enrollment AKTIF per anggota" juga domain Service.

### 1.2 Lapisan enrollment (SUDAH ADA — WO E-1, E-4, MI-2, MI-3)

| Layer | File | Metode penting |
|-------|------|----------------|
| Config | `src/shared/config/academic-status.ts` | `ACADEMIC_STATUS` (7 nilai), `isTerminalAcademicStatus`, `memberStatusForTerminalAcademic` (GRADUATED/TRANSFERRED/DROPPED → INACTIVE; PROMOTED/REPEATED/REDISTRIBUTED → ACTIVE) |
| Config | `src/shared/config/education-level.ts` (F1) | `EDUCATION_LEVELS` Set + `levelOrder(level)` → 1/2/3 (X/XI/XII), invalid → NaN |
| Repository | `src/main/repositories/enrollment.repository.ts` | `create`, `findById`, `findActiveByMember` (ACTIVE + leftAt null), `countActiveByMember`, `findMemberIdsActiveInYear` (batch), `createManyWithTx`, `countByClass`, `findManyByMember` |
| Service | `src/main/services/enrollment.service.ts` | `enroll`, `close`, `repoint`, `findActiveByMember`, `historyByMember`; pola `runTransaction` + `AppError` |
| DTO | `src/shared/dto/enrollment.ts` | `EnrollmentDTO`, `CreateEnrollmentDTO`, `CloseEnrollmentDTO`, `RepointEnrollmentDTO` |
| IPC | `electron/ipc/enrollment.ipc.ts` | `enrollments:enroll` / `close` / `repoint` / `findActiveByMember` / `historyByMember` |
| Preload | `electron/preload/enrollment.preload.ts` + `index.ts` | `enrollments.*` |
| Typings | `src/renderer/env.d.ts:178-184` | blok `enrollments:` |
| Bootstrap | `electron/main/bootstrap.ts:109,139` | `enrollmentService` ter-wire (`EnrollmentService(enrollmentRepository, newMemberRepository, classRepository)`) |

### 1.3 Lapisan promosi (BELUM ADA sama sekali)

Verifikasi grep/glob (semua False/0 match):

| Layer | File yang dicek | Ada? |
|-------|-----------------|------|
| Service | `src/main/services/promotion-preview.service.ts` | **TIDAK** |
| Service | `src/main/services/promotion.service.ts` | **TIDAK** |
| Repository | `src/main/repositories/promotion.repository.ts` | **TIDAK** |
| DTO | `src/shared/dto/promotion.ts` | **TIDAK** |
| IPC | `electron/ipc/promotion.ipc.ts` | **TIDAK** |
| Preload | `electron/preload/promotion.preload.ts` | **TIDAK** |
| Typings | `promotions:*` di `env.d.ts` | **TIDAK** |
| Bootstrap | `promotionService` di `Container` | **TIDAK** |
| UI | `*.tsx` memuat `promotion` | **TIDAK** (grep 0 match) |

Glob `*promotion*` di seluruh repo → **0 file**. Grep `PromotionRun|PromotionRunItem` hanya muncul di `wo2_f2a_smoke/smoke.ts` (uji schema). Grep `PromotionPreviewDTO|decide(` → 0. `src/pages/master/` hanya berisi halaman AY/Curriculum/Class/Author/Category/Publisher.

### 1.4 Status implementasi prasyarat promosi (RFC §7)

| Prasyarat | WO | Status |
|-----------|----|--------|
| Tahun ajaran baru dibuat + tepat satu `isActive` | WO-4 AY-1a (guard) + WO-5 AY-2 (UI) | DONE |
| `EducationLevel` terdefinisi (X/XI/XII + order) | WO-1 F1 | DONE |
| Fondasi enrollment (repo/service + satu-ACTIVE guard) | WO-13 E-1 | DONE |
| Kelas per tahun + immutability + clone ke tahun baru | WO-7 CL-1, WO-8 CL-2a, WO-9 CL-2b | DONE |
| Import tahunan berbasis enrollment (perlu — tapi bukan prasyarat P-1) | WO-17/18/19/20 MI-1..4 | DONE |

---

## 2. Files Impact Analysis

### 2.1 File yang akan DIBUAT oleh WO P-1 (estimasi, dari WBS WO-21)

| File baru | Isi |
|-----------|-----|
| `src/main/services/promotion-preview.service.ts` | `PromotionPreviewService` — read-only; `decide(item)` murni (deterministik); `preview(...)` → `PromotionPreviewDTO` |
| `src/shared/dto/promotion.ts` | `PromotionPreviewDTO` (mode + counts + items) + tipe pendukung (`PromotionPreviewItem`, `PromotionDecision`/outcome) |

### 2.2 File yang akan DIMODIFIKASI oleh WO P-1

**Per WBS WO-21: tidak ada.** P-1 adalah WO pure-service (`decide` murni + preview read-only). Flow WBS: **Service → Testing → PO Review** — layer Repository/IPC/Preload/UI = **N/A** (harus dinyatakan eksplisit di laporan implementasi).

Pengecualian yang mungkin (diputuskan saat implementasi, tetap tanpa menyentuh IPC/Preload):
- `src/shared/config/academic-status.ts` — hanya bila perlu helper outcome baru (mis. `isPromotionOutcome`); saat ini `ACADEMIC_STATUS` sudah mencakup semua outcome yang dibutuhkan `decide`.

### 2.3 File yang TIDAK boleh disentuh P-1 (batas scope)

Schema, migration, seluruh repository, IPC, preload, env.d.ts, bootstrap, UI, `Member.classId`, `Member.status` (sync = E-3, bukan P-1), EnrollmentService (E-1 sudah selesai dan disetujui).

---

## 3. Dependency Analysis

### 3.1 Dependensi P-1 (semua SUDAH tersedia)

| Dependensi | Sumber | Status |
|------------|--------|--------|
| **E-1** — `EnrollmentService`/`EnrollmentRepository` | `src/main/services/enrollment.service.ts` + `repositories/enrollment.repository.ts` | DONE |
| **F1** — `education-level.ts` (`levelOrder`) | `src/shared/config/education-level.ts` | DONE |
| **F1** — `member-type.ts` (`hasAcademicRecord`) | `src/shared/config/member-type.ts` | DONE |
| **E-1** — `academic-status.ts` | `src/shared/config/academic-status.ts` | DONE |
| `ClassRepository.findByAcademicYear` / `findById` | `src/main/repositories/class.repository.ts:50,26` | DONE |
| `MemberRepository.findById` (nama untuk preview) | `src/main/repositories/member.repository.ts:58` | DONE |

### 3.2 Dependensi yang TIDAK dibutuhkan P-1 (ditangani WO lain)

| WO | Mengapa bukan P-1 |
|----|--------------------|
| P-2 (executor mode A, `promotions:run`) | eksekusi tulis + `PromotionRun`/`PromotionRunItem` + all-or-nothing; butuh E-3 |
| P-3 (Mapping), P-4 (Retry) | targetResolver MAPPING + idempotensi state-based (RFC §9) |
| E-3 (sync `Member.status`) | hanya dibutuhkan saat eksekusi (close enrollment + update status), bukan preview |
| B-1..B-3 (BulkOperationEngine) | generalisasi engine — P-2/P-3 dulu |
| E-2 (cutover `Member.classId`) | independen; guard hapus kelas masih `countByClass` legacy |

---

## 4. Risk Analysis

| # | Risiko | Level | Mitigasi |
|---|--------|-------|----------|
| R1 | **`decide` tidak deterministik** → preview ≠ execute (mengkhianati janji RFC §8 "hasil preview == hasil execute") | TINGGI | `decide(item)` **murni**: semua input (enrollment sumber, kelas sumber, kelas target, levelOrder) dipassing sebagai argumen; tidak membaca DB di dalam `decide`. State dibaca sekali di `preview` dan di-ulang di `execute` (§7.1 step 4) |
| R2 | **Keputusan basi saat execute** (enrollment berubah antara preview & execute) | TINGGI | RFC §7.1: fungsi keputusan **dijalankan ulang di dalam `$transaction`** execute; item yang berubah → ERROR/skip, tidak pernah mengeksekusi keputusan lama |
| R3 | **Pembatasan no-DB-default** (`mode`/`status`/`outcome` tanpa default) → P2011/validation error bila service lupa mengisi | SEDANG | Service WAJIB mengisi `mode`/`status`/`outcome` eksplisit (pola E-1 `CreateEnrollmentData.status` wajib); smoke assert `NOT NULL constraint failed` untuk pemanggilan yang omit |
| R4 | **Tidak ada satu-ACTIVE protection DB** (partial unique tak didukung SQLite) | SEDANG | Guard di Service (`countActiveByMember`), sudah teruji E-1; preview read-only tidak menulis |
| R5 | **`levelOrder` invalid → NaN** (kelas dengan level tak dikenal) | SEDANG | `decide` harus menangani NaN eksplisit → outcome ERROR (bukan silent skip); unit test kelas level invalid |
| R6 | **Guru/Umum ikut ter-preview** (padahal hanya STUDENT yang punya enrollment) | RENDAH | Seleksi sumber = enrollment ACTIVE; hanya member dengan enrollment yang muncul — `hasAcademicRecord` guard bila diperlukan |
| R7 | **Skip layer → laporan kurang auditability** | RENDAH | Laporan implementasi P-1 wajib menyatakan Repository/IPC/Preload/UI = **N/A** (aturan WBS §3) |
| R8 | **Menggabungkan P-1 dengan P-2** (godaan scope creep) | RENDAH | Scope P-1 ketat: preview + decide saja; execute = P-2 |

---

## 5. Architecture Compliance

### 5.1 Kesesuaian dengan RFC

| RFC pasal | Isi | Kesesuaian P-1 |
|-----------|-----|----------------|
| §2.2 | Model `PromotionRun`/`PromotionRunItem` | Model SUDAH ada (F2a); P-1 hanya konsumen baca |
| §7 | 3 mode: AUTOMATIC/MAPPING/BULK_EDIT; prasyarat tahun baru + satu aktif + level terdefinisi | Prasyarat semua DONE (AY-1a/1b/2, F1, E-1, CL-2b). `decide` P-1 menangani keputusan AUTOMATIC; MAPPING/BULK adalah P-3/P-5 (P-1 DTO menyediakan `mode` untuk ketiganya) |
| §7.1 step 1 | **Preview** (read-only) sebelum execute | Inti P-1: `PromotionPreviewService` read-only, tanpa tulis |
| §8 | `PromotionPreviewDTO` = `{mode, counts{promoted,repeated,graduated,redistributed,noTarget,error}, items[{memberId,memberName,sourceClassId,sourceLabel,targetClassId?,targetLabel?,outcome}]}`; hitung = dry-run fungsi yang SAMA dengan execute; preview==execute; re-validate di transaksi | DTO P-1 **harus persis** bentuk ini (counts 6 angka + items expandable untuk noTarget/error). `decide(item)` murni = kunci preview==execute |
| §9 | Retry state-based (eligibilitas = sumber masih ACTIVE), single-flight, forward-only | Bukan P-1 (P-4), tapi `decide` harus mengembalikan outcome yang konsisten dengan state (NO_TARGET/ERROR tetap eligible — mereka masih ACTIVE) |
| §4.3 | Sinkronisasi `Member.status` dari status akademik terminal | Bukan P-1 (E-3/P-2). `decide` hanya menetapkan outcome enrollment, tidak menyentuh `Member.status` |
| §10 | BulkOperationEngine = generalisasi P-2/P-3 | P-1 tidak membangun engine (B-1); `decide` dirancang reusable agar engine bisa memakai fungsi yang sama |

### 5.2 Kesesuaian dengan WBS WO-21

| Kriteria WBS | Nilai |
|--------------|-------|
| Objective | fungsi keputusan deterministik + `PromotionPreviewDTO` (RFC §8) — TEPAT |
| Scope | `PromotionPreviewService` read-only + `decide(item)` murni — TEPAT |
| Dependency | E-1, F1 — keduanya DONE |
| Deliverable | preview service + DTO + unit test |
| Validation | unit: X→XI, XI→XII, XII→GRADUATED, NO_TARGET, repeat; preview==execute; lint+build |
| Exit Criteria | ringkasan §8 lengkap & akurat |
| Flow | Service → Testing → PO Review (layer lain N/A) |
| Kompleksitas | MEDIUM |
| Posisi roadmap | Fase B3, pertama dari rantai P-1 → P-2 → P-3 → P-4 → P-5a → P-5b ∥ B-1… |

---

## 6. Implementation Plan (usulan untuk WO berikutnya, BELUM dieksekusi)

1. **`src/shared/dto/promotion.ts`** — definisikan `PromotionPreviewDTO`, `PromotionPreviewItem`, `PromotionDecision` (tipe outcome union), `PromotionPreviewMode` (`'AUTOMATIC'|'MAPPING'|'BULK_EDIT'`). Persis bentuk RFC §8.
2. **`src/main/services/promotion-preview.service.ts`**:
   - `decide(params: DecisionParams): PromotionDecision` — **murni**, tanpa DB access; input = `{ member, sourceEnrollment, sourceClass, targetClasses (cocok), levelOrder }`; logika: levelOrder+1 → cari kelas target parallel cocok → PROMOTED + target; XII → GRADUATED; tidak ada target → NO_TARGET; sumber REPEATED sama tingkat → REPEATED (jika dalam scope); level invalid/undefined → ERROR.
   - `preview(input): Promise<PromotionPreviewDTO>` — read-only: baca enrollment ACTIVE sumber (per kelas/tahun), resolusi nama member & label kelas, jalankan `decide` per item, agregasi `counts`.
   - Konstruktor menerima `EnrollmentRepository` + `ClassRepository` + `MemberRepository` (pola DI bootstrap E-1). **TIDAK** menulis apa pun.
3. **Unit test** `decide` (murni, tanpa DB): X→XI, XI→XII, XII→GRADUATED, NO_TARGET (belum ada kelas XI parallel), repeat (tingkat sama), level invalid → ERROR, noTarget/error tetap eligible.
4. **Smoke** `preview` pada fresh DB (baca nyata): seeding AY+kelas+enrollment, preview menghasilkan counts benar, dan **preview == execute** dibuktikan hanya pada P-2 (di P-1, buktikan `decide` deterministik: panggil 2× hasil sama).
5. Laporan: implementasi + FINAL_REVIEW + RELEASE_REPORT; nyatakan Repository/IPC/Preload/UI = N/A.

**TIDAK dieksekusi sekarang** (discovery only). Plan di atas menunggu persetujuan PO.

---

## 7. Validation Plan (usulan, menunggu PO)

| Validasi | Detail |
|----------|--------|
| Unit `decide` | X→XI, XI→XII, XII→GRADUATED, NO_TARGET, REPEATED, level invalid→ERROR, deterministik (2× panggil hasil sama) |
| Smoke `preview` (fresh DB temp) | seeding AY aktif + kelas X/XI/XII + enrollment ACTIVE; preview → counts benar; item lengkap (memberId/memberName/sourceLabel/targetLabel/outcome); noTarget/error ada di items; tidak ada efek tulis (count enrollment & run tetap) |
| Regression | smoke E-1..E-4, MI-1..MI-4 tetap PASS (tidak ada perubahan di file mereka) |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `prisma migrate diff` | = no difference (schema tidak disentuh) |

---

## 8. Exit Criteria (WBS WO-21)

1. `PromotionPreviewService` read-only ada; `decide(item)` murni, deterministik.
2. `PromotionPreviewDTO` lengkap & akurat sesuai RFC §8: `mode`, 6 count (`promoted`/`repeated`/`graduated`/`redistributed`/`noTarget`/`error`), `items` dengan semua field.
3. Unit test `decide` mencakup X→XI, XI→XII, XII→GRADUATED, NO_TARGET, repeat — PASS.
4. `preview == execute` dijamin secara desain (fungsi keputusan sama; bukti unit deterministik).
5. `npm run lint` PASS; `npm run build` PASS.
6. Layer Repository/IPC/Preload/UI dinyatakan N/A di laporan.
7. Tidak ada perubahan schema/migration/DB.

---

## Kesimpulan

**Foundation promosi SEPARUH siap:** model DB (`MemberEnrollment`, `PromotionRun`, `PromotionRunItem`) + lapisan enrollment + config akademik + semua prasyarat (AY guard/UI, level config, kelas immutable/clone, import enrollment) **sudah ada dan teruji**. Yang **belum ada sama sekali**: seluruh lapisan promosi (service preview, DTO, `decide`, dan nanti executor/IPC/UI).

WO P-1 adalah fondasi logika keputusan: `PromotionPreviewService` read-only + `decide(item)` murni + `PromotionPreviewDTO` (RFC §8), mengikuti flow Service → Testing → PO Review. Semua dependensinya (E-1, F1) selesai — **tidak ada blocker**.

**Status: DISCOVERY COMPLETE — BERHENTI, menunggu review PO** (tidak lanjut ke implementasi P-1 tanpa persetujuan).
