# WO — Member Manual Entry: Fix Academic Year State Commit (COMPLETE — READY review PO)

## IMPLEMENTATION

Bug: pada form entri anggota siswa manual, section "Penempatan Kelas"
(`src/components/members/MemberClassSection.tsx`) mengikat `<select>` Tahun Ajaran ke
**tahun ajaran aktif yang dikomit ke state**, bukan ke pilihan user. Ketika user
memilih tahun ajaran yang bukan aktif, nilai yang tersimpan tetap tahun aktif —
seluruh pemilihan user di-*overwrite*.

Fix (`MemberClassSection.tsx`):
- `<select>` kini `value={academicYearId}` — **state-bound** (bukan `activeYear.id`).
- `useEffect` hanya meng-commit tahun aktif bila belum ada pilihan:
  `setAcademicYearId((prev) => prev || active.id)` — tahun aktif menjadi *default*,
  bukan nilai yang memaksa menimpa pilihan user.
- `onChange` tahun ajaran: `setAcademicYearId(e.target.value)` + `setClassId('')`
  (reset kelas saat tahun berubah).
- Filter kelas tetap mengikuti pilihan user: `classesOfYear = classes.filter(c => c.academicYearId === defaultYear)`
  dengan `defaultYear = academicYearId || activeYear?.id || ''`.

`MemberForm.tsx` (host):
- state `academicYearId`/`classId` diangkat ke form (untuk payload create).
- `validate()`: mode edit tidak memvalidasi AY/kelas; mode create siswa wajib keduanya.
- payload create: `academicYearId`/`classId` dikirim hanya saat `isStudent`.
- `MemberClassSection` dirender hanya pada mode create.

## ROOT CAUSE

State yang di-commit adalah `activeYear.id` (nilai turunan), sehingga pilihan user
di select tidak pernah menjadi sumber kebenaran; efek sampingnya, `classId` yang
valid untuk tahun pilihan user di-reset/ditimpa.

## TEST RESULTS

- `npm run lint` — PASS.
- `npm run build` — PASS.
- Smoke `member_manual_entry_smoke` (baru, fresh DB) — **24 PASS, 0 FAIL**:
  - create siswa manual `{academicYearId, classId}` → Member + Enrollment ACTIVE
    (SSOT kelas), `classInfo` dari enrollment, `memberNumber` ter-generate.
  - tanpa `academicYearId` → ditolak; tanpa `classId` → ditolak; classId tidak ada →
    ditolak; kelas tahun lain → ditolak.
  - guru/umum tanpa AY/kelas → sukses tanpa enrollment.
  - atomicity: tidak ada partial write dari kasus ditolak (member=3, enrollment=1).
  - invarian satu-ACTIVE + guard borrow eligibility (lulus) + first-borrow activation.

## REGRESSION (data validation, fresh DB per suite)

| Suite | Hasil |
|-------|-------|
| `wo14_e2_smoke` | 40 PASS, 0 FAIL |
| `wo15_e3_smoke` | 71 PASS, 0 FAIL |
| `member_class_display_smoke` | 18 PASS, 0 FAIL |

Total **153 PASS, 0 FAIL**.

`wo14_e2` diperbarui: STEP 4 kini create siswa manual → Member + Enrollment ACTIVE
(menggantikan assert "create tidak lagi menulis classId"); konstruktor
`MemberService` kini 4-arg (`classRepository`). `wo15_e3`/`member_class_display`
hanya update konstruktor. `prisma migrate diff` = "This is an empty migration."

## MANUAL UI TEST (WAJIB, runtime Electron)

1. Anggota → Siswa → Tambah → tipe anggota **Siswa**.
2. Blok "Penempatan Kelas" muncul; Tahun Ajaran default = tahun aktif.
3. Ganti Tahun Ajaran ke tahun lain → daftar Kelas ter-filter ulang, kelas ter-reset.
4. Simpan → anggota dibuat + enrollment ACTIVE pada (tahun, kelas) yang **dipilih user**.
5. Detail anggota: kolom Kelas menampilkan kelas pilihan (SSOT enrollment).

## GIT STATUS

- Modified: `electron/main/bootstrap.ts`, `member_class_display_smoke/smoke.ts`,
  `src/components/members/MemberForm.tsx`, `src/main/repositories/member.repository.ts`,
  `src/main/services/member.service.ts`, `src/shared/dto/member.ts`,
  `src/utils/labels.ts`, `wo14_e2_smoke/smoke.ts`, `wo15_e3_smoke/smoke.ts`.
- Untracked: `member_manual_entry_smoke/`, `src/components/members/MemberClassSection.tsx`.
- `migration_bootstrap` (HEAD `884c50f`) tidak disentuh; 7 migration tetap.

## FINAL VERDICT

Fix benar dan terisolasi: select kini state-bound, default tahun aktif tidak lagi
menimpa pilihan user, kelas selalu konsisten dengan tahun terpilih. Backend
(member.service create siswa manual → enrollment) tidak diubah pada WO ini dan
sudah diuji terpisah (153 PASS). Belum di-commit — menunggu review PO.
