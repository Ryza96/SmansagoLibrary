# WO-11 — AY-1b: Open/Close Academic Year — DISCOVERY REPORT

- **Tanggal:** 2026-08-03
- **Mode:** DISCOVERY ONLY (READ ONLY) — tidak ada perubahan kode/schema/migration/commit
- **Peran:** Project Engineer → keputusan Product Owner
- **Source of Truth:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED)

---

## 1. CURRENT ARCHITECTURE

### 1.1 Model `AcademicYear` (`prisma/schema.prisma`)
```
AcademicYear {
  id        String   @id @default(uuid())
  name      String   @unique
  startDate DateTime
  endDate   DateTime
  isActive  Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  classes, memberEnrollments, promotionRunsFrom, promotionRunsTo
}
```
- **Tidak ada kolom `semester`** — validasi "tanggal/semester" di WBS = validasi rentang tanggal (`startDate ≤ endDate`), bukan field baru.
- `isActive` boolean tunggal; invarian "tepat satu aktif" dijaga di **Service layer** (bukan DB).

### 1.2 Layer eksisting (semua ter-wire)
| Layer | File | Status |
|---|---|---|
| Repository | `src/main/repositories/academic-year.repository.ts` | Ada: `create`, `update`, `createExclusiveActive`, `updateExclusiveActive`, `delete`, `findById`, `findActive`, `findMany`, `existsByName`, `existsById`, `count` |
| Service | `src/main/services/academic-year.service.ts` | CRUD; AY-1a guard (create/update `isActive:true` → exclusive-active) |
| IPC | `electron/ipc/academic-year.ipc.ts` | `academic-years:findMany/findById/create/update/delete` |
| Preload | `electron/preload/academic-year.preload.ts` | `academicYears.*` |
| env.d.ts | `src/renderer/env.d.ts` (blok `academicYears`, line 136) | findMany/findById/create/update/delete |
| UI | `AcademicYearListPage.tsx`, `AcademicYearFormPage.tsx`, `AcademicYearForm.tsx` | CRUD + toggle aktif |
| Bootstrap | `electron/main/bootstrap.ts` | `new AcademicYearService(repo, classRepo)` |

### 1.3 Guard AY-1a (WO-4, sudah berjalan)
- `createExclusiveActive` / `updateExclusiveActive` di repository: `$transaction` — `updateMany(isActive:true → false)` lalu target di-set aktif. Net: hanya target yang aktif; rollback bila target gagal.
- `findActive()` → `findFirst({ where: { isActive: true }, orderBy: { startDate: 'desc' } })`.

---

## 2. FILES IMPACT ANALYSIS

**Scope AY-1b (per WBS: Service → IPC → Testing; Repo/Preload/UI = N/A — repo sudah ada):**

| File | Aksi | Alasan |
|---|---|---|
| `src/main/services/academic-year.service.ts` | **+2 metode** `activate(id)` (Buka) & `deactivate(id)` (Tutup) | Inti operasi eksplisit |
| `electron/ipc/academic-year.ipc.ts` | **+1 channel** `academic-years:activate` | WBS eksplisit: IPC `academic-years:activate` |

**Pertanyaan desain (butuh keputusan PO):**
1. **Apakah Tutup perlu channel IPC sendiri?** WBS hanya menyebut `academic-years:activate`. Opsi: (a) satu channel `activate(id, { active: boolean })`; (b) dua channel `activate`/`deactivate`. **Rekomendasi: (b) dua channel** — lebih eksplisit, aman dari salah-argumen, cocok dengan pola `create`/`delete` terpisah. Penambahan channel `academic-years:deactivate` adalah perluasan minor dari scope WBS (bukan pelanggaran).
2. **Preload/env.d.ts/UI?** WBS menyatakan Preload/UI = N/A (flow Service → IPC → Testing). **Rekomendasi:** ikuti WBS — **tidak** menambah preload/env.d.ts/UI di WO ini; endpoint siap dikonsumsi UI di WO berikutnya. (Perlu konfirmasi PO — lihat §7 keputusan.)

**TIDAK disentuh:** repository (metode eksisting cukup), schema/migration, DTO (`academic.ts` — tidak perlu tipe baru bila channel kedua memakai id+bool), `AcademicYearForm`/List/FormPage, `navigation.ts`, `labels.ts`, routes, sidebar.

---

## 3. DEPENDENCY ANALYSIS

| Dependensi | Arah | Status |
|---|---|---|
| AY-1a guard | AY-1b memakai `updateExclusiveActive` / `createExclusiveActive` | **Ada & teruji** (WO-4, 21/21) |
| `findActive()` | dipakai `MemberClassResolver` (import), service | Ada |
| Class Clone (CL-2b) | hook clone = **sudah ada** (`classes:cloneToYear`, WO-9) | Ada & teruji |
| Class / Curriculum | tidak bergantung AY-1b (kelas per tahun, tidak peduli isActive tahun) | N/A |
| Enrollment / Promotion (Milestone B) | belum dibangun — AY-1b **tidak boleh** menulis/bergantung padanya | N/A |
| Member import (legacy) | memakai `findActive` → tahun nonaktif = `classNotFound` untuk seluruh baris | Dampak: lihat §4 |

**Alur bisnis yang dijawab discovery:**
- **Buka Tahun** = set tahun target `isActive:true` memakai guard exclusive-active. Alur ideal: buat tahun baru (`create` nonaktif) → clone kelas (`classes:cloneToYear`, CL-2b) → **Buka** (`academic-years:activate`).
- **Tutup Tahun** = set tahun target `isActive:false`. Tanpa deaktivasi tahun lain (guard tidak relevan — menonaktifkan tidak menciptakan dua aktif). **Tidak menghapus data**; `Class`/`MemberEnrollment` yang mengacu tahun itu tetap utuh (FK `RESTRICT`).

---

## 4. RISK ANALYSIS

| Risiko | Prob. | Dampak | Mitigasi |
|---|---|---|---|
| **Buka tahun yang sudah nonaktif** | Rendah | Rendah | Guard idempoten: target di-set aktif, tahun lain nonaktif — aman |
| **Tutup tahun yang sudah nonaktif** | Rendah | Rendah | Tolak dengan `AppError` bila `isActive=false` (operasi no-op tak diizinkan) |
| **Tutup tahun aktif → 0 tahun aktif** | Sedang | Sedang | Invarian AY-1a = "≤1 aktif", bukan "selalu 1". **Keputusan PO:** apakah Tutup boleh menyisakan 0 aktif? (lihat §7) |
| **Import anggota saat tidak ada tahun aktif** | Sedang | Sedang | `MemberClassResolver` → `findActive()=null` → seluruh baris `classNotFound`. Perlu dokumentasi/guard UX bila Tutup dipakai tanpa Buka tahun berikutnya |
| Buka tahun → Class clone belum dijalankan | Sedang | Rendah | Buka tidak memerlukan kelas; clone opsional (CL-2b terpisah). Kelas tahun baru tinggal diisi manual/clone |
| Salah argumen pada channel tunggal `activate(id, active)` | Rendah | Rendah | Rekomendasi dua channel → mustahil salah |
| Tahun baru dibuka tapi `startDate > endDate` | Rendah | Rendah | Validasi tanggal di service (`startDate ≤ endDate`) pada create/update (sudah ada di UI; tambahkan guard service bila perlu) |
| Drift env.d.ts/preload | Rendah | Rendah | Preload/UI N/A → tidak ada drift di WO ini |

---

## 5. ARCHITECTURE COMPLIANCE

| Aturan RFC/WBS | Kepatuhan |
|---|---|
| RFC §2.4: `isActive` diubah **hanya** lewat operasi Buka/Tutup | **Perlu dipastikan:** saat ini `update(isActive:true)` juga mengubah status (jalan lama AY-2). AY-1b **menambah** jalur eksplisit; apakah `update` tetap dibiarkan sebagai backward-compat atau ditutup? → **keputusan PO §7** |
| RFC §7 prasyarat promosi: "tepat satu `isActive`" | Buka menjamin ≤1 aktif; promosi Milestone B membaca `findActive()` |
| WBS AY-1b Flow: Service → IPC → Testing (Repo/Preload/UI = N/A) | Service+IPC diimplementasi; repo tidak diubah; preload/UI N/A |
| WBS exit criteria: "transisi terkontrol, selalu 1 aktif" | Dipenuhi selama operasi Buka; Tutup menyisakan 0 aktif harus didokumentasikan |
| Layering (Repository → Service → IPC) | Service murni business rule; repository tetap transaksional |
| Tidak menyentuh Curriculum/Class/Clone/Enrollment/Promotion/Schema/Migration | **PASS** — AY-1b hanya menambah 2 metode service + 1-2 channel IPC |

---

## 6. IMPLEMENTATION PLAN (usulan, eksekusi di WO berikutnya)

1. **`src/main/services/academic-year.service.ts`**
   - `async activate(id: string): Promise<AcademicYearDTO>`
     - `findById` → 404 bila tidak ada.
     - Reuse `repository.updateExclusiveActive(id, { isActive: true })` (guard AY-1a).
     - Return `toDTO`.
   - `async deactivate(id: string): Promise<AcademicYearDTO>`
     - `findById` → 404 bila tidak ada; `AppError(400)` bila sudah nonaktif.
     - `repository.update(id, { isActive: false })` (tidak perlu transaksi exclusive — menonaktifkan aman).
     - Return `toDTO`.
2. **`electron/ipc/academic-year.ipc.ts`**
   - `academic-years:activate` → `service.activate(id)`
   - (opsional, rekomendasi) `academic-years:deactivate` → `service.deactivate(id)`
3. **TIDAK:** repo, DTO, preload, env.d.ts, UI, schema, migration, bootstrap (service sudah ter-wire).

---

## 7. KEPUTUSAN PO YANG DIPERLUKAN

| # | Pertanyaan | Opsi | Rekomendasi |
|---|---|---|---|
| K1 | Channel IPC | (a) satu `activate(id,{active})` · (b) dua channel `activate`+`deactivate` | **(b) dua channel** |
| K2 | Bolehkah Tutup menyisakan **0 tahun aktif**? | (a) boleh (invarian "≤1 aktif" AY-1a) · (b) tolak bila 0 aktif akan terjadi (paksa Buka tahun lain dulu) | **(a) boleh**, tapi dokumentasikan dampak import (`classNotFound`) |
| K3 | Apakah `update(isActive)` lama (jalur AY-2 UI) **tetap dibiarkan**? | (a) biarkan (backward-compat) · (b) tutup — tolak perubahan `isActive` via `update`, wajib lewat Buka/Tutup | **(a) biarkan** — AY-2 UI masih memakai `update(isActive:true)`; menutupnya memaksa refactor UI di luar scope AY-1b |
| K4 | Preload/env.d.ts/UI di WO ini? | (a) ikuti WBS (N/A) · (b) tambahkan preload+env.d.ts agar siap UI | **(a) ikuti WBS** |

---

## 8. VALIDATION PLAN (usulan)

| # | Check | Metode |
|---|---|---|
| 1 | `npm run lint` PASS | tsc node + web |
| 2 | `npm run build` PASS | main/preload/renderer |
| 3 | Smoke fresh DB (pola wo4): activate tahun B → A nonaktif, count aktif = 1 | `wo11_ay1b_smoke/smoke.ts` |
| 4 | activate id tidak ada → 404 | smoke |
| 5 | deactivate tahun aktif → isActive false; tahun lain tak terganggu | smoke |
| 6 | deactivate tahun nonaktif → 400 | smoke |
| 7 | (jika K2=b) tutup yang mengarah 0 aktif → ditolak | smoke |
| 8 | Regresi CRUD (create/update/delete) + guard AY-1a tetap | smoke |
| 9 | Grep channel IPC ter-render di bundle main | `npm run build` + grep |
| 10 | `git status` — hanya file AY-1b yang berubah | sebelum commit |

---

## 9. EXIT CRITERIA

1. Operasi **Buka Tahun** (`activate`) tersedia via service + IPC; aktivasi menonaktifkan tahun lain (guard AY-1a), `findActive()` ≤ 1.
2. Operasi **Tutup Tahun** (`deactivate`) tersedia; tahun target nonaktif; id nonaktif / tidak ada ditolak.
3. Invarian "transisi terkontrol, selalu ≤1 aktif" teruji via smoke fresh DB.
4. Tidak ada perubahan schema/migration; Curriculum/Class/Clone/Enrollment/Promotion tidak tersentuh.
5. `npm run lint` + `npm run build` PASS; dokumentasi (AGENTS.md/laporan) konsisten.

---

## VERDICT

**READY FOR IMPLEMENTATION**

Alasan:
1. **Semua prasyarat tersedia:** guard AY-1a (`updateExclusiveActive`), repository lengkap, bootstrap ter-wire, pola IPC/UI eksisting.
2. **Scope minimal & tidak menyentuh modul lain:** 2 metode service + 1-2 channel IPC; repo/UI/preload/schema/migration N/A.
3. **Tanpa migration:** `isActive` sudah ada; tidak perlu skema baru.
4. **Risiko rendah & terdokumentasi:** satu-satunya keputusan bernuansa (K2: 0 tahun aktif; K3: jalur `update` lama) membutuhkan konfirmasi PO — bukan blocker desain.
5. **WBS Flow AY-1b** (Service → IPC → Testing) persis dengan usulan implementasi.

**Catatan:** sebelum implementasi, mohon konfirmasi PO untuk K1–K4 (§7). Tanpa konfirmasi, implementasi memakai nilai rekomendasi.
