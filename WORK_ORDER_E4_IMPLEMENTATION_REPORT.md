# WORK ORDER E-4 — Enrollment History UI

## Ringkasan

E-4 menyediakan UI riwayat Enrollment per anggota (WBS WO-16 E-4, RFC §6/§14). UI murni
consumer; business rule (status, invariant, ordering) tetap di backend.

**Ammendment (disetujui PO):** tidak ada channel backend untuk mengambil riwayat enrollment
(permukaan `enrollments.*` hanya `enroll/close/repoint/findActiveByMember`; `MemberDTO` hanya
`classInfo`). PO menyetujui **satu channel read-only tambahan** `enrollments:historyByMember`
(minimal Service + Repository + IPC + preload + env.d.ts; DTO reuse `EnrollmentDTO[]`; tanpa
schema/migration/DB). Field `curriculumName` ditambahkan ke `EnrollmentDTO` karena WAJIB
menampilkan Kurikulum (tidak tersedia di DTO sebelumnya).

## Source of Truth

- `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) — §6 (enrollment), §14 (informasi)
- `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) — WO-16 E-4: "API `enrollments:historyByMember` +
  tampilan (tahun, kelas, status, tanggal)", "smoke 2-baris-setahun", exit criteria
  "label historis tak berubah walau rename tahun lain"
- `WORK_ORDER_E1/E2/E3_IMPLEMENTATION_REPORT.md`

## Deliverable

### Backend (read-only — ammendment PO)

| File | Perubahan |
|------|-----------|
| `src/shared/dto/enrollment.ts` | +`curriculumName: string \| null` di `EnrollmentDTO` (aditif; WAJIB Kurikulum) |
| `src/main/repositories/enrollment.repository.ts` | +`findManyByMember(memberId)` — order `[{ enrolledAt: 'desc' }, { createdAt: 'desc' }]`, include `enrollmentInclude` |
| `src/main/services/enrollment.service.ts` | `toDTO` + `curriculumName`; +`historyByMember(memberId)` (404 bila member tak ada → `EnrollmentDTO[]`) |
| `electron/ipc/enrollment.ipc.ts` | +`enrollments:historyByMember` (nama sesuai WBS) |
| `electron/preload/enrollment.preload.ts` | +`enrollments.historyByMember` |
| `src/renderer/env.d.ts` | +entry `historyByMember` |

### Frontend (renderer-only)

| File | Perubahan |
|------|-----------|
| `src/pages/EnrollmentHistoryPage.tsx` | **baru** — header (breadcrumb anggota), tabel riwayat: Tahun Ajaran, Kurikulum, Kelas, Status (badge), Bergabung, Keluar, Catatan; baris detail expandable (Dibuat/Diperbarui); empty & loading state; urut dari backend (terbaru dulu) |
| `src/pages/MemberDetailPage.tsx` | tombol "Riwayat Enrollment" di header → `enrollmentHistoryPath(id)` (entry WBS "di detail anggota") |
| `src/routes/index.tsx` | +route `members/:id/enrollments` |
| `src/utils/navigation.ts` | +`ROUTES.MEMBER_ENROLLMENT_HISTORY` + `enrollmentHistoryPath()` |
| `src/utils/labels.ts` | +blok `ENROLLMENT_HISTORY` (header kolom, label status, detail, empty) |

### Tidak diubah

Schema, Migration, `MemberDTO`, `ClassDTO`, guard/service lain, Bootstrap. **Sidebar tidak
ditambah** — history adalah konteks per-anggota (WBS: "di detail anggota"); item sidebar tanpa
`memberId` tidak bermakna. DTO/IPC hanya di-tambah (tidak ada yang diubah), sesuai ammendment.

## Desain

### 1. Read-only channel `enrollments:historyByMember`
Service memvalidasi member ada (404), lalu repository `findManyByMember` join `class.curriculum`
+ `academicYear` dan urut `enrolledAt desc, createdAt desc` (tie-break repoint). `toDTO` memetakan
semua field WAJIB + `curriculumName`. Tidak ada mutation; guard/transaksi E-1/E-2/E-3 tidak disentuh.

### 2. Exit criteria WBS — "label historis tak berubah walau rename tahun lain"
Setiap baris men-join `academicYear` miliknya sendiri (bukan tahun aktif). Rename tahun lain
tidak mengubah label baris lain; rename tahun milik baris tersebut hanya mengubah barisnya sendiri
(smoke STEP 6 membuktikan keduanya).

### 3. UI
`EnrollmentHistoryPage` memuat member + history paralel (`Promise.all`), menampilkan baris sesuai
urutan backend (terbaru dulu). Status di-render sebagai badge: ACTIVE hijau, terminal abu.
`MemberDetailPage` menyediakan tombol navigasi.

## Validation

### 1. Lint — PASS
`npm run lint` (tsc node + web) bersih.

### 2. Build — PASS
`npm run build`: main **1,749.07 kB** · preload **8.39 kB** · renderer **999.83 kB**
(renderer naik ~12.5 kB dari E-3 — halaman baru; preload naik 0.10 kB — method baru).

### 3. Smoke E-4 — 45/45 PASS (fresh DB)
`wo16_e4_smoke/smoke.ts` pada DB temp (fresh `prisma migrate deploy`, 4 migrations; dibersihkan):
- History kosong → `[]`; member tidak ada → 404.
- Enroll → 1 baris ACTIVE: academicYearName, curriculumName, className, joinedAt (enrolledAt),
  leftAt null, note null — semua tampil benar.
- Close(PROMOTED) → status terminal + leftAt + note tampil; label tahun/kurikulum tak berubah.
- **2-baris-setahun (repoint):** ACTIVE (baru) + REDISTRIBUTED (lama), urutan terbaru dulu
  (enrolledAt desc), tahun sama, kurikulum sama, note redistribusi.
- Multi-tahun: terbaru = tahun A ACTIVE (MERDEKA), lama = tahun B PROMOTED (K13) — urutan lintas
  tahun + kurikulum berbeda benar.
- **Exit criteria:** rename tahun B → baris tahun A identik (JSON deep-equal); baris milik tahun B
  menampilkan nama tahun sendiri yang diperbarui.
- Regression E-1/E-3: enroll kedua ditolak, close non-terminal ditolak, `findActiveByMember`/
  `close` DTO punya `curriculumName`, histori setelah close DROPPED + leftAt + note.

### 4. Regression smoke E-1/E-2/E-3 — PASS
`wo13_e1_smoke` **39/39**, `wo14_e2_smoke` **36/36**, `wo15_e3_smoke` **78/78** di-re-run pada
fresh DB masing-masing (DTO `curriculumName` aditif tidak merusak kontrak lama).

### 5. Migrate diff — no drift
`prisma migrate diff --from-migrations --to-schema-datamodel` = empty migration.

### 6. Smoke UI (grep bundle)
Renderer `out/renderer/assets/index-*.js`: `Riwayat Enrollment`×2, `Bergabung`×1, `Keluar`×2,
`members/:id/enrollments`×2, `historyByMember`×1. Main `out/main/index.js`:
`enrollments:historyByMember`×1. Fitur ter-render.

## Kesimpulan

**READY.** UI riwayat enrollment lengkap (tahun, kurikulum, kelas, status, joined/left, note),
urutan terbaru dulu, entry dari detail anggota. Business rule tetap backend; channel tambahan
read-only disetujui PO.

## Technical Debt / Catatan

- `curriculumName` aditif di `EnrollmentDTO` — semua response enroll/close/repoint/findActiveByMember
  kini menyertakannya; aman (regression E-1/E-2/E-3 PASS).
- "Detail History" direpresentasikan sebagai baris expandable (Dibuat/Diperbarui); note & semua
  field WAJIB sudah tampil di kolom utama.
- Sidebar tidak disentuh (alasan di atas); navigasi via MemberDetailPage.
