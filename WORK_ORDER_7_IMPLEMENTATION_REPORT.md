# WORK_ORDER_7_IMPLEMENTATION_REPORT

**WO-7 — CL-1: Class Immutability Guard (rename = row baru)**
**Status: DONE — READY review PO**
**Tanggal: 2026-08-03**

---

## 1. Ringkasan

Implementasi WO-7 CL-1 sesuai `WO7_DISCOVERY_REPORT.md` (APPROVED) dengan keputusan PO **WBS-strict**:

> Scope hanya: `educationLevel` immutable + `parallel` immutable. **JANGAN** menambah guard untuk `academicYearId`/`curriculumId`.

Guard immutability + validasi level hidup di **`ClassService`** (business rule layer, RFC §13 / WBS §3 Flow: Service → Testing → PO Review). Repository, IPC, Preload, UI, DTO, Schema, Migration **tidak diubah**.

## 2. Deliverable

| Kategori | File | Perubahan |
|----------|------|-----------|
| Source | `src/main/services/class.service.ts` | **MODIFIED** — 2 guard (lihat §3) |
| Test | `wo7_cl1_smoke/smoke.ts` | **BARU** — 16/16 PASS |
| Laporan | `WO7_DISCOVERY_REPORT.md` (APPROVED), `WORK_ORDER_7_IMPLEMENTATION_REPORT.md`, `WO7_FINAL_REVIEW.md`, `WO7_RELEASE_REPORT.md` | **BARU** |
| Docs | `AGENTS.md` | **MODIFIED** — section WO-7 |

## 3. Perubahan Kode

### `src/main/services/class.service.ts`

**1. `create` — validasi & normalisasi level (F1):**
```ts
const educationLevel = input.educationLevel.trim().toUpperCase()
if (!EDUCATION_LEVELS.has(educationLevel)) {
  throw new AppError(400, 'Conflict', `Tingkat pendidikan ${input.educationLevel} tidak valid (X/XI/XII)`)
}
```
- Import baru: `EDUCATION_LEVELS` dari `src/shared/config/education-level` (F1).
- Nilai ternormalisasi dipakai untuk `findDuplicate` dan `repository.create` → mencegah `"x"` vs `"X"` jadi dua baris komposit (menghindari `classAmbiguous` di `MemberClassResolver` yang key-nya uppercase).

**2. `update` — immutability guard (RFC §13):**
```ts
if (input.educationLevel !== undefined || input.parallel !== undefined) {
  throw new AppError(400, 'Conflict',
    `Kelas ${existing.educationLevel} ${existing.parallel} tidak dapat diubah (educationLevel/parallel immutable — buat kelas baru untuk rename)`)
}
```
- Payload `repository.update` kini hanya `academicYearId` / `curriculumId` / `homeroomTeacher` / `isActive`.
- `comboChanged` (cek duplikat saat AY/curriculum berubah) tetap ada — `educationLevel`/`parallel` tidak lagi bisa berubah sehingga tidak perlu di-merge/cek.

## 4. Hasil Smoke — 16/16 PASS (fresh DB)

| # | Skenario | Hasil |
|---|----------|-------|
| 1 | Create level valid `X` | PASS |
| 2 | Create level invalid `IX` → 400 | PASS |
| 3 | Create level kosong `''` → 400 | PASS |
| 4 | Lowercase `" xi "` ternormalisasi → `XI` | PASS |
| 5 | Duplicate komposit (`X MERDEKA 1`) → 400 | PASS |
| 6 | Update `educationLevel` → 400 (immutable) | PASS |
| 7 | `educationLevel` tetap `X` setelah ditolak | PASS |
| 8 | Update `parallel` → 400 (immutable) | PASS |
| 9 | `parallel` tetap `MERDEKA 1` setelah ditolak | PASS |
| 10 | Update `homeroomTeacher` → sukses (regresi) | PASS |
| 11 | Update `isActive` → sukses (regresi) | PASS |
| 12 | `findById` bekerja (regresi) | PASS |
| 13 | `findMany` list 2 kelas (regresi) | PASS |
| 14 | `findMany` search 1 kelas (regresi) | PASS |
| 15 | Delete kelas tanpa anggota → sukses (regresi) | PASS |
| 16 | Delete kelas beranggota → 400 (regresi guard) | PASS |

## 5. Validation (Gate WBS §4) — semua PASS

| # | Check | Hasil |
|---|-------|-------|
| 1 | `npm run lint` | exit 0 (tsc node + web) |
| 2 | `npm run build` | exit 0 — main 1,776.84 kB · preload 7.68 kB · renderer 959.90 kB |
| 3 | Manual test (smoke UAT) | 16/16 PASS fresh DB temp |
| 4 | Documentation | AGENTS.md + 3 laporan; env.d.ts/DTO konsisten (tidak berubah) |
| 5 | PO Approval | menunggu (workflow berhenti di sini) |

## 6. Yang TIDAK dikerjakan (eksplisit)

- **Repository, IPC, Preload, UI, DTO, Schema, Migration** — N/A (keputusan PO WBS-strict).
- Guard `academicYearId`/`curriculumId` — **TIDAK ditambahkan** (di luar scope WO-7).
- Delete guard `Member.classId` legacy → cutover ke `enrollment.count` adalah **WO E-2**, bukan CL-1.
- AcademicYear / Curriculum / MemberEnrollment / Promotion — tidak disentuh.

## 7. Catatan Teknis

- `UpdateClassDTO` **sengaja tidak diubah** — masih menyertakan `educationLevel`/`parallel`; service menolak saat field tersebut dikirim. Ini menjaga kontrak IPC sebelum CL-2a (UI) dibangun.
- Guard hidup di Service, bukan DB/DTO → error mengalir via `AppError` handler IPC yang ada, tanpa perubahan channel.
- Smoke memakai fresh DB temp (`file:C:/Users/hp/AppData/Local/Temp/opencode/...`) dan dibersihkan; DB live dev tidak disentuh.
