# SPRINT9 — WO-4.1 Technical Debt Register
**Matching Runtime Wiring**

| ID | Item | Diperkenalkan/Relevan | Dampak | Rencana | Prioritas |
|----|------|----------------------|--------|---------|-----------|
| TD-1 | `MatchingEngineService.matchingResult` hardcoded `{valid:true, errors:[], warnings:[]}` | Ada sejak WO-BR-99 | `MatchedWorkbook.matchingResult` selalu "valid" meski ada baris NOT_FOUND/AMBIGUOUS; konsumen UI belum bisa memfilter "siap impor" dari hasil ini | Hitung ulang dari `matchedRows` (mis. baris dengan semua field FOUND = valid) di WO lanjutan | Tinggi |
| TD-2 | Singleton dummy `matchingEngineService` (default constructor `dummyMatchStrategies`) masih diekspor dari `src/services` | Ada sejak WO-BR-99 | Dua sumber kebenaran: dummy (renderer/smoke) vs produksi (main). Bisa memicu pemakaian salah jika dikonsumsi UI langsung | Pertahankan untuk dummy/testing; jangan dipakai produksi. Evaluasi penghapusan saat UI dummy dihapus | Rendah |
| TD-3 | `createPrismaMatchProviders()` deprecated (`src/main/providers/index.ts`) masih ada; `findMatches` transition method masih di `MatchProvider` | Ada sejak WO-7 | Dua jalur provider/strategy; risiko konsumsi provider tanpa strategy (hasil tidak konsisten) | Hapus sesuai jadwal removal compatibility layer (PRODUCTION_READINESS_AUDIT_SPRINT8) | Sedang |
| TD-4 | `tsconfig.node.json` kini mendaftar 5 file `src/services/*` + `src/types/import.ts` secara eksplisit | Baru (WO-4.1) | File list composite jadi lebih panjang; setiap penambahan file ke graf impor main memerlukan registrasi manual (TS6307 bila lupa) | Saat `MatchingEngineService` dipindah/disentralkan, rapikan include. Pertimbangkan glob `src/services/**/*` bila graf membesar (verifikasi TS6307 untuk dependensinya) | Rendah |
| TD-5 | Adaptor `toValidatedWorkbook` di layer IPC membuat stub `ValidatedWorkbook` | Baru (WO-4.1) | Stub terpisah dari engine; bila engine mulai membaca field lain selain `canonicalRows`, stub diam-diam menjadi salah | Pertahankan satu-satunya pembuat stub di `book-import.ipc.ts`; uji smoke ikut memakai body yang sama | Rendah |
| TD-6 | Channel `imports:match` belum memiliki error/guard untuk payload non-array atau row tanpa `values` | Baru (WO-4.1) | `matchRow` akses `canonicalRow.values[...]` → crash jika payload invalid dari renderer | Tambah validasi payload di handler bila UI mulai mengirim (WO UI lanjutan) | Sedang |
| TD-7 | `BookImportPreviewPage` belum mengonsumsi `imports.match` — hasil matching belum tampil di UI | Kondisi eksisting | Fitur impor buku masih tanpa tahap matching yang terlihat | WO lanjutan (UI wiring + hasil matching + aksi impor) | Tinggi |

## Catatan
- TD-6 adalah risiko yang **tidak diaktifkan sekarang**: satu-satunya konsumen (preload) sudah typed dan hanya diubah oleh kode kita. Guard ditambahkan bersamaan dengan integrasi UI agar tidak mematikan path legacy.
- Tidak ada debt baru yang memperkenalkan data/nilai salah pada path produksi aktif; semua debt berpusat pada perantara (stub, tsconfig) dan fitur yang belum terhubung.
