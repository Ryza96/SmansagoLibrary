# DASHBOARD AUDIT REPORT

Mode: **READ ONLY / DISCOVERY ONLY** — tanpa perubahan kode, tanpa commit.
Tanggal audit: 2026-08-05.
Komponen dashboard seluruhnya berada di **satu file**: `src/pages/DashboardPage.tsx` (278 baris) + komponen layout pendukung.

**Temuan utama:** `DashboardPage.tsx` **BELUM PERNAH DIUBAH** sejak baseline commit `437b50a` ("release: v1.0 release candidate"). Dashboard adalah scaffold awal, tidak mengikuti pola stack baru, tidak memiliki service sendiri, dan sebagian besar isinya dummy/placeholder.

---

## 1. DAFTAR SELURUH KOMPONEN DASHBOARD

| # | Komponen | Lokasi | Jenis |
|---|----------|--------|-------|
| C1 | Header banner (tanggal + jam + sambutan) | DashboardPage.tsx:124–132 | Header widget |
| C2 | KPI Card — Aktivitas Hari Ini (4 kartu) | DashboardPage.tsx:135–163 | KPI Card |
| C3 | Hero Action — Peminjaman Baru | DashboardPage.tsx:166–184 | Quick action |
| C4 | Action Launcher (4 kartu aksi) | DashboardPage.tsx:187–219 | Quick action / shortcut |
| C5 | Import Data placeholder | DashboardPage.tsx:222–230 | Widget (placeholder) |
| C6 | Recent Activity — "Aktivitas Terbaru" | DashboardPage.tsx:236–246 | Recent activity |
| C7 | Alert Panel — "Perlu Perhatian" | DashboardPage.tsx:249–261 | Alert panel |
| C8 | KPI / Summary Card — "Ringkasan Perpustakaan" (4 kartu) | DashboardPage.tsx:266–274 | KPI Card |
| C9 | Grafik | — | **TIDAK ADA** (tidak ada chart library) |
| C10 | Sidebar item "Dashboard" → `/dashboard` | `src/components/layout/Sidebar.tsx:20` | Navigation |
| C11 | Route `/` redirect → `/dashboard`; route `dashboard` | `src/routes/index.tsx:45–46` | Navigation |
| C12 | TopBar tombol Settings | `src/components/layout/TopBar.tsx:28–30` | Shortcut (rusak) |
| C13 | StatusBar (SQLite ping + info app) | `src/components/layout/StatusBar.tsx` | Status widget |

---

## 2. STATUS PER KOMPONEN

| # | Komponen | Status | Ringkas |
|---|----------|--------|---------|
| C1 | Header banner | ✅ Berfungsi | Jam realtime via `useRealtimeClock` (interval 1s). Nama "Administrator" hardcoded. |
| C2 | KPI "Aktivitas Hari Ini" | ❌ Tidak berfungsi | 4 kartu semuanya nilai `"—"` hardcoded (dummy). |
| C3 | Hero Action Peminjaman Baru | ✅ Berfungsi | Navigasi → `/borrowings`. |
| C4 | Action Launcher | ✅ Berfungsi | 4 shortcut navigasi → `/returns`, `/members/new`, `/books/new`, `/inventory` (semua tujuan ada). |
| C5 | Import Data | ⚠️ Berfungsi sebagian | Placeholder "Coming Soon" — **menyesatkan**: fitur import sudah ada (Buku: `/books/import`; Anggota: dialog `MemberImportDialog`). |
| C6 | Recent Activity | ❌ Tidak berfungsi | Hardcoded "Belum ada aktivitas hari ini." — selalu kosong walau ada transaksi. |
| C7 | Alert Panel | ❌ Tidak berfungsi | Hardcoded "Tidak ada pekerjaan yang memerlukan perhatian." — selalu kosong walau ada buku terlambat/HILANG. |
| C8 | KPI "Ringkasan Perpustakaan" | ⚠️ Berfungsi sebagian | Total Buku & Total Anggota real; Total Inventaris & Sedang Dipinjam bermasalah (lihat B1, B2). |
| C9 | Grafik | — | Tidak ada sama sekali (no recharts/d3/chart.js). |
| C10 | Sidebar → Dashboard | ✅ Berfungsi | `NavLink` `/dashboard`. |
| C11 | Route redirect | ✅ Berfungsi | `/` → `/dashboard`, route `dashboard` terdaftar. |
| C12 | TopBar Settings button | ❌ Tidak berfungsi | Tombol tanpa `onClick` — tidak melakukan apa pun. |
| C13 | StatusBar | ✅ Berfungsi | `db.ping()` + `app.info()` real. |

**Rekap: ✅ 6 · ⚠️ 2 · ❌ 5 · N/A 1 (grafik).**

---

## 3. AUDIT PER KOMPONEN (detail)

### C1 — Header banner
1. **Nama:** Header Dashboard.
2. **Tujuan:** Sambutan + penunjuk tanggal & jam realtime.
3. **Data:** `Date` client-side (`useRealtimeClock`, interval 1000 ms). Teks "Administrator" hardcoded.
4. **Sumber:** — (tidak ada service; murni renderer).
5. **Nyata/dummy:** Jam & tanggal nyata; nama user dummy.
6. **Berfungsi:** ✅ Ya.
7. —.
8. **Relevan:** Ya.
9. **Rekomendasi:** **PERTAHANKAN** (opsional kecil: nama user dari settings/auth bila ada).

### C2 — KPI Card "Aktivitas Hari Ini" (4 kartu)
1. **Nama:** TodayCard (Dipinjam Hari Ini / Dikembalikan Hari Ini / Terlambat / Jatuh Tempo Hari Ini).
2. **Tujuan:** KPI harian operasional perpustakaan.
3. **Data:** Nilai **`"—"` hardcoded** (DashboardPage.tsx:141,147,153,159).
4. **Sumber:** — (tidak dipanggil API apa pun).
5. **Nyata/dummy:** **DUMMY** seluruhnya.
6. **Berfungsi:** ❌ Tidak (hanya UI statis; tidak pernah menampilkan data).
7. **Penyebab:** Belum ada wiring/service. Sumber data sebenarnya tersedia di schema:
   - Dipinjam hari ini → `Borrow.borrowDate` (berlaku `today`)
   - Dikembalikan hari ini → `BorrowDetail.returnedAt` (berlaku `today`)
   - Terlambat → `Borrow.returnDate = null` AND `dueDate < now`
   - Jatuh tempo hari ini → `Borrow.returnDate = null` AND `dueDate = today`
8. **Relevan:** Sangat relevan (inti dashboard perpustakaan).
9. **Rekomendasi:** **DIUBAH** — wire ke backend (4 query agregat).

### C3 — Hero Action "Peminjaman Baru"
1. **Nama:** Hero action (gradient banner + CTA "Mulai Sekarang").
2. **Tujuan:** Pintu masuk cepat ke transaksi peminjaman.
3. **Data:** — (statis).
4. **Sumber:** —.
5. **Nyata/dummy:** Statis, bukan data.
6. **Berfungsi:** ✅ `navigate('/borrowings')`.
7. —.
8. **Relevan:** Ya.
9. **Rekomendasi:** **PERTAHANKAN**.

### C4 — Action Launcher (4 kartu)
1. **Nama:** LaunchCard (Pengembalian / Tambah Anggota / Tambah Buku / Inventaris).
2. **Tujuan:** Shortcut aksi cepat.
3. **Data:** — (statis).
4. **Sumber:** —.
5. **Nyata/dummy:** Statis.
6. **Berfungsi:** ✅ Semua tujuan rute ada & valid.
7. —.
8. **Relevan:** Ya.
9. **Rekomendasi:** **PERTAHANKAN**.

### C5 — Import Data
1. **Nama:** Widget "Import Data — Coming Soon".
2. **Tujuan:** (sebelumnya) pintu import data.
3. **Data:** —.
4. **Sumber:** —.
5. **Nyata/dummy:** Placeholder.
6. **Berfungsi:** ⚠️ Menampilkan "Coming Soon" padahal fitur import **sudah jadi**:
   - Import Buku: `BookImportPage` (`/books/import`, pipeline matching→auto-create, WO-2/WO-3/WO-21).
   - Import Anggota: `MemberImportDialog` + `/members/*` (WO-19 MI-3, WO-20 MI-4).
7. **Penyebab:** Scaffold baseline tidak pernah di-update.
8. **Relevan:** Rendah dalam bentuk sekarang; informasinya menyesatkan.
9. **Rekomendasi:** **DIUBAH** — ganti jadi shortcut fungsional ke `/books/import` (dan/atau tombol import anggota).

### C6 — Recent Activity ("Aktivitas Terbaru")
1. **Nama:** Panel Aktivitas Terbaru.
2. **Tujuan:** Daftar transaksi terbaru (pinjam/kembali).
3. **Data:** Hardcoded "Belum ada aktivitas hari ini." (DashboardPage.tsx:241–245).
4. **Sumber:** —.
5. **Nyata/dummy:** **DUMMY** (state kosong statis).
6. **Berfungsi:** ❌ Tidak pernah menampilkan aktivitas nyata.
7. **Penyebab:** Tidak ada query/service. Data tersedia: `Borrow` (borrowDate, memberName) + `BorrowDetail` (returnedAt, bookTitle). `AssetEvent` hanya book-copy lifecycle (belum mencatat pinjam/kembali), sehingga bukan sumber yang tepat tanpa perluasan.
8. **Relevan:** Sangat relevan.
9. **Rekomendasi:** **DIUBAH** — wire ke query transaksi terbaru (mis. 5–10 entri) dari `Borrow`/`BorrowDetail`.

### C7 — Alert Panel ("Perlu Perhatian")
1. **Nama:** Panel Perlu Perhatian.
2. **Tujuan:** Peringatan operasional (terlambat, buku rusak/hilang, stok menipis).
3. **Data:** Hardcoded "Tidak ada pekerjaan yang memerlukan perhatian." (DashboardPage.tsx:254–260).
4. **Sumber:** —.
5. **Nyata/dummy:** **DUMMY**.
6. **Berfungsi:** ❌ Tidak pernah menampilkan alert nyata.
7. **Penyebab:** Belum ada query. Sumber data tersedia: peminjaman terlambat (`Borrow.returnDate=null AND dueDate<now`), `BookCopy.status` (BORROWED/HILANG/LOST/REMOVED), dst.
8. **Relevan:** Sangat relevan.
9. **Rekomendasi:** **DIUBAH** — wire ke query alert (overdue + kondisi BookCopy).

### C8 — KPI "Ringkasan Perpustakaan" (4 kartu)
1. **Nama:** SummaryCard (Total Buku / Total Inventaris / Total Anggota / Sedang Dipinjam).
2. **Tujuan:** KPI agregat utama.
3. **Data (DashboardPage.tsx:98–118):**
   - Total Buku = `(await books.findMany()).length` → **real**
   - Total Anggota = `(await members.findMany(undefined, 1, 1)).total` → **real**
   - Sedang Dipinjam = `borrowings.findMany(undefined, 1, 1000).data.filter(status==='ACTIVE').length` → **real tapi salah bila >100 aktif** (lihat B1)
   - Total Inventaris = `"—"` **hardcoded dummy**
4. **Sumber:**
   - Buku: `BookService.getAllBooks` (`electron/main/services/book.service.ts:8`) → `BookRepository.findManyWithCount` (`electron/main/repositories/book.repository.ts:15`) — **LEGACY stack, tanpa pagination** (fetch seluruh buku).
   - Anggota: `MemberService.findMany` (`src/main/services/member.service.ts:53`) → `MemberRepository.findMany` + `count`.
   - Peminjaman: `BorrowService.findMany` (`src/main/services/borrow.service.ts:103`) → `BorrowRepository.findMany`; `status` = `returnDate ? 'COMPLETED' : 'ACTIVE'`.
   - Inventaris: **tidak dipanggil** — padahal `inventory.count` → `InventoryService.count` → `BookCopyRepository.count` sudah tersedia (`electron/ipc/inventory.ipc.ts:9`).
5. **Nyata/dummy:** Campuran (2 real, 1 real-flawed, 1 dummy).
6. **Berfungsi:** ⚠️ Sebagian.
7. **Penyebab:** scaffold lama + tidak memakai `inventory.count` + limit 100 borrows.
8. **Relevan:** Sangat relevan.
9. **Rekomendasi:** **DIUBAH** — pakai query count agregat; ganti "Total Buku" dari `books.findMany().length` → `bookRepository.count()` (sudah ada di `src/main/repositories/book.repository.ts:92`); ganti "Sedang Dipinjam" dari filter halaman → count ACTIVE; isi "Total Inventaris" via `inventory.count`.

### C9 — Grafik
1. **Nama:** — (tidak ada).
2. **Tujuan:** —.
3. **Data:** —.
4. **Sumber:** —.
5. **Nyata/dummy:** —.
6. **Berfungsi:** N/A.
7. **Penyebab:** Belum pernah dibangun; `package.json` tidak punya chart library (hanya `lucide-react`, `react-router-dom`, `@prisma/client`, `bwip-js`, `read-excel-file`).
8. **Relevan:** Opsional (ada ruang grid 2-kolom di Section 6/7 yang bisa menampung grafik).
9. **Rekomendasi:** **TAMBAH DI MASA DEPAN** bila disetujui PO (perlu dependency chart baru). Bukan bagian bug fix.

### C10–C11 — Navigation (Sidebar + Route)
- Sidebar: `NavLink` `/dashboard` ✅. Route `dashboard` + redirect `/` ✅.
- **Rekomendasi: PERTAHANKAN.**

### C12 — TopBar Settings button
1. **Nama:** Tombol gear Settings di TopBar.
2. **Tujuan:** (diduga) pintu ke `/settings`.
3. **Data:** —.
4. **Sumber:** —.
5. **Nyata/dummy:** UI statis.
6. **Berfungsi:** ❌ Tombol tanpa `onClick` (TopBar.tsx:28–30) — tidak melakukan apa pun.
7. **Penyebab:** Scaffold; shortcut di Sidebar `/settings` sudah ada.
8. **Relevan:** Rendah (duplikasi dengan Sidebar "Pengaturan").
9. **Rekomendasi:** **DIUBAH** (tambahkan `onClick` → `/settings`) atau **HAPUS**.

### C13 — StatusBar
- `db.ping()` → indikator SQLite hijau/kuning/merah ✅; `app.info()` → versi app/Electron/Node ✅.
- **Rekomendasi: PERTAHANKAN.**

---

## 4. DAFTAR BUG

| ID | Severity | Komponen | Deskripsi | Root cause |
|----|----------|----------|-----------|------------|
| B1 | **HIGH** | C8 "Sedang Dipinjam" | Nilai salah/terpotong bila peminjaman aktif > 100. Dashboard minta `limit 1000`, tapi `getPaginationParams` memotong `limit` ke **100** (`src/main/repositories/base/pagination.ts:5`). Count dihitung dari 100 record terbaru saja. | Dashboard tidak memakai query count; agregasi di renderer atas data terpagina. |
| B2 | **MEDIUM** | C8 "Total Inventaris" | Selalu `"—"` padahal `inventory.count` sudah tersedia dan berfungsi. | Tidak di-wire. |
| B3 | **MEDIUM** | C2 KPI Hari Ini | Selalu `"—"` — KPI harian tidak pernah menampilkan data. | Tidak ada service/query. |
| B4 | **MEDIUM** | C6 Recent Activity | Selalu kosong walau ada transaksi. | Tidak ada service/query. |
| B5 | **MEDIUM** | C7 Alert Panel | Selalu "Tidak ada pekerjaan…" walau ada peminjaman terlambat / buku HILANG. | Tidak ada service/query. |
| B6 | **LOW** | C5 Import Data | Placeholder "Coming Soon" menyesatkan — fitur import (buku & anggota) sudah jadi. | Scaffold baseline tidak di-update. |
| B7 | **LOW** | C12 TopBar Settings | Tombol tidak berfungsi (tanpa `onClick`). | Scaffold baseline. |
| B8 | **LOW** | C8 "Total Buku" | Menghitung via fetch **seluruh** daftar buku (legacy `findManyWithCount` tanpa pagination) demi satu angka count. | Dashboard tidak memakai `bookRepository.count()`. |
| B9 | **LOW** | C8 (umum) | `catch {} /* placeholder mode */` (DashboardPage.tsx:111–113) menelan error API diam-diam → statistik bisa tampil 0 tanpa pesan. | Error handling lemah. |

---

## 5. DAFTAR TECHNICAL DEBT

| ID | Deskripsi |
|----|-----------|
| TD1 | **DashboardPage.tsx belum pernah berubah sejak `437b50a`** (v1.0 RC) — tidak mengikuti pola stack baru (services/`src/main`, DTO shared, pagination), tidak memakai `BorrowingDTO` (`src/shared/dto/borrowing`) melainkan list item mentah. |
| TD2 | **Tidak ada DashboardService/Repository/IPC** — agregasi statistik dilakukan di renderer via polling besar (fetch 100 record peminjaman + seluruh buku) setiap kali halaman dimuat; tidak ada channel `dashboard:*`. |
| TD3 | **Dua stack service untuk buku**: dashboard memakai legacy `BookService`/`BookRepository` (`electron/main/`) yang memakai `prisma` singleton global; repo baru (`src/main/repositories/book.repository.ts`) sudah punya `count()` namun tidak dipakai dashboard. |
| TD4 | **Tidak ada chart library** — setiap kebutuhan grafik mengharuskan dependency baru. |
| TD5 | **"Administrator" hardcoded** — tidak ada konsep user/auth; label sambutan menyesatkan bila nanti multi-user. |
| TD6 | `MAX_BOOKS = 20` hardcoded di `borrow.service.ts` (debt lama, tercatat di AGENTS.md; tidak spesifik dashboard). |

---

## 6. DAFTAR DUMMY DATA

| Lokasi | Nilai |
|--------|-------|
| DashboardPage.tsx:141 | "Dipinjam Hari Ini" = `"—"` |
| DashboardPage.tsx:147 | "Dikembalikan Hari Ini" = `"—"` |
| DashboardPage.tsx:153 | "Terlambat" = `"—"` |
| DashboardPage.tsx:159 | "Jatuh Tempo Hari Ini" = `"—"` |
| DashboardPage.tsx:270 | "Total Inventaris" = `"—"` |
| DashboardPage.tsx:241–245 | Recent Activity: teks kosong statis |
| DashboardPage.tsx:254–260 | Alert Panel: teks kosong statis |
| DashboardPage.tsx:227 | "Import Data — Coming Soon" |
| DashboardPage.tsx:126 | Nama "Administrator" hardcoded |

Tidak ada **mock objek** (tanpa `MOCK_*`) — seluruh dummy berupa **placeholder string statis**, bukan data bohong.

---

## 7. DAFTAR TODO

| ID | Usulan | Prioritas |
|----|--------|-----------|
| T1 | Buat `DashboardService` + repository queries agregat + channel IPC `dashboard:summary` (counts) & `dashboard:activity` (recent) — hapus agregasi di renderer. | **HIGH** |
| T2 | Wire 4 KPI "Aktivitas Hari Ini" (dipinjam/dikembalikan/terlambat/jatuh tempo dari `Borrow`/`BorrowDetail`). | **HIGH** |
| T3 | Wire "Total Inventaris" via `inventory.count`. | **MEDIUM** |
| T4 | Wire Recent Activity (5–10 transaksi terbaru pinjam/kembali). | **HIGH** |
| T5 | Wire Alert Panel (peminjaman terlambat + BookCopy LOST/HILANG). | **HIGH** |
| T6 | Ganti placeholder "Import Data" → shortcut `/books/import` (+ import anggota). | **MEDIUM** |
| T7 | Perbaiki "Sedang Dipinjam" → query count ACTIVE (bukan filter halaman limit 100). | **HIGH** |
| T8 | Ganti Total Buku `books.findMany().length` → `bookRepository.count()`. | **LOW** |
| T9 | Ganti `catch {}` siluman → error state/alert. | **MEDIUM** |
| T10 | TopBar Settings button → `onClick` ke `/settings` atau hapus. | **LOW** |
| T11 | (Opsional, butuh keputusan PO) Tambah chart library + grafik (mis. pinjam/kembali per minggu) di grid Section 6/7. | **LOW** |

---

## 8. PRIORITAS PERBAIKAN

### HIGH (inti dashboard — data tidak tampil / salah)
- B1 + T7 — "Sedang Dipinjam" salah (>100 aktif) → query count ACTIVE.
- B3 + T2 — KPI Aktivitas Hari Ini (4 kartu dummy) → 4 query agregat.
- B4 + T4 — Recent Activity selalu kosong → query transaksi terbaru.
- B5 + T5 — Alert Panel selalu kosong → query overdue + BookCopy bermasalah.
- T1 — DashboardService + IPC `dashboard:*` (fondasi agar semua wiring di atas terpusat di backend, konsisten pola WO-007C/IT-1: **tanpa business logic di renderer**).

### MEDIUM (kelengkapan & kualitas)
- B2 + T3 — "Total Inventaris" `"—"` → `inventory.count`.
- B6 + T6 — Placeholder "Import Data" → shortcut fungsional.
- B9 + T9 — Error API ditelan diam-diam → tampilkan error state.

### LOW (polish)
- B7 + T10 — TopBar Settings dead button.
- B8 + T8 — Efisiensi Total Buku (count, bukan fetch semua).
- TD5 — Label "Administrator" (bila ada konsep user di masa depan).
- T11 — Grafik (menunggu keputusan PO + dependency chart).

---

## 9. KESIMPULAN

Dashboard saat ini **belum production-ready**: hanya 6 dari 11 komponen berfungsi penuh; 5 komponen rusak/tidak berfungsi karena **seluruh bagian data KPI, aktivitas, dan alert masih dummy/placeholder dari scaffold v1.0** yang belum pernah di-update. Backend pendukung (count members, `inventory.count`, `bookRepository.count`, data `Borrow`/`BorrowDetail`) **sudah tersedia** — sebagian besar perbaikan adalah wiring ke data nyata melalui service baru, tanpa perlu perubahan schema.

Prioritas pertama yang disarankan untuk WO perbaikan: **T1 (DashboardService)** lalu **T2/T4/T5/T7** — sehingga seluruh widget memakai satu otoritas agregasi di backend, konsisten dengan pola arsitektur yang sudah mapan.

---

**BERHENTI — audit selesai. Tidak ada perubahan kode, tidak ada commit. Menunggu review Product Owner.**
