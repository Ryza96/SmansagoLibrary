# NS2_TOAST_FIX_RELEASE.md

**Status:** COMPLETE — RELEASE (menunggu review PO untuk repackage `dist/` bila diperlukan)
**WO:** Perbaikan NS-2 Toast tidak terlihat (Tailwind content scan)

---

## 1. Perubahan

`tailwind.config.js` — tambah glob `./src/notification/**/*.{js,ts,jsx,tsx}` ke `content`.

1 baris konfigurasi; tidak ada perubahan source, schema, migration, IPC, preload, dependency.

## 2. Validation

| Gate | Hasil |
|------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS |
| CSS memuat `top-14`, `right-4`, `z-[90]`, `z-[100]`, `bg-emerald-500` | PASS |
| `prisma migrate diff` | "This is an empty migration." |

## 3. Catatan untuk PO / selanjutnya

- **Fix hanya memengaruhi build artifact.** Aplikasi `dist/win-unpacked/` yang terinstall PO adalah artifact electron-builder lama (belum memuat fix). Bila PO ingin menguji pada build yang terinstall, perlu `npm run package:win` ulang (lihat pelajaran `WO-2 Investigation`: uji ARTIFACT, bukan source).
- **BERHENTI setelah WO ini** — tidak membuka NS-3 (migrasi Return / Master Data / Error / Confirm) sampai review PO selesai.
- Bug serupa Tailwind-content-scan berlaku untuk folder lain di luar `src/` yang dipurge (mis. `src/shared/**` bila dipakai class UI di komponen di sana — saat ini `src/shared/` murni config/DTO, aman).

## 4. Deployment scope

- Source repo: fix di working tree, commit final + push.
- Repackage `dist/`: opsional, atas instruksi PO.
