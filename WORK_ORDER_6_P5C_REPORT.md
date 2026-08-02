# WORK ORDER 6 — P5C: Progress Integration

**Status:** DONE — menunggu review Product Owner
**Scope:** HANYA menghubungkan event progress (`members:importProgress`) ke UI. Tidak ada perubahan backend / parser / validation / duplicate / transaction.
**Tidak commit.**

---

## Objective

- Subscribe `window.electronAPI.memberImport.onProgress()` saat import dimulai.
- Unsubscribe setelah import selesai ATAU dialog ditutup — tanpa memory leak.
- Tampilkan stage sesuai `MemberImportProgressEvent` (DTO): Preparing, Checking Duplicate, Resolving Class, Generating Member Number, Saving Database, Completed.
- Tampilkan progress `current / total` (contoh `1250 / 5000`).
- Progress bar mengikuti persentase DTO (`current/total`) — renderer TIDAK menghitung ulang metrik sendiri.
- Jika import gagal → progress berhenti di stage terakhir (tidak di-clear).
- Jika import berhasil → progress 100% (`completed`) kemudian `MemberImportResultDTO` ditampilkan seperti P5B.

## Files Modified

| File | Perubahan |
|------|-----------|
| `src/components/members/MemberImportDialog.tsx` | Subscribe/unsubscribe `onProgress` via `useRef` + `useEffect` (cleanup unmount); state `progress: MemberImportProgressEvent`; inisialisasi `preparing 0/N` saat import mulai; set `completed N/N` saat sukses; panel progress (stage label + `current / total` + bar width `(current/total)*100`) |
| `src/utils/labels.ts` | Tambah `PROGRESS_TITLE` ("Status Import") + `PROGRESS_STAGES` (6 label stage sesuai DTO) |

**Tidak diubah:** `src/main/services/member-import.service.ts` (termasuk emission stage), IPC `electron/ipc/member.ipc.ts`, preload `electron/preload/member.preload.ts` (kontrak `onProgress` + unsubscribe sudah ada sejak P4D), `src/renderer/env.d.ts`, parser/validation/preview.

## Progress Flow

1. Klik **Import** → `setProgress({ stage: 'preparing', current: 0, total: parsedRows.length })` → `subscribeProgress()` (`window.electronAPI.memberImport.onProgress(cb)` — callback hanya `setProgress(event)`, tanpa transformasi).
2. Backend mengirim event via channel `members:importProgress` → panel menampilkan `STAGE_LABEL[event.stage]` + `current / total` + bar width `(current/total) * 100` (0 bila `total === 0`). Stage yang dipancarkan backend saat ini: `preparing` → `checking-duplicate` → `resolving-class` → `generating-number` → `completed`. (`saving` ada di DTO dan dipetakan label, namun tidak dipancarkan service — di luar scope.)
3. **Sukses:** backend memancarkan `completed (N/N)` lalu resolve → renderer memaksa `setProgress({ stage: 'completed', current: totalRows, total: totalRows })` (nilai dari `MemberImportResultDTO`) → bar 100%; kemudian panel ResultDTO sukses tampil di bawahnya (seperti P5B).
4. **Business error** (`success:false`, mis. preflight/P2002/single-flight): progress TIDAK di-clear → berhenti di stage terakhir yang dipancarkan backend. Panel pesan dari `result.errors` tampil (P5B).
5. **System error** (reject): progress berhenti di stage terakhir; dialog error tampil (P5B).
6. `finally` → `unsubscribeProgress()` (ref null); `handleClose()` juga memanggil `unsubscribeProgress()`; `useEffect` cleanup memanggil unsubscribe saat unmount — dijamin tanpa memory leak (listener `ipcRenderer.on` dihapus via `removeListener`).
7. Mengganti file baru (`handleFileChange`) mereset `progress` ke null.

## Validation

| Check | Hasil |
|-------|-------|
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,774.00 kB · preload 7.68 kB · renderer `index-1u9sUwM6.js` 938.79 kB) |
| Progress bergerak | Event stage + `current/total` dari DTO dipetakan langsung ke panel (`preparing`→…→`completed`); backend emission diverifikasi di `member-import.service.ts:94,113-115,152-158` |
| Unsubscribe bekerja | Preload bundle berisi `removeListener` (=1) pada fungsi return `onProgress`; renderer memanggil unsubscribe di `finally` import + `handleClose` + unmount cleanup (ref idempotent) |
| Import gagal → progress berhenti | `progress` tidak di-clear pada path gagal — tetap menampilkan stage terakhir yang diterima |
| Import berhasil → 100% + ResultDTO | `setProgress(completed N/N)` + `setImportResult(result)`; panel sukses tampil (P5B) |
| Artifact grep renderer | `onProgress` = 12; `Status Import` = 1; `Preparing`/`Checking Duplicate`/`Resolving Class`/`Generating Member Number`/`Saving Database`/`Completed` = masing-masing 1 |
| Artifact grep preload | `members:importProgress` = 2 (subscribe + event name); `removeListener` = 1; `onProgress` = 1 |

> Catatan: P5C murni UI. Kontrak channel + unsubscribe sudah diverifikasi end-to-end di P4D (`uat_wo5_p4d/ipc-contract.smoke.ts` 25/25 — termasuk sequence stage dan unsubscribe). Backend tidak disentuh.

## Compatibility

- **Backward compatible:** kontrak preload/env/IPC tidak berubah; `onProgress(cb) → unsubscribe()` sudah ada sejak P4D.
- **Renderer:** hanya `MemberImportDialog.tsx` + `labels.ts`. Semua label stage digabung ke objek `PROGRESS_STAGES` bertipe stage DTO.
- **No recompute:** lebar bar = `current/total` dari DTO secara langsung; renderer tidak meng-hitung progress sendiri.
- **No memory leak:** single-subscription per import + unsubscribe pada selesai / tutup / unmount.
- **RFC compliance:** alur "Result tampil → tutup dialog → refresh daftar" (P5B) tidak berubah; progress `completed` lalu ResultDTO, dan dialog tetap ditutup manual oleh user → `fetchMembers()`.
