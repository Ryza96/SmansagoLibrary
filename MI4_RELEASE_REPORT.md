# MI4 RELEASE REPORT — Member Import UI (WO-20 MI-4)

**Tanggal:** 2026-08-03
**Status:** READY review PO — menunggu approval sebelum rilis.

---

## Ringkasan

UI **Import Anggota** kini aktif dan produksi-ready dengan scope eksplisit:
- Dialog mewajibkan **Academic Year** (default tahun aktif) + **Curriculum**.
- `previewCheck` / `import` selalu menerima scope `{ academicYearId, curriculumId }`.
- **Fallback MI-1 (tahun aktif implicit / kurikulum opsional) dihapus** dari resolver, service, repository, IPC, preload, dan env.d.ts.

Alur produksi lengkap: `Anggota → Import Anggota → Pilih Tahun Ajaran + Kurikulum → Pilih File → Validasi (preview dengan scope) → Import → Matching (skip & flag, MI-3) → Member + MemberEnrollment(ACTIVE)`.

## Verifikasi Rilis

| Item | Nilai |
|------|-------|
| lint | PASS |
| build | main 1,796.83 kB · preload 8.62 kB · renderer 1,006.72 kB |
| Smoke MI-4 | 24/24 |
| Regression | MI-1 43 · MI-2 37 · MI-3 38 · E-1 39 · E-2 36 · E-3 78 · E-4 45 |
| migrate diff | no drift |
| DB | fresh temp per smoke, dibersihkan; dev DB tidak disentuh |

## Catatan Rilis

1. Kontrak `MemberImportScope` berubah menjadi **required** di kedua field — ini menyederhanakan konsumen (renderer tidak lagi mengandalkan fallback). Pemanggil lama (smoke `uat_*`) tidak di-upgrade karena menguji perilaku obsolete.
2. Perubahan WO-19 MI-3 (`70d2e15`) sudah ter-release sebelum WO-20 MI-4; MI-4 berdiri di atasnya.
3. AGENTS.md diperbarui (catatan sesi) — di-commit bersama WORK ORDER ini.
