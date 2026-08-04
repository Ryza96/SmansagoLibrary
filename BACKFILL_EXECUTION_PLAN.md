# BACKFILL_EXECUTION_PLAN

**MODE:** DISCOVERY + EXECUTION PLAN — BELUM IMPLEMENTASI.
**Tanggal:** 2026-08-04
**Status:** Menunggu approval Product Owner. Script TIDAK dijalankan, database TIDAK diubah.
**Sumber:** Audit kode `scripts/backfill-member-enrollment.ts` + data read-only DB dev `prisma/aplibrary.db`.

---

## Konteks

WO sebelumnya menyimpulkan: 395/395 siswa punya `Member.classId` (legacy), **0 baris `MemberEnrollment`** di seluruh DB. `scripts/backfill-member-enrollment.ts` (WO-3 F2b) sudah di-commit tetapi **belum pernah dieksekusi**. WO ini = audit penuh script + rencana eksekusi produksi.

---

## 1. Apakah script benar-benar idempotent? — BUKTI

**Jawaban: Ya, idempotent untuk eksekusi berurutan (sequential).** Bukti dari kode:

**Skip-check (baris 35–41):**
```ts
const existingActive = await prisma.memberEnrollment.findFirst({
  where: { memberId: member.id, status: 'ACTIVE', leftAt: null }
})
if (existingActive) {
  result.skippedAlreadyActive += 1
  continue
}
```

**Baris yang dibuat (baris 52–57):**
```ts
toCreate.push({
  memberId: member.id,
  classId: member.classId as string,
  academicYearId: member.class.academicYearId,
  status: 'ACTIVE'
})
```

Kesimpulan idempotensi:
- Predikat skip = `status='ACTIVE' AND leftAt=null`. Baris yang dibuat script **persis** memenuhi predikat ini (status `'ACTIVE'`, `leftAt` tidak diset → `null`).
- Run ke-1: tidak ada ACTIVE → semua 395 dibuat.
- Run ke-2: `findFirst` menemukan ACTIVE hasil run-1 → 395 skip (`skippedAlreadyActive=395`), 0 dibuat.
- **Dua run berurutan menghasilkan state yang identik → idempotent.**

**Batasan idempotensi (wajib dicatat, bukan blokir):**
| Batasan | Detail | Dampak |
|---------|--------|--------|
| Race concurrent | Skip-check di LUAR transaksi (baris 35), dan `MemberEnrollment` **tidak punya unique constraint** pada `(memberId, academicYearId)` (schema: hanya `@@index`). | Dua proses berjalan PARALEL bisa dobel-create. → Jalankan SATU proses saja. |
| Hanya cek ACTIVE | Enrollment non-ACTIVE (mis. PROMOTED/GRADUATED tahun lama) TIDAK menghalangi pembuatan ACTIVE baru. | Perilaku by-design (re-enrollment tahunan), bukan bug. |
| ACTIVE di tahun lain | Member yang SUDAH punya ACTIVE di tahun mana pun (mis. hasil import) akan di-`skip` — enrollment berbasis classId tidak dibuat. | By-design: tidak menimpa data yang sudah ada. |

---

## 2. Prediksi hasil terhadap 395 siswa

Fakta data (diukur read-only terhadap DB saat ini):

| Metrik | Nilai |
|--------|-------|
| Member dengan `classId` NOT NULL | 395 |
| Distinct classId | 13 |
| Class yang resolve | **13/13** |
| **Orphan (classId tidak resolve)** | **0** |
| Enrollment ACTIVE yang sudah ada | 0 |
| Enrollment baris mana pun | 0 |

Karena 0 orphan dan 0 ACTIVE existing, **seluruh 395 akan dibuat**:

```
membersWithClassId  = 395
enrollmentsCreated  = 395
skippedAlreadyActive = 0
orphanMembers       = []
```

Setiap enrollment yang dibuat: `status='ACTIVE'`, `leftAt=null`, `academicYearId` = milik kelas (`class.academicYearId`), semuanya Tahun Ajaran 2026/2027.

---

## 3. Apakah script mengubah `Member.classId`?

**TIDAK. Hanya membaca.**

Bukti kode — seluruh akses ke tabel `Member` pada script:
- `prisma.member.findMany({ where: { classId: { not: null } }, include: { class: true } })` (baris 20–23) → **read only**.
- Akses `member.classId` (baris 24, 48, 54) → **membaca** field untuk dipakai di enrollment.
- **TIDAK ada** `prisma.member.update` / `updateMany` / `create` di seluruh script → kolom `classId` tetap tidak tersentuh.

---

## 4. Apakah script mengubah `Member.status`?

**TIDAK.** Tidak ada satu pun operasi tulis ke tabel `Member`.

Konsekuensi penting (dokumentasi, bukan keputusan script):
- Setelah backfill: siswa punya **Enrollment ACTIVE** tetapi **`Member.status` tetap `INACTIVE`** (395/395 saat ini INACTIVE).
- **Borrow eligibility TIDAK terdampak** — sejak IT-1 HOTFIX, eligibility siswa = enrollment ACTIVE (`borrow.service.ts:148`), bukan `Member.status`. Peminjaman akan berfungsi.
- Namun UI member (list/detail) akan menampilkan status `INACTIVE` untuk siswa yang enrollment-nya ACTIVE — **inkonsistensi tampilan yang perlu keputusan PO** (kemungkinan WO lanjutan: sinkronisasi `Member.status=ACTIVE` untuk siswa dengan enrollment ACTIVE; E-3 saat ini hanya menyinkronkan saat close terminal).

---

## 5. Apakah script memicu Promotion atau Enrollment lifecycle?

**TIDAK.** Script adalah **data write langsung**, melewati seluruh service layer.

Bukti:
- Tulis = `runTransaction(prisma, (tx) => tx.memberEnrollment.createMany({ data: toCreate }))` (baris 60–65). `runTransaction` hanyalah wrapper `prisma.$transaction` (`src/main/repositories/base/transaction.ts:18`).
- **Tidak memanggil** `EnrollmentService.enroll` / `close` / `repoint`, `PromotionPreviewService`, `PromotionExecuteService`, `PromotionRun`/`PromotionRunItem` — tidak ada.
- Tidak ada event/hook yang dipicu; tidak ada `MemberEnrollment.createdAt` dihitung manual (default `now()`).
- Konsekuensi: validasi service (mis. guard "kelas milik tahun", AppError) TIDAK ikut dijalankan — tetapi data yang ditulis valid karena diambil langsung dari relasi `member.class` (classId → academicYearId konsisten).

---

## 6. Bukti aman dijalankan lebih dari sekali (dari kode)

```
Run ke-1
  findMany → 395 member (classId NOT NULL)
  loop per member: findFirst(ACTIVE) → TIDAK ada → toCreate.push (395)
  createMany(395) → commit
  result: enrollmentsCreated=395, skippedAlreadyActive=0

Run ke-2
  findMany → 395 member (classId NOT NULL)
  loop per member: findFirst(ACTIVE) → ADA (dari run-1) → skip
  result: enrollmentsCreated=0, skippedAlreadyActive=395, orphanMembers=[]

State akhir kedua run: IDENTIK (395 ACTIVE enrollment, tidak ada duplikat).
```

- Satu transaksi `createMany` → jika gagal di tengah, **rollback penuh** (0 baris tersimpan), tidak ada partial.
- Satu-satunya bahaya = **dua proses berjalan bersamaan** (karena check di luar tx + tanpa unique constraint). Syarat operasional: **satu proses, berurutan**.

---

## 7. EXECUTION PLAN — PRODUCTION

### 7.1 Prerequisite

- [ ] **Approval PO** untuk menjalankan backfill (WO ini menunggu approval).
- [ ] Verifikasi environment target: nilai `DATABASE_URL` mengarah ke DB produksi yang benar (bukan dev/live dev `prisma/aplibrary.db` tanpa sadar).
- [ ] Pastikan **skema sudah di-deploy** (tabel `MemberEnrollment` ada; `prisma migrate status` hijau / `migrate deploy` sudah dijalankan untuk migrasi `20260803_wo2_f2a_master_data_akademik`).
- [ ] **Aplikasi di-STOP** (Electron/dev server tidak berjalan) agar: (a) tidak ada tulis konkuren, (b) file engine Prisma tidak terkunci (pelajaran EPERM WO-2 F2a).
- [ ] **Preflight read-only** (ulangi audit sebelum eksekusi, karena data bisa berubah):
      - `SELECT COUNT(*) FROM Member` WHERE classId IS NOT NULL → harapkan 395.
      - jumlah class yang dirujuk semua resolve → harapkan 0 orphan.
      - `SELECT COUNT(*) FROM MemberEnrollment` → harapkan 0 (atau catat existing ACTIVE).
- [ ] Siapkan tooling runtime: Node.js tersedia; `@prisma/client` ter-generate di `node_modules` (jalankan `npx prisma generate` jika perlu, dengan aplikasi mati).

### 7.2 Backup

- [ ] **Wajib**: backup DB SQLite **3 file** bila memakai WAL mode (`-wal`, `-shm`):
      - `prisma/aplibrary.db`, `prisma/aplibrary.db-wal`, `prisma/aplibrary.db-shm`
- [ ] Salin ke folder backup ber-timestamp, mis. `backup/backfill-20260804/<file>` (jangan kompres file DB saat masih ada app membaca).
- [ ] Alternatif yang lebih aman (opsional): `sqlite3 prisma/aplibrary.db ".backup backup/backfill-20260804/aplibrary.db"` (backup konsisten tanpa app berjalan).
- [ ] Verifikasi backup: `PRAGMA integrity_check` pada hasil backup → `ok`.

### 7.3 Execution

```powershell
# 1) (dari repo) compile script + dependency transaction.ts
npx tsc --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --outDir <tmp-out> scripts/backfill-member-enrollment.ts

# 2) arahkan ke DB PRODUKSI (path absolute)
$env:DATABASE_URL = "file:C:/<path>/aplibrary.db"

# 3) jalankan — SATU proses, TUNGGU selesai
node <tmp-out>/scripts/backfill-member-enrollment.js
```

Ekspektasi output (logika baris 74–89):
```
=== BACKFILL RECONCILIATION ===
membersWithClassId: 395
enrollmentsCreated: 395
skippedAlreadyActive: 0
orphanMembers: 0
totalEnrollments: 395
=== DONE ===
```

Catatan eksekusi:
- **Satu proses saja** (lihat batasan idempotensi §1 & §6).
- Transaksi `createMany` → semua-atau-tidak; bila keluar error, tidak ada baris tersisa.
- JANGAN mengubah `Member.status`/`Member.classId` di langkah ini (di luar scope script).

### 7.4 Validation

- [ ] `SELECT COUNT(*) FROM MemberEnrollment` = **395**.
- [ ] `SELECT COUNT(*) FROM MemberEnrollment WHERE status='ACTIVE' AND leftAt IS NULL` = **395**.
- [ ] Invarian satu-ACTIVE: `SELECT memberId, COUNT(*) FROM MemberEnrollment WHERE status='ACTIVE' AND leftAt IS NULL GROUP BY memberId HAVING COUNT(*) > 1` → **0 baris**.
- [ ] Korespondensi classId ↔ enrollment: untuk tiap member, `academicYearId` enrollment == `academicYearId` kelas yang dirujuk `classId`.
- [ ] Per-baris konsisten: `status` hanya dari set ACADEMIC (ACTIVE), `leftAt` null.
- [ ] `Member.classId` & `Member.status` **tidak berubah** (bandingkan snapshot preflight) — semua tetap INACTIVE (dokumentasi §4).
- [ ] **UAT fungsional (sampling):** buka UI Peminjaman → pilih 2–3 siswa (mis. S-000140 Finza) → create borrow harus lolos guard enrollment (tidak lagi "tidak memiliki enrollment aktif").
- [ ] Regression cepat: `npm run lint`, `npm run build` TIDAK perlu (tidak ada perubahan kode), tetapi jalankan smoke borrow eligibility bila ada rangkaian yang tersedia.

### 7.5 Rollback

| Skenario | Tindakan |
|----------|----------|
| Gagal di tengah (error/tx rollback) | Otomatis: `createMany` tidak commit → 0 baris. Tidak perlu tindakan. |
| Hasil tidak diinginkan (mis. enrollment salah / duplikat) | **Restore backup**: stop app → salin kembali `.db` (+ `-wal`/`-shm`) dari `backup/backfill-20260804/` → jalankan `PRAGMA integrity_check`. |
| Hanya perlu membersihkan tanpa backup | `DELETE FROM MemberEnrollment` untuk baris hasil backfill — HANYA aman bila belum ada aktivitas enrollment/promosi/peminjaman real yang menyentuh baris tersebut. **Backup-restore adalah opsi prefered.** |

- Karena script idempotent & aditif, restore aman kapan pun; tidak ada data member yang hilang (script tidak menghapus apa pun).

---

## Catatan Tambahan untuk PO

1. **Backfill = langkah migrasi yang hilang** — WO ini akan menyelesaikan gap 395/395; bukan perubahan aplikasi.
2. Setelah backfill, **masih ada celah konsistensi**: `Member.status` tetap `INACTIVE` untuk siswa dengan Enrollment ACTIVE (UI menampilkan INACTIVE). Keputusan PO: apakah perlu WO lanjutan untuk sinkronisasi `Member.status=ACTIVE`.
3. Guard kelas untuk **delete** (`enrollmentRepository.countByClass`, class.service.ts:137) baru bermakna penuh SETELAH backfill — sebelum itu kelas bisa dihapus walau punya 395 siswa via classId. Backfill juga menutup celah itu.
4. **Single-flight / concurrency**: backfill dijalankan satu proses. Untuk konteks eksekusi produksi di masa depan, pertimbangkan unique constraint atau lock (tech debt tercatat).

**Scope WO ditutup: DISCOVERY + PLAN. Belum ada eksekusi. Menunggu approval Product Owner.**
