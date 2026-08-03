# WORK ORDER 11 — IMPLEMENTATION REPORT (AY-1b Open/Close Academic Year)

- **WO:** WO-11 AY-1b — Operasi eksplisit Buka/Tutup Tahun Ajaran
- **Status:** **IMPLEMENTED — READY review PO**
- **Source of Truth:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) + `WO11_DISCOVERY_REPORT.md` (verdict READY FOR IMPLEMENTATION, disetujui PO)

## 1. Keputusan PO (APPROVED)
| # | Keputusan | Implementasi |
|---|-----------|--------------|
| K1 | DUA channel IPC: `academic-years:activate` + `academic-years:deactivate` | Dua handler terpisah di `academic-year.ipc.ts` |
| K2 | Sistem HARUS selalu tepat SATU tahun aktif; menutup satu-satunya tahun aktif DITOLAK; perpindahan via Activate tahun baru (Exclusive Active Guard AY-1a) | `deactivate()` menolak bila target = satu-satunya tahun aktif; `activate()` memakai `updateExclusiveActive` |
| K3 | `update()` tidak boleh lagi mengubah `isActive`; hanya `activate()`/`deactivate()` | Guard di `update()` → AppError 400 |
| K4 | Ikuti WBS: JANGAN ubah Preload / env.d.ts / UI | Tidak disentuh |

## 2. Ruang Lingkup
**Diubah:**
- `src/main/services/academic-year.service.ts` — +`activate(id)`, +`deactivate(id)`, modifikasi `update()` (K3 guard)
- `electron/ipc/academic-year.ipc.ts` — +`academic-years:activate`, +`academic-years:deactivate`

**TIDAK diubah (sesuai scope):** Repository, Schema, Migration, Curriculum, Class, Clone Class, Enrollment, Promotion, Preload, env.d.ts, UI, DTO, bootstrap.

## 3. Detail Implementasi

### 3.1 `AcademicYearService.activate(id)`
```
findById(id) → 404 bila tidak ada
updateExclusiveActive(id, { isActive: true })   // Exclusive Active Guard AY-1a
```
- Menonaktifkan seluruh tahun aktif lain + mengaktifkan target dalam satu transaksi → net selalu tepat 1 aktif.
- Idempoten: mengaktifkan tahun yang sudah aktif = no-op sukses (guard tetap menjaga ≤1).

### 3.2 `AcademicYearService.deactivate(id)`
```
findById(id) → 404 bila tidak ada
existing.isActive == false  → AppError 400 "sudah tidak aktif"
active = findActive()
!active || active.id == id → AppError 400 "satu-satunya tahun aktif. Aktifkan tahun baru terlebih dahulu untuk perpindahan tahun"
update(id, { isActive: false })
```
- K2 terpenuhi: menutup satu-satunya tahun aktif **selalu ditolak**; tidak pernah ada kondisi 0 tahun aktif.
- Defensif: bila (abnormal) ada >1 aktif, deactivate salah satu → tersisa ≥1 (diverifikasi smoke STEP 15 via raw SQL).

### 3.3 `AcademicYearService.update(id, input)` — K3 guard
```
bila input.isActive !== undefined && input.isActive !== existing.isActive
  → AppError 400 "Status aktif Tahun Ajaran hanya dapat diubah melalui operasi Buka/Tutup Tahun (activate/deactivate)"
```
- `isActive` dihapus dari payload update → `update` tidak lagi menembus `updateExclusiveActive` (jalur lama AY-2 UI yang mengubah status lewat form kini ditolak).
- Nilai sama (no-op) tetap diizinkan → form edit yang mengirim `isActive` tanpa perubahan tidak gagal.

## 4. Validation Gate
| Check | Hasil |
|-------|-------|
| `npm run lint` (tsc node + web) | **PASS** |
| `npm run build` | **PASS** — main 1,780.16 kB · preload 7.84 kB · renderer 985.76 kB |
| Smoke fresh DB (`wo11_ay1b_smoke/smoke.ts`) | **40/40 PASS** |
| Grep bundle main `academic-years:activate` / `academic-years:deactivate` | **ter-render** (True) |
| `prisma migrate deploy` fresh DB | PASS (4 migrations, tidak ada migration baru) |

## 5. Smoke Test Matrix (40 checks, fresh DB)
| # | Scenario | Hasil |
|---|----------|-------|
| 1 | Create tahun pertama aktif → count aktif = 1 | PASS |
| 2 | Create tahun nonaktif → count tetap 1, A tetap aktif | PASS |
| 3 | **Activate B** → A nonaktif, B aktif, count 1, `findActive`=B | PASS |
| 4 | **Deactivate satu-satunya tahun aktif** → ditolak 400 | PASS |
| 5 | **Activate C** (tahun baru) → B nonaktif, C aktif, count 1 | PASS |
| 6 | Deactivate tahun sudah tidak aktif → ditolak 400 | PASS |
| 7 | Deactivate satu-satunya tahun aktif (C) → ditolak 400 | PASS |
| 8 | **Update isActive BERUBAH (true/false) → ditolak 400 (K3)** | PASS |
| 9 | Update isActive SAMA → diizinkan (no-op), count 1 | PASS |
| 10 | Update normal tanpa isActive → regresi, C tetap aktif | PASS |
| 11 | Update nama duplikat → ditolak 400 (regresi) | PASS |
| 12 | Update id tidak ada → 404 (regresi) | PASS |
| 13 | Activate/Deactivate id tidak ada → 404 | PASS |
| 14 | Activate idempotent (sudah aktif) → sukses, count 1 | PASS |
| 15 | Defensif: 2 aktif (raw SQL) → deactivate salah satu → tersisa 1 | PASS |
| 16 | Create nama duplikat → ditolak 400 (regresi) | PASS |
| 17 | Assert akhir: tepat 1 aktif, `findActive` = C | PASS |

## 6. File yang Terkena
```
M src/main/services/academic-year.service.ts
M electron/ipc/academic-year.ipc.ts
A wo11_ay1b_smoke/smoke.ts
A WO11_DISCOVERY_REPORT.md        (fase discovery, WO-11)
A WORK_ORDER_11_IMPLEMENTATION_REPORT.md
A WO11_FINAL_REVIEW.md
A WO11_RELEASE_REPORT.md
```

## 7. Catatan
- Perpindahan tahun resmi: **Buka Tahun Baru** (`activate`) → otomatis menutup tahun lama (guard exclusive). Menutup manual tahun aktif **selalu ditolak** — sesuai K2.
- UI AY-2 (form toggle aktif) kini akan ditolak oleh service untuk perubahan status (K3) — UI rewiring ke `activate`/`deactivate` adalah WO terpisah (WBS UI = N/A untuk AY-1b). Tidak ada perubahan perilaku lain.
- Tidak ada migration/schema baru → tidak perlu deploy ulang DB selain yang sudah ada.
