import { BorrowRepository } from '../repositories/borrow.repository'
import { generateQrCodeSvg } from './barcode.service'
import { COLLECTIVE_CARD_PAGE, paginateCollectiveCardRows } from '../../shared/config/collective-card'
import type { CollectiveCardCopyData, CollectiveCardData } from '../../shared/dto/collective-card'
import { AppError } from '../../../electron/main/errorHandler'

// Kartu Peminjaman Kolektif A4 — Single Source of Truth untuk Preview / Print / PDF.
// Pola sama seperti borrow-card.service.ts:
//   (a) DATA ASSEMBLER  buildCollectiveCardData(...) → CollectiveCardData (tanpa Electron API).
//   (b) TEMPLATE TUNGGAL generateCollectiveCardHtml(data) → HTML (pure function).
// Template hanya menerima CollectiveCardData; semua string sudah diformat.
// HANYA untuk borrowType COLLECTIVE — INDIVIDUAL ditolak (kartu individu tidak tersentuh).

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatCardDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${date.getFullYear()}`
}

function formatCardDateTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${formatCardDate(date)} ${hh}:${min}`
}

export interface CollectiveCardSourceSettings {
  libraryName: string
  schoolName: string
  address: string
  logoPath: string
  librarianName: string
}

export interface CollectiveCardBuildDeps {
  readFileAsDataUri: (path: string) => Promise<string | null>
}

type BorrowWithRelations = Awaited<ReturnType<BorrowRepository['findById']>>
type BorrowDetailRow = NonNullable<BorrowWithRelations>['details'][number]

function resolveIdentityNumber(member: { nip?: string | null; nuptk?: string | null } | null, memberNumber: string): string {
  const nip = member?.nip?.trim() ?? ''
  if (nip) return nip
  const nuptk = member?.nuptk?.trim() ?? ''
  if (nuptk) return nuptk
  return memberNumber
}

function toCopyData(detail: BorrowDetailRow, sequence: number): CollectiveCardCopyData {
  const returned = detail.returnedAt !== null
  return {
    sequence,
    inventoryNumber: detail.bookCopy?.inventoryNumber ?? '',
    barcode: detail.bookCopy?.barcode ?? null,
    bookTitle: detail.bookCopy?.book?.title ?? detail.bookTitle,
    returnedDate: detail.returnedAt ? formatCardDate(detail.returnedAt) : '',
    status: returned ? 'RETURNED' : 'BORROWED'
  }
}

export async function buildCollectiveCardData(
  borrowing: NonNullable<BorrowWithRelations>,
  settings: CollectiveCardSourceSettings,
  deps: CollectiveCardBuildDeps,
  now: Date = new Date()
): Promise<CollectiveCardData> {
  if ((borrowing as { borrowType?: string }).borrowType !== 'COLLECTIVE') {
    throw new AppError(400, 'Validation Error', 'Kartu kolektif hanya tersedia untuk peminjaman kolektif')
  }
  const fullName = borrowing.member?.fullName ?? borrowing.memberName
  const memberNumber = borrowing.member?.memberNumber ?? borrowing.memberNumber
  const logo = settings.logoPath ? await deps.readFileAsDataUri(settings.logoPath) : null

  const sorted = [...borrowing.details].sort((a, b) =>
    (a.bookCopy?.inventoryNumber ?? '').localeCompare(b.bookCopy?.inventoryNumber ?? '')
  )
  const copies = sorted.map((d, i) => toCopyData(d, i + 1))
  const returnedCount = copies.filter((c) => c.status === 'RETURNED').length

  return {
    school: {
      libraryName: settings.libraryName,
      schoolName: settings.schoolName,
      address: settings.address,
      logo: logo ?? ''
    },
    teacher: {
      fullName,
      memberNumber,
      identityNumber: resolveIdentityNumber(borrowing.member, memberNumber)
    },
    borrow: {
      borrowId: borrowing.id,
      borrowNumber: borrowing.borrowNumber,
      borrowDate: formatCardDate(borrowing.borrowDate),
      dueDate: formatCardDate(borrowing.dueDate),
      purpose: borrowing.purpose ?? '',
      collectiveClassName: borrowing.collectiveClassName,
      notes: borrowing.notes
    },
    copies,
    summary: {
      totalCopies: copies.length,
      returnedCount,
      outstandingCount: copies.length - returnedCount
    },
    qrSvg: generateQrCodeSvg(borrowing.id),
    printedAt: formatCardDateTime(now)
  }
}

// ---------------------------------------------------------------------------
// Template TUNGGAL — pure function. A4 portrait, margin cetak ±13mm,
// grayscale (aman printer hitam-putih), font sistem.
// ---------------------------------------------------------------------------

function logoHtml(logo: string): string {
  if (logo) return `<img class="logo" src="${escapeHtml(logo)}" alt="Logo">`
  return `<div class="logo-empty"></div>`
}

function sheetHeaderHtml(data: CollectiveCardData, page: number, totalPages: number, isFirst: boolean): string {
  const titleBlock = isFirst
    ? `<div class="doc-title"><h1>KARTU PEMINJAMAN KOLEKTIF</h1><div class="doc-number">${escapeHtml(data.borrow.borrowNumber)}</div></div>`
    : ''
  return `<div class="doc-head">
    <div class="school">
      ${logoHtml(data.school.logo)}
      <div class="school-text">
        <div class="library">${escapeHtml(data.school.libraryName)}</div>
        ${data.school.schoolName ? `<div class="school-name">${escapeHtml(data.school.schoolName)}</div>` : ''}
        ${data.school.address ? `<div class="school-addr">${escapeHtml(data.school.address)}</div>` : ''}
      </div>
    </div>
    <div class="qr">${data.qrSvg}</div>
  </div>
  ${titleBlock}
  <div class="page-line">Halaman ${page} dari ${totalPages} &nbsp;•&nbsp; ${escapeHtml(data.borrow.borrowNumber)}</div>`
}

function infoBlockHtml(data: CollectiveCardData): string {
  const b = data.borrow
  const t = data.teacher
  const classRow = b.collectiveClassName
    ? `<div class="info-row"><span class="k">Kelas</span><span class="v">${escapeHtml(b.collectiveClassName)}</span></div>`
    : ''
  return `<div class="info-grid">
    <div class="info-col">
      <div class="info-row"><span class="k">Guru Penanggung Jawab</span><span class="v">${escapeHtml(t.fullName)}</span></div>
      <div class="info-row"><span class="k">No. Anggota / NIP</span><span class="v">${escapeHtml(t.identityNumber)}</span></div>
      <div class="info-row"><span class="k">Keperluan</span><span class="v">${escapeHtml(b.purpose)}</span></div>
      ${classRow}
    </div>
    <div class="info-col">
      <div class="info-row"><span class="k">Tanggal Pinjam</span><span class="v">${escapeHtml(b.borrowDate)}</span></div>
      <div class="info-row"><span class="k">Jatuh Tempo</span><span class="v">${escapeHtml(b.dueDate)}</span></div>
      <div class="info-row"><span class="k">Total Eksemplar</span><span class="v">${data.summary.totalCopies}</span></div>
    </div>
  </div>`
}

function tableHeadHtml(): string {
  return `<thead><tr><th class="c-no">No</th><th class="c-inv">No. Inventaris</th><th class="c-bar">Barcode</th><th class="c-title">Judul</th><th class="c-back">Tgl Kembali</th><th class="c-sign">Paraf</th></tr></thead>`
}

function copyRowHtml(copy: CollectiveCardCopyData): string {
  return `<tr><td class="c-no">${copy.sequence}</td><td class="c-inv">${escapeHtml(copy.inventoryNumber)}</td><td class="c-bar">${escapeHtml(copy.barcode ?? '')}</td><td class="c-title"><div class="ttl">${escapeHtml(copy.bookTitle)}</div></td><td class="c-back">${escapeHtml(copy.returnedDate)}</td><td class="c-sign"></td></tr>`
}

function summaryBlockHtml(data: CollectiveCardData, termsText: string): string {
  const s = data.summary
  return `<div class="summary">
    <div class="summary-row"><span>Total eksemplar</span><strong>${s.totalCopies}</strong></div>
    <div class="summary-row"><span>Sudah kembali</span><strong>${s.returnedCount}</strong></div>
    <div class="summary-row"><span>Belum kembali</span><strong>${s.outstandingCount}</strong></div>
  </div>
  <div class="terms">${escapeHtml(termsText)}</div>`
}

function signatureBlockHtml(data: CollectiveCardData): string {
  return `<div class="signatures">
    <div class="sig-box">
      <div class="sig-place">……………, ${escapeHtml(data.borrow.borrowDate)}</div>
      <div class="sig-title">Guru Penanggung Jawab</div>
      <div class="sig-space"></div>
      <div class="sig-name">(${escapeHtml(data.teacher.fullName)})</div>
    </div>
    <div class="sig-box">
      <div class="sig-place">&nbsp;</div>
      <div class="sig-title">Petugas Perpustakaan</div>
      <div class="sig-space"></div>
      <div class="sig-name">(………………………………)</div>
    </div>
  </div>
  <div class="printed-at">Dicetak: ${escapeHtml(data.printedAt)}</div>`
}

export interface CollectiveCardTemplateOptions {
  termsText: string
}

export function generateCollectiveCardHtml(data: CollectiveCardData, options: CollectiveCardTemplateOptions): string {
  const pagination = paginateCollectiveCardRows(data.copies.length)
  const contentPages = pagination.pages.length === 0 ? 1 : pagination.pages.length
  const totalPages = contentPages + (pagination.signaturePage === 'new' ? 1 : 0)
  const { paddingMm } = COLLECTIVE_CARD_PAGE

  let offset = 0
  const sheets: string[] = []
  pagination.pages.forEach((rowCount, pageIndex) => {
    const page = pageIndex + 1
    const rows = data.copies.slice(offset, offset + rowCount).map(copyRowHtml).join('')
    offset += rowCount
    const isFirst = pageIndex === 0
    const isLastContent = pageIndex === pagination.pages.length - 1
    const closing =
      isLastContent && pagination.signaturePage === 'last'
        ? `${summaryBlockHtml(data, options.termsText)}${signatureBlockHtml(data)}`
        : ''
    sheets.push(`<div class="a4-sheet">
      ${sheetHeaderHtml(data, page, totalPages, isFirst)}
      ${isFirst ? infoBlockHtml(data) : ''}
      <table class="books">${tableHeadHtml()}<tbody>${rows}</tbody></table>
      ${closing}
      <div class="page-foot">Halaman ${page} dari ${totalPages} &nbsp;•&nbsp; ${escapeHtml(data.borrow.borrowNumber)}</div>
    </div>`)
  })

  if (pagination.signaturePage === 'new') {
    const page = totalPages
    sheets.push(`<div class="a4-sheet">
      ${sheetHeaderHtml(data, page, totalPages, false)}
      ${summaryBlockHtml(data, options.termsText)}${signatureBlockHtml(data)}
      <div class="page-foot">Halaman ${page} dari ${totalPages} &nbsp;•&nbsp; ${escapeHtml(data.borrow.borrowNumber)}</div>
    </div>`)
  }

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Kartu Peminjaman Kolektif - ${escapeHtml(data.borrow.borrowNumber)}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { background: #e5e7eb; font-family: Arial, 'Segoe UI', sans-serif; color: #111111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .a4-sheet { width: 210mm; min-height: 297mm; margin: 8px auto; padding: ${paddingMm}mm; background: #ffffff; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.14); page-break-after: always; break-after: page; display: flex; flex-direction: column; }
  .a4-sheet:last-of-type { page-break-after: auto; break-after: auto; }

  .doc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; border-bottom: 1mm solid #111111; padding-bottom: 4mm; }
  .school { display: flex; gap: 4mm; align-items: center; min-width: 0; }
  .logo { width: 18mm; height: 18mm; object-fit: contain; }
  .logo-empty { width: 18mm; height: 18mm; border: 0.4mm solid #666666; }
  .library { font-size: 16pt; font-weight: 800; }
  .school-name { font-size: 10pt; font-weight: 700; color: #333333; }
  .school-addr { font-size: 8pt; color: #555555; }
  .qr { width: 30mm; height: 30mm; flex: 0 0 30mm; }
  .qr svg { width: 100%; height: 100%; }
  .doc-title { text-align: center; margin: 5mm 0 2mm; }
  .doc-title h1 { font-size: 15pt; letter-spacing: 0.06em; margin: 0; }
  .doc-number { font-size: 11pt; font-weight: 700; margin-top: 1mm; }
  .page-line { text-align: right; font-size: 7.5pt; color: #555555; margin-bottom: 3mm; }

  .info-grid { display: flex; gap: 8mm; border: 0.4mm solid #333333; padding: 3mm 4mm; margin-bottom: 4mm; }
  .info-col { flex: 1; min-width: 0; }
  .info-row { display: flex; gap: 3mm; font-size: 9pt; margin-bottom: 1.6mm; }
  .info-row:last-child { margin-bottom: 0; }
  .info-row .k { flex: 0 0 38mm; font-weight: 700; color: #333333; }
  .info-row .v { flex: 1; min-width: 0; overflow: hidden; }

  table.books { width: 100%; border-collapse: collapse; font-size: 9pt; }
  table.books thead { display: table-header-group; }
  table.books th { background: #111111; color: #ffffff; font-weight: 700; padding: 2mm; text-align: left; }
  table.books td { height: 8mm; padding: 0 2mm; border-bottom: 0.25mm solid #999999; vertical-align: middle; }
  table.books tr { page-break-inside: avoid; break-inside: avoid; }
  .c-no { width: 10mm; text-align: center; }
  .c-inv { width: 32mm; font-family: Consolas, 'Courier New', monospace; }
  .c-bar { width: 32mm; font-family: Consolas, 'Courier New', monospace; }
  .c-back { width: 26mm; text-align: center; }
  .c-sign { width: 22mm; }
  .c-title { overflow: hidden; }
  .c-title .ttl { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 4mm; max-height: 8mm; }

  .summary { margin-top: 5mm; border: 0.4mm solid #333333; padding: 3mm 4mm; font-size: 9.5pt; }
  .summary-row { display: flex; justify-content: space-between; margin-bottom: 1.2mm; }
  .summary-row:last-child { margin-bottom: 0; }
  .terms { margin-top: 3mm; font-size: 8.5pt; color: #333333; line-height: 1.5; }
  .signatures { display: flex; gap: 12mm; margin-top: 6mm; }
  .sig-box { flex: 1; text-align: center; font-size: 9pt; }
  .sig-place { text-align: right; margin-bottom: 2mm; }
  .sig-title { font-weight: 700; }
  .sig-space { height: 18mm; }
  .sig-name { font-weight: 700; }
  .printed-at { margin-top: 4mm; font-size: 7.5pt; color: #555555; }
  .page-foot { margin-top: auto; padding-top: 3mm; text-align: center; font-size: 7.5pt; color: #555555; }

  @media print {
    body { background: #ffffff; }
    .a4-sheet { margin: 0; box-shadow: none; }
  }
</style>
</head>
<body>
${sheets.join('\n')}
</body>
</html>`
}

export class CollectiveBorrowCardService {
  constructor(private borrowRepository: BorrowRepository) {}

  async getCollectiveCard(
    borrowId: string,
    settings: CollectiveCardSourceSettings,
    deps: CollectiveCardBuildDeps,
    now?: Date
  ): Promise<CollectiveCardData> {
    const borrowing = await this.borrowRepository.findById(borrowId)
    if (!borrowing) {
      throw new AppError(404, 'Not Found', 'Data peminjaman tidak ditemukan.')
    }
    return buildCollectiveCardData(borrowing, settings, deps, now)
  }
}
