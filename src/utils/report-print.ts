// Report Module — Helper murni Laporan Cetak A4 (TAHAP 3, UI).
// Seluruh fungsi di sini TANPA React/DOM/Electron agar dapat diuji Vitest:
//  - pembuat request cetak dari filter layar (page/limit TIDAK dikirim),
//  - pembaca state navigasi preview (state hilang saat refresh → null),
//  - pemecah HTML dokumen menjadi <style> + per-elemen .a4-sheet untuk
//    render bertahap preview (dokumen hingga ~170 halaman pada 5.000 baris).
import type { ReportPrintRequest, ReportPrintType } from '../shared/dto/report-print'

export const REPORT_PRINT_TYPES: ReportPrintType[] = ['borrowings', 'returns', 'overdues', 'members', 'collections']

// Konversi nilai input date (YYYY-MM-DD) menjadi ISO tengah malam WAKTU LOKAL
// — rumus yang SAMA dengan yang dipakai 5 halaman laporan layar
// (toFilterDate lokal di tiap halaman; fungsi ini satu-satunya salinan di
// luar halaman agar request cetak identik dengan yang dikirim layar).
export function toFilterDate(value: string): string {
  return value ? new Date(`${value}T00:00:00`).toISOString() : ''
}

// Konversi ISO kembali ke nilai input date lokal (untuk inisialisasi ulang
// filter halaman laporan saat kembali dari preview dengan filter utuh).
export function toDateInputValue(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// ---------------------------------------------------------------------------
// Pembuat request cetak — nilai SAMA PERSIS dengan yang dikirim layar ke
// reports:* (periode kosong → '' → backend memakai hari ini, persis layar).
// ---------------------------------------------------------------------------

export function buildBorrowingsPrintRequest(
  from: string,
  to: string,
  status: string,
  search: string
): ReportPrintRequest {
  return {
    type: 'borrowings',
    filter: {
      from: toFilterDate(from),
      to: toFilterDate(to),
      status: (status || undefined) as 'ACTIVE' | 'COMPLETED' | 'OVERDUE' | undefined,
      search: search || undefined
    }
  }
}

export function buildReturnsPrintRequest(from: string, to: string, search: string): ReportPrintRequest {
  return { type: 'returns', filter: { from: toFilterDate(from), to: toFilterDate(to), search: search || undefined } }
}

export function buildOverduesPrintRequest(from: string, to: string, search: string): ReportPrintRequest {
  return { type: 'overdues', filter: { from: toFilterDate(from), to: toFilterDate(to), search: search || undefined } }
}

export function buildMembersPrintRequest(status: string, classId: string, search: string): ReportPrintRequest {
  return {
    type: 'members',
    filter: {
      status: (status || undefined) as 'ACTIVE' | 'INACTIVE' | undefined,
      classId: classId || undefined,
      search: search || undefined
    }
  }
}

export function buildCollectionsPrintRequest(categoryId: string, search: string): ReportPrintRequest {
  return { type: 'collections', filter: { categoryId: categoryId || undefined, search: search || undefined } }
}

// ---------------------------------------------------------------------------
// State navigasi preview (react-router state, bukan query string — filter
// berisi tanggal ISO & teks pencarian; state tidak membocorkan isi filter ke
// URL/riwayat, dan halaman preview dirancang untuk state hilang saat refresh
// dengan pesan ramah, bukan crash).
// ---------------------------------------------------------------------------

export interface ReportPrintNavState {
  request: ReportPrintRequest
  /** Route halaman laporan asal (untuk tombol kembali dengan filter utuh). */
  fromPath: string
}

export function readReportPrintState(state: unknown): ReportPrintNavState | null {
  if (!state || typeof state !== 'object') return null
  const candidate = state as { request?: unknown; fromPath?: unknown }
  if (!candidate.request || typeof candidate.request !== 'object') return null
  const request = candidate.request as { type?: unknown; filter?: unknown }
  if (typeof request.type !== 'string' || !REPORT_PRINT_TYPES.includes(request.type as ReportPrintType)) return null
  if (!request.filter || typeof request.filter !== 'object' || Array.isArray(request.filter)) return null
  return {
    request: request as unknown as ReportPrintRequest,
    fromPath: typeof candidate.fromPath === 'string' && candidate.fromPath !== '' ? candidate.fromPath : '/reports'
  }
}

// Filter mentah dari state navigasi (untuk inisialisasi ulang halaman
// laporan saat kembali dari preview). Pemanggil meng-cast ke tipe filternya.
export function extractNavFilter(state: unknown): Record<string, unknown> | null {
  const nav = readReportPrintState(state)
  return nav ? (nav.request.filter as Record<string, unknown>) : null
}

// ---------------------------------------------------------------------------
// Pemecah HTML dokumen preview — { styleText, sheets }.
// Dokumen dibuat generateReportPrintHtml (TAHAP 2): tepat satu <style> di
// <head> dan N elemen <section class="a4-sheet..."> berurutan. Pemecahan
// dilakukan per tanda awal sheet (bukan regex </section> non-greedy karena
// sheet dapat memuat <section> bersarang untuk blok total/catatan/tanda
// tangan). styleText dipertahankan utuh agar CSS dokumen (termasuk
// --report-logo-url) tetap berlaku saat sheet dirender sebagian.
// ---------------------------------------------------------------------------

export interface SplitReportPrintHtml {
  styleText: string
  sheets: string[]
}

const SHEET_START = '<section class="a4-sheet'

export function splitReportPrintHtml(html: string): SplitReportPrintHtml {
  const styleMatch = /<style>([\s\S]*?)<\/style>/.exec(html)
  const styleText = styleMatch ? styleMatch[1] : ''

  const starts: number[] = []
  let fromIndex = 0
  for (;;) {
    const at = html.indexOf(SHEET_START, fromIndex)
    if (at === -1) break
    starts.push(at)
    fromIndex = at + SHEET_START.length
  }
  if (starts.length === 0) return { styleText, sheets: [] }

  const sheets = starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : html.length
    let chunk = html.slice(start, end)
    // Sheet terakhir diikuti </body></html> — buang sisa di luar dokumen.
    const bodyClose = chunk.indexOf('</body>')
    if (bodyClose !== -1) chunk = chunk.slice(0, bodyClose)
    return chunk.trim()
  })
  return { styleText, sheets }
}
