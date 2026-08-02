# WORK ORDER 7 — P7C: Fix F-3 Trim & Normalization (COMPLETE)

- **Status:** DONE — menunggu review Product Owner (STOP, tidak lanjut WO berikutnya)
- **Scope:** HANYA F-3 (normalisasi sebelum validasi & pengecekan duplikat). F-4, technical debt, **DTO**, **IPC**, dan **UI** tidak disentuh.
- **Referensi:** `PRODUCTION_READINESS_FIX_PLAN.md` (F-3), `PRODUCTION_READINESS_AUDIT_MEMBER_IMPORT.md`.
- **No commit.**

---

## 1. Objective

Menghilangkan release blocker **F-3**: nilai `fullName`/`NISN`/`Email` tidak dinormalisasi sebelum validasi, sebelum pengecekan duplikat, dan sebelum disimpan — sehingga `" 1234567890 "` vs `"1234567890"` dan `"USER@MAIL.COM "` vs `"user@mail.com"` tidak dianggap sama. Implementasi: **trim Nama, trim NISN, trim Email, lowercase Email** (minimal sesuai WO).

## 2. Files Modified

| File | Perubahan |
|------|-----------|
| `src/shared/utils/member-import-normalization.ts` | **BARU** — helper bersama `normalizeMemberImportRow` / `normalizeMemberImportRows` (trim `fullName`, trim `nisn`, trim+lowercase `email`) |
| `src/main/services/member-import.service.ts` | Normalisasi di titik masuk `previewCheck` **dan** `import` — sebelum `preflight` (validasi + duplicate check) dan sebelum `writePhase`/save |
| `src/components/members/MemberImportDialog.tsx` | `toMemberImportRows` kini melewati `normalizeMemberImportRow` (DTO yang dikirim ke IPC sudah bersih; tanpa mengubah UI) |
| `src/services/MemberPreviewService.ts` | Duplikat email **dalam file** kini case-insensitive (`toEmailKey` = trim + lowercase) |
| `uat_wo7_p7c/trim-normalization.smoke.ts` | Smoke test baru (READ-ONLY, dihapus setelah run) |

**Tidak diubah:** DTO (`MemberImportRowInput` dan seluruh tipe `member.ts`), IPC, preload, `env.d.ts`, UI (tabel preview tetap menampilkan nilai asli parser), config, schema, dependency.

## 3. Root Cause

- Audit F-3: `toMemberImportRows` memakai `String()` mentah — nilai masuk apa adanya ke `previewCheck`/`import`.
- `buildPayload` menyimpan `row.nisn` / `row.email` / `row.fullName` **mentah** → DB menampung data kotor.
- `MemberDuplicateChecker` memang menormalkan sisi *query* (trim NISN, trim+lowercase email), tetapi **tidak** menormalkan nilai yang **disimpan** → import bersih berikutnya ("1234567890") **tidak** mencocokkan baris DB yang tersimpan kotor (" 1234567890 "), sehingga duplikat lolos.
- Duplikat email **dalam file** (renderer `MemberPreviewService`) memakai key `trim` saja → `"USER@MAIL.COM"` vs `"user@mail.com"` tidak dianggap sama → keduanya bisa masuk.

## 4. Normalization Strategy

Satu sumber kebenaran di `src/shared/utils/member-import-normalization.ts` (di-include oleh tsconfig node **dan** web), diterapkan pada **tiga titik** agar mencakup seluruh lapisan:

1. **Backend `MemberImportService`** (authoritative) — `previewCheck` & `import` menormalkan seluruh baris **sebelum** `preflight` (duplicate check + class resolver) dan **sebelum** `buildPayload` disimpan. Ini menjamin perilaku sama siapa pun pemanggilnya (UI atau smoke).
2. **Renderer `MemberImportDialog.toMemberImportRows`** (defense-in-depth) — DTO yang dikirim via IPC sudah ternormalisasi; alamat akar masalah audit secara langsung.
3. **Renderer `MemberPreviewService`** — key duplikat dalam file: NISN `trim`, Email `trim + lowercase`, sehingga preview menandai `" 1234567890 "` ≡ `"1234567890"` dan `"USER@MAIL.COM "` ≡ `"user@mail.com"`.

Ruang lingkup minimal sesuai WO: hanya `fullName`, `nisn`, `email`. Field lain (className/birthPlace/address/phone/birthDate) tidak disentuh; `classResolver` sudah menormalkan kelas secara internal.

## 5. Validation

### 5.1 Smoke — `uat_wo7_p7c/trim-normalization.smoke.ts` (26/26 PASS)
Unit + DB + renderer, pada fresh temp DB (`prisma migrate deploy`, 3 migration).

| # | Kasus | Hasil |
|---|-------|-------|
| U1 | `normalizeMemberImportRow`: trim Nama, trim NISN, trim+lowercase Email | PASS (3/3) |
| U2 | Email `undefined` tetap `undefined`; NISN `''` tetap `''` (tidak berubah semantik) | PASS |
| S3 | Import baris `" 4000001 "`, `"  Test Person  "`, `"  USER@MAIL.COM  "` → sukses; **tersimpan** `4000001` / `Test Person` / `user@mail.com` | PASS (3/3) |
| S4 | Import NISN `"4000001"` (bersih) → **duplikat** `duplicateNisnInDb`, created 0, count tetap 1 → `" 4000001 "` ≡ `"4000001"` | PASS (4/4) |
| S5 | Import email `"user@mail.com"` (bersih) → **duplikat** `duplicateEmailInDb`, created 0, count tetap 1 → `"USER@MAIL.COM "` ≡ `"user@mail.com"` | PASS (4/4) |
| S6 | Baris unik tetap berhasil diimport (tidak over-block) | PASS (3/3) |
| S7 | Duplikat **dalam file** (renderer): `" 1234567890 "` & `"1234567890"` + `"USER@MAIL.COM "` & `"user@mail.com"` → NISN & Email terdeteksi, status DUPLICATE, `canImport=false` | PASS (5/5) |

### 5.2 Regression
- `npm run lint` PASS (tsconfig.node + tsconfig.web).
- `npm run build` PASS (out/main/index.js 1,774.56 kB; renderer `index-ClA9YfRJ.js` 939.58 kB).
- Build artifact smoke + temp DB dihapus setelah run.

## 6. Compatibility

- **DTO & IPC tidak berubah** — kontrak `MemberImportRowInput[]` identik; normalisasi hanya mengubah *nilai*, bukan *bentuk*.
- **UI tidak berubah** — tabel preview tetap menampilkan nilai asli parser; yang berubah hanya logika status duplikat & data yang disimpan.
- **Backward-compatible** — pemanggil lama tanpa normalisasi (mis. jalur import lain) tetap berfungsi karena backend menormalkan sendiri di titik masuk; `MemberDuplicateChecker`/`MemberClassResolver` yang menormalkan internal tetap konsisten.
- Shared helper bisa dipakai dari main dan renderer (keduanya me-include `src/shared`).

## 7. Sisa Gap (di luar scope P7C — untuk review PO)

- **F-4** (MEDIUM UX) progress non-monotonic — direkomendasikan sebagai Technical Debt.
- **B-1** email tidak `@unique` + lookup case-sensitive — tetap terbuka (non-blocker, terpisah dari F-3).
- B-6/B-7/B-8/B-9/B-10, TD-6/TD-7 — non-blocker (detail di fix plan).

## 8. Status

**P7C DONE.** Seluruh release blocker (F-1, F-2, F-3) telah ditutup. Produk siap direkomendasikan **READY WITH TECHNICAL DEBT** sesuai fix plan (menunggu review PO). Tidak ada commit.
