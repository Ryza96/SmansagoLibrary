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
export interface PromotionRunItemDTO {
  id: string
  promotionRunId: string
  memberId: string
  sourceClassId: string
  targetClassId: string | null
  outcome: PromotionOutcome
  message: string | null
}

// Audit penuh sebuah run (RFC §9). summary = counts agregat (mirror preview).
export interface PromotionRunDTO {
  id: string
  fromYearId: string
  toYearId: string
  mode: PromotionPreviewMode
  runBy: string | null
  status: PromotionRunStatus
  summary: PromotionPreviewCounts | null
  startedAt: string
  finishedAt: string | null
  items: PromotionRunItemDTO[]
}
