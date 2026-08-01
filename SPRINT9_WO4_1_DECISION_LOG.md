# SPRINT9 — WO-4.1 Decision Log
**Matching Runtime Wiring**

## D-1: Channel IPC `imports:match` dengan payload `canonicalRows`
**Keputusan:** Renderer mengirim `CanonicalRow[]`; main menerimanya di channel `imports:match`.
**Opsi ditolak:**
- Renderer mengirim seluruh `ValidatedWorkbook` → melanggar syarat WO-4.1 ("renderer hanya kirim canonicalRows") dan menduplikasi data raw.
- Channel per-field (mis. `imports:match:isbn`) → kaku; engine memproses per-row secara paralel dan utuh.
**Dampak:** satu trip IPC per operasi matching; payload kecil; extensible untuk operasi impor lain di namespace `imports:`.

## D-2: Engine dibuat di `bootstrap.ts` dengan `createProductionStrategies()`, bukan lazy di handler
**Keputusan:** Komposisi production engine di Container (`new MatchingEngineService(createProductionStrategies())`), diteruskan ke `registerAllHandlers` → `registerBookImportHandlers(engine)`.
**Alasan:** konsisten dengan DI project (semua service dibuat di bootstrap, handler tak pernah instantiate sendiri); strategi dibuat sekali per aplikasi, bukan per request.
**Catatan:** `createProductionStrategies()` (composition root) dipakai apa adanya — sesuai audit, bukan `createPrismaMatchProviders()` yang deprecated.

## D-3: Adaptor `toValidatedWorkbook` (stub) — bukan mengubah signature engine
**Keputusan:** Membuat stub `ValidatedWorkbook` di sisi IPC karena `MatchingEngineService.match()` menerima `ValidatedWorkbook` sementara kebutuhan hanya `canonicalRows`.
**Alasan:** engine `match()` hanya membaca `validatedWorkbook.canonicalRows` (verifikasi kode `MatchingEngineService.ts:17`); mengubah signature engine = mengubah algoritma (di luar batasan WO-4.1).
**Dampak:** kontrak engine tetap stabil untuk konsumen lain (renderer dummy, smoke, WO-7); adaptor berada di lapisan wiring (IPC) bukan di lapisan domain.

## D-4: Singleton dummy `matchingEngineService` (renderer) dibiarkan
**Keputusan:** Tidak menghapus `export const matchingEngineService = new MatchingEngineService()` di `src/services`.
**Alasan:** masih menjadi default constructor engine; penghapusan = refactor di luar scope WO-4.1. Dikatalogkan sebagai Technical Debt (TD-2).

## D-5: `tsconfig.node.json` diperluas (bukan memindahkan file engine)
**Keputusan:** Mendaftarkan graf impor engine (`MatchingEngineService`, `DummyMatchStrategies`, `DummyMatchProviders`, `MatchProviders`, `src/types/import.ts`) ke `include` proyek node.
**Alasan:** composite project menolak file di luar include (`TS6307`). Pilihan memindahkan file ke `src/main/` atau `src/shared/` mengubah lokasi berkas domain (scope creep) dan berisiko konflik konteks web/node yang memakai engine untuk dummy rendering.
**Dampak:** engine kini terkompilasi dua konteks (node & web). Isi file tidak berubah; hanya konfigurasi.

## D-6: Verifikasi via smoke sementara (tidak permanen)
**Keputusan:** Menulis skrip smoke `scripts/smoke-wo41-match-ipc.ts`, menjalankan, lalu menghapus.
**Alasan:** WO-4.1 menekankan "minimal file changes"; smoke permanen bukan deliverable. Logika handler sudah tervalidasi 17/17 pada fresh DB temp.

## Keputusan yang sengaja TIDAK diambil (out of scope)
- Menghubungkan `BookImportPreviewPage` ke `imports.match` (UI wiring = WO lanjutan, setelah WO-4.1 disetujui PO).
- Menghapus `findMatches` deprecated / `createPrismaMatchProviders` / dummy providers (removal dijadwalkan pasca produksi — lihat PRODUCTION_READINESS_AUDIT_SPRINT8).
- Refactor `matchingResult` hardcoded `{valid:true,errors:[],warnings:[]}` (WO lanjutan matching-lanjutan).
