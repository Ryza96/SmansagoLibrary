// DTO Promosi — kontrak shared antara main & renderer (pola src/shared/dto).
// Sumber kebenaran: RFC §8 (PromotionPreviewDTO) + RFC §2.2 (PromotionRunItem.outcome).
// WO P-1 hanya membangun PROMOTION PREVIEW + decide() — tanpa executor/IPC/UI.

export type PromotionPreviewMode = 'AUTOMATIC' | 'MAPPING' | 'BULK_EDIT'

// PromotionRunItem.outcome (RFC §2.2, schema.prisma l.82).
// PROMOTED/REPEATED/REDISTRIBUTED/GRADUATED = status akademik (ACADEMIC_STATUS);
// NO_TARGET/ERROR = outcome keputusan yang bukan status enrollment.
export type PromotionOutcome =
  | 'PROMOTED'
  | 'REPEATED'
  | 'REDISTRIBUTED'
  | 'GRADUATED'
  | 'NO_TARGET'
  | 'ERROR'

// Kelas kandidat target (tahun target) — input `decide()`.
// curriculumId ikut dicocokkan (RFC §7 Mode A: "X MERDEKA 1 → XI MERDEKA 1" —
// kurikulum + parallel harus SAMA agar promosi terarah ke kelas yang tepat).
export interface PromotionTargetClassInput {
  id: string
  educationLevel: string
  parallel: string
  curriculumId: string
}

// Input lengkap `decide()` — MURNI, seluruh data dipassing via parameter.
// Tidak ada akses DB, tidak ada state global, tidak ada write (keputusan PO).
export interface PromotionDecideInput {
  memberId: string
  memberName: string
  sourceClassId: string
  sourceClassLabel: string
  sourceLevel: string
  sourceParallel: string
  sourceCurriculumId: string
  targetClasses: PromotionTargetClassInput[]
  // RFC §7 Mode A — "tidak ada yang dipromosikan ke tingkat sama (kecuali
  // dinyatakan REPEATED)": tinggal kelas adalah keputusan eksplisit, bukan otomatis.
  repeat?: boolean
}

// Hasil keputusan tunggal `decide()`.
export interface PromotionDecision {
  outcome: PromotionOutcome
  targetClassId: string | null
  targetClassLabel: string | null
  message: string | null
}

// RFC §8 — ringkasan agregat preview.
export interface PromotionPreviewCounts {
  promoted: number
  repeated: number
  graduated: number
  redistributed: number
  noTarget: number
  error: number
}

// RFC §8 — satu baris item preview (dapat diekspansi untuk noTarget/error).
export interface PromotionPreviewItem {
  memberId: string
  memberName: string
  sourceClassId: string
  sourceLabel: string
  targetClassId: string | null
  targetLabel: string | null
  outcome: PromotionOutcome
  message: string | null
}

// RFC §8 — kontrak penuh preview.
export interface PromotionPreviewDTO {
  mode: PromotionPreviewMode
  fromYearId: string
  toYearId: string
  fromClassId: string | null
  counts: PromotionPreviewCounts
  items: PromotionPreviewItem[]
}

// Input preview Mode A (Automatic) — WO P-1.
export interface AutomaticPromotionPreviewInput {
  mode: 'AUTOMATIC'
  fromYearId: string
  toYearId: string
  fromClassId?: string
}

// ===========================================================================
// WO P-2 (PROMOTION EXECUTE) — kontrak eksekusi + audit run.
// Sumber kebenaran: RFC §7A (eksekusi satu transaksi) + RFC §2.2 (audit).
// ===========================================================================

// Input eksekusi Mode A — P-2. fromClassId opsional (seluruh kelas tahun sumber
// bila tidak diisi); runBy = identitas pelaksana (audit, RFC §9).
export interface AutomaticPromotionExecuteInput {
  mode: 'AUTOMATIC'
  fromYearId: string
  toYearId: string
  fromClassId?: string
  runBy?: string
}

// PromotionRun.status (RFC §2.2, schema.prisma l.89).
// P-2 selalu SUCCESS (rollback penuh bila ada kegagalan); PARTIAL/FAILED untuk
// mode lain / WO berikutnya (P-4 retry strategy).
export type PromotionRunStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED'

// Satu baris audit eksekusi — mirror PromotionRunItem (RFC §2.2).
// memberName/sourceClassLabel/targetClassLabel = data display (bukan hitung
// ulang; semata join untuk keterbacaan manusia di halaman history P-3).
export interface PromotionRunItemDTO {
  id: string
  promotionRunId: string
  memberId: string
  memberName: string
  sourceClassId: string
  sourceClassLabel: string | null
  targetClassId: string | null
  targetClassLabel: string | null
  outcome: PromotionOutcome
  message: string | null
}

// Audit penuh sebuah run (RFC §9). summary = counts agregat (mirror preview,
// kontrak P-2, tetap dipertahankan); counts = versi history P-3 dengan kolom
// status akademik tambahan (transferred/dropped — default 0 untuk run yang
// tidak pernah memproduksi status tersebut). Semua nilai BERASAL dari kolom
// summary (PromotionRun) — TIDAK ada perhitungan ulang via decide().
export interface PromotionRunDTO {
  id: string
  fromYearId: string
  toYearId: string
  fromYearName: string
  toYearName: string
  mode: PromotionPreviewMode
  runBy: string | null
  status: PromotionRunStatus
  summary: PromotionPreviewCounts | null
  counts: PromotionRunSummaryCounts
  startedAt: string
  finishedAt: string | null
  items: PromotionRunItemDTO[]
}

// Ringkasan agregat history promosi (WO P-3) — hasil pembacaan kolom summary
// (PromotionRun). Delapan kolom sesuai Business Rule PO: Promoted, Graduated,
// Repeated, Redistributed, Transferred, Dropped, No Target, Error.
// transferred/dropped adalah status akademik (RFC §2.2) yang dapat muncul pada
// mode promosi lain; untuk run AUTOMATIC (P-2) nilainya 0.
export interface PromotionRunSummaryCounts {
  promoted: number
  repeated: number
  graduated: number
  redistributed: number
  transferred: number
  dropped: number
  noTarget: number
  error: number
}

// Satu baris daftar riwayat promosi (WO P-3) — ringkas, tanpa items.
export interface PromotionRunListItemDTO {
  id: string
  fromYearId: string
  toYearId: string
  fromYearName: string
  toYearName: string
  mode: PromotionPreviewMode
  runBy: string | null
  status: PromotionRunStatus
  counts: PromotionRunSummaryCounts
  startedAt: string
  finishedAt: string | null
  itemCount: number
}
