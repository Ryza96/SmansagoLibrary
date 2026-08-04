# DASHBOARD PHASE 1 — DATA ACTIVATION — IMPLEMENTATION REPORT

## 1. Ringkasan
Aktivasi data Dashboard sesuai **HIGH-priority** item dari `DASHBOARD_AUDIT_REPORT.md`. `DashboardService` menjadi **Single Source of Truth** seluruh angka dashboard via satu IPC `dashboard:overview` (T1). Empat kartu **Aktivitas Hari Ini** (T2), **Sedang Dipinjam** dihitung penuh tanpa batas halaman (T7/B1), **Aktivitas Terbaru** (T4), dan **Perlu Perhatian** (T5) kini memakai data real. **Tidak ada** perubahan layout/UI/desain, tidak ada chart, tidak ada widget/menu baru, tidak ada migration/schema.

Source of truth: `DASHBOARD_AUDIT_REPORT.md` (APPROVED) + instruksi WO Phase 1 (HIGH only).

## 2. File Baru / Diubah
| File | Jenis | Isi |
|------|-------|-----|
| `src/shared/dto/dashboard.ts` | **baru** | `DashboardOverviewDTO` { summary, today, recentActivity[], alerts[] } + sub-DTO: `DashboardSummaryDTO` (totalBooks/totalInventories/totalMembers/activeBorrowings), `DashboardTodayDTO` (borrowed/returned/overdue/dueToday), `DashboardRecentActivityDTO` (id/type 'BORROW'\|'RETURN'/message/occurredAt), `DashboardAlertDTO` (id/severity 'danger'\|'warning'/type/message) |
| `src/main/repositories/dashboard.repository.ts` | **baru** | Aggregat read-only: `countBooks/countBookCopies/countMembers/countActiveBorrows` (COUNT langsung — tidak ada fetch+hitung, fix B1), `countBorrowedBetween/countReturnedBetween/countOverdueBefore/countDueBetween`, `findRecentBorrows/findRecentReturns` (limit, order desc, select minimal), `findOverdueBorrows/findDueTodayBorrows/findLostCopies` (limit per kategori) |
| `src/main/services/dashboard.service.ts` | **baru** | `getOverview()` — 7 query paralel (`Promise.all`), boundary hari via `startOfDay/endOfDay`, perakitan `recentActivity` (merge borrow+return, sort desc, slice `RECENT_ACTIVITY_LIMIT=8`) & `alerts` (overdue danger, due-today + lost warning), semua `Promise.all` count → DTO |
| `electron/ipc/dashboard.ipc.ts` | **baru** | `dashboard:overview` → `dashboardService.getOverview()` |
| `electron/preload/dashboard.preload.ts` | **baru** | `dashboard.overview()` → `ipcRenderer.invoke('dashboard:overview')` |
| `electron/main/bootstrap.ts` | **modifikasi** | `+DashboardService`/`DashboardRepository` di `Container` + instantiasi |
| `electron/ipc/index.ts` | **modifikasi** | `+registerDashboardHandlers(services.dashboardService)` + tipe |
| `electron/preload/index.ts` | **modifikasi** | `+dashboardAPI` spread |
| `src/renderer/env.d.ts` | **modifikasi** | `+dashboard.overview → Promise<DashboardOverviewDTO>` |
| `src/pages/DashboardPage.tsx` | **modifikasi** | Hanya lapisan data (state `stats` → `overview: DashboardOverviewDTO`; `load()` → `window.electronAPI.dashboard.overview()`); 4 kartu KPI & 4 kartu Ringkasan diisi `overview.today.*` / `overview.summary.*` (Total Inventaris keluar dari "—"); Aktivitas Terbaru & Perlu Perhatian render list saat ada data, empty-state lama dipertahankan saat kosong |
| `dashboard_phase1_smoke/smoke.ts` | **baru** | Smoke DB 30 kasus (lihat §6) |

## 3. Keputusan Desain
1. **DashboardService = SSOT; IPC minimal.** Semua angka dashboard lahir dari satu kontrak `dashboard:overview`; renderer TIDAK menurunkan/memfilter apa pun (konsisten WO-2/pola lain). Renderer hanya memformat waktu untuk display.
2. **COUNT, bukan fetch.** `activeBorrowings`/`totalInventories`/`totalBooks`/`totalMembers` = `prisma.*.count()` — memperbaiki B1 (sebelumnya `findMany(limit 1000)` terpotong oleh clamp `getPaginationParams` max 100 → maksimal 100).
3. **Definisi "aktif" konsisten** dengan borrow stack baru: `returnDate === null` (komentar legacy `status = returnDate ? 'COMPLETED' : 'ACTIVE'`). Tidak ada logika status ganda.
4. **Hari ini** = rentang `[startOfDay, endOfDay]` waktu lokal mesin. `borrowed` = jumlah transaksi Borrow dengan `borrowDate` hari ini; `returned` = jumlah **detail** `BorrowDetail.returnedAt` hari ini (1 transaksi bisa menyumbang N detail); `overdue` = Borrow aktif `dueDate < startOfDay`; `dueToday` = Borrow aktif `dueDate` dalam rentang hari ini.
5. **Recent Activity** menggabungkan event BORROW (dari `Borrow.borrowDate`) + RETURN (dari `BorrowDetail.returnedAt`), disortir descending, dibatasi 8. Pesan dibangun di Service (bukan renderer).
6. **Alert panel hanya memakai kondisi yang sudah didukung data** (amanat WO: "JANGAN membuat alert baru"): OVERDUE (danger), DUE_TODAY (warning), COPY_LOST (warning, `BookCopy.status=LOST` via `BOOK_COPY_STATUS`). Masing-masing dibatasi 50.
7. **Boundary murni** di Service (repository menerima Date bounds). Repo tidak menyimpan state/timezone — deterministik diuji smoke.

## 4. Arsitektur
```
DashboardPage (renderer)
   │ window.electronAPI.dashboard.overview()
   ▼
dashboard.preload → ipcRenderer.invoke('dashboard:overview')
   ▼
registerDashboardHandlers (electron/ipc/dashboard.ipc.ts)
   ▼
DashboardService.getOverview()                (SSOT — 7 query paralel)
   │ ├─ DashboardRepository.count* (summary + today)
   │ ├─ findRecentBorrows/Returns (activity)
   │ └─ findOverdue/DueToday/Lost (alerts)
   ▼
DashboardOverviewDTO (shared/dto) → renderer
```
- **TIDAK menyentuh** BorrowService/ReturnService/repository lain, schema/migration (`prisma migrate diff` = no difference), layout/UI/desain dashboard, chart, routes, sidebar, labels, atau module lain.

## 5. Scope Discipline (TIDAK Diubah)
`Borrow`/`BorrowDetail`/`Book`/`BookCopy`/`Member` schema; migration; `BorrowService`/`ReturnService`; `book.service.ts` legacy & `books.findMany` usage lain; repository borrow/borrow-detail/member/book-copy; `Setting`; UI lain; routes/navigation/sidebar; layout & styling `DashboardPage` (hanya data binding). Dummy placeholder ("—") dipertahankan sebagai fallback placeholder-mode saat API gagal.

## 6. Validation
| Gate | Hasil |
|------|-------|
| Smoke `dashboard_phase1_smoke/smoke.ts` (fresh DB temp, 4 migrations) | **30/30 PASS** — STEP 0 DB kosong (summary/today 0, activity/alerts kosong); STEP 1–2 seed 3 member/2 buku/7 eksemplar (1 LOST)/4 peminjaman (3 aktif, 1 selesai, 1 detail kembali hari ini, 1 overdue, 1 jatuh tempo hari ini); STEP 3 summary + KPI hari ini; STEP 4 recent activity (event BORROW/RETURN, urutan desc, batas 8); STEP 5 alerts OVERDUE/DUE_TODAY/COPY_LOST hanya kategori didukung; STEP 6 **bulk 120 peminjaman → activeBorrowings = 123 (bukti B1 fix, bukan potongan 100)** sementara KPI hari ini & overdue tidak berubah |
| Regression borrow fresh DB | **228/228 PASS** — borrow_card_wo1 101 · it_borrow_eligibility 7 · it1_borrow_return 34 · wo14_e2 36 · wo2_borrow_card_preview 21 · borrow_card_uat 29 |
| `npm run lint` (tsc node+web) | PASS |
| `npm run build` | PASS — main **1,844.45 kB** · preload **9.47 kB** · renderer **1,060.86 kB** (`index-CGR9uyxv.js`) |
| `prisma migrate diff` (--from-migrations & --from-url dev DB) | "empty migration" / no drift |
| Grep bundle | main `dashboard:overview` (1) + preload `dashboard:overview` (1) + renderer `window.electronAPI.dashboard.overview()` verbatim + marker UI "Aktivitas Terbaru"/"Perlu Perhatian"/"Dipinjam Hari Ini"/"Total Inventaris" ter-render; pola bug `borrowings.findMany(undefined, 1, 1000)` = **0** |
