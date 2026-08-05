import type { BorrowCardData, BorrowCardBookData } from '../../shared/dto/borrow-card'
import { borrowStatusConfig, deriveBorrowStatus } from '../../shared/config/borrow-status'
import { memberTypeLabel } from '../../shared/config/member-type'
import { generateQrCodeSvg } from './barcode.service'

// WO-1 — Borrow Card Engine (Single Source of Truth untuk Preview / Print / PDF).
// Source of truth desain: BORROW_RECEIPT_DESIGN_AMENDMENT.md (FINAL DESIGN DECISION).
//
// Dua bagian wajib terpisah:
//   (a) DATA ASSEMBLER  buildBorrowCardData(...) → BorrowCardData (murni, tanpa Electron API).
//   (b) TEMPLATE TUNGGAL generateBorrowCardHtml(data) → HTML (pure function; TIDAK membaca DB).
// Template hanya menerima BorrowCardData; semua string sudah diformat, SVG sudah di-generate.

// ---------------------------------------------------------------------------
// Layout — kartu 110mm × 60mm landscape (D4). Ukuran fixed per halaman.
// Kapasitas baris buku dihitung dari mm yang SAMA dengan yang dipakai CSS,
// sehingga pagination deterministik dan tidak ada overflow (D10).
// ---------------------------------------------------------------------------
// WO-1 BORROW CARD LAYOUT v1.1 — optimasi kapasitas daftar buku.
//  - Jumlah + Status (AKTIF) pindah ke pojok kanan ATAS (header-info).
//  - Footer kiri bawah dikosongkan → zona daftar buku bertambah.
//  - Body dikurangi 20→18mm & footer 10→9mm untuk memberi ruang list.
//  - Baris buku dirapatkan 3.4→2.8mm; judul diperkecil ke 8pt (dominant di list).
//  Kapasitas: halaman 1 = 5 buku (sebelumnya 3), lanjutan = 13 (sebelumnya 10).
export const BORROW_CARD_LAYOUT = {
  pageWidthMm: 110,
  pageHeightMm: 60,
  paddingMm: 3,
  bookRowHeightMm: 2.8,
  pageOne: { headerMm: 12, bodyMm: 18, footerMm: 9 },
  continuation: { headerMm: 8, footerMm: 9 }
} as const

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Inisial untuk avatar/logo fallback (D6, D13):
//   multi-kata → huruf awal 2 kata pertama ("SMP Negeri 1 Tunas Bangsa" → "SN");
//   satu kata  → 2 huruf pertama ("APLibrary" → "AP").
export function initialsOf(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
}

// Avatar placeholder inline SVG (D6) — self-contained, tanpa aset eksternal.
export function generateAvatarPlaceholderSvg(fullName: string): string {
  const initials = escapeHtml(initialsOf(fullName))
  if (!initials) {
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="10" fill="#eff6ff"/><circle cx="50" cy="36" r="18" fill="#bfdbfe"/><path d="M50 60c-18 0-30 12-30 28h60C80 72 68 60 50 60z" fill="#bfdbfe"/></svg>`
  }
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="10" fill="#eff6ff"/><circle cx="50" cy="50" r="44" fill="#dbeafe" stroke="#bfdbfe" stroke-width="2"/><text x="50" y="50" dominant-baseline="central" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#1d4ed8">${initials}</text></svg>`
}

// Logo fallback monogram inline SVG (D13) — inisial schoolName/libraryName.
export function generateLogoMonogramSvg(schoolName: string, libraryName: string): string {
  const source = schoolName.trim() || libraryName.trim()
  const initials = escapeHtml(initialsOf(source))
  if (!initials) return generateBookIconSvg()
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="14" fill="#1d4ed8"/><text x="32" y="32" dominant-baseline="central" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#ffffff">${initials}</text></svg>`
}

// Fallback terakhir (D13): schoolName dan libraryName sama-sama kosong → ikon buku.
export function generateBookIconSvg(): string {
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="14" fill="#1d4ed8"/><path d="M32 15c-4-2.5-9-3.5-14-3.5V45c5 0 10 1 14 3.5 4-2.5 9-3.5 14-3.5V11.5c-5 0-10 1-14 3.5z" fill="#ffffff" opacity="0.92"/><path d="M32 15v33.5" stroke="#1d4ed8" stroke-width="1.6" fill="none"/></svg>`
}

function formatCardDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${date.getFullYear()}`
}

// ---------------------------------------------------------------------------
// Pagination (D10 / R4) — auto pagination, seluruh buku tampil, tanpa "+N lainnya".
// ---------------------------------------------------------------------------
export interface BorrowCardPage {
  isFirst: boolean
  startIndex: number
  endIndex: number
}

function booksZoneCapacity(isFirst: boolean): number {
  const { pageHeightMm, paddingMm, bookRowHeightMm, pageOne, continuation } = BORROW_CARD_LAYOUT
  const contentHeightMm = pageHeightMm - paddingMm * 2
  const fixedMm = isFirst
    ? pageOne.headerMm + pageOne.bodyMm + pageOne.footerMm
    : continuation.headerMm + continuation.footerMm
  return Math.max(1, Math.floor((contentHeightMm - fixedMm) / bookRowHeightMm))
}

export function paginateBorrowCard(booksCount: number): BorrowCardPage[] {
  if (booksCount <= 0) {
    return [{ isFirst: true, startIndex: 0, endIndex: 0 }]
  }
  const firstCapacity = booksZoneCapacity(true)
  const continuationCapacity = booksZoneCapacity(false)
  const pages: BorrowCardPage[] = []
  let cursor = 0
  const firstCount = Math.min(booksCount, firstCapacity)
  pages.push({ isFirst: true, startIndex: 0, endIndex: firstCount })
  cursor = firstCount
  while (cursor < booksCount) {
    const end = Math.min(cursor + continuationCapacity, booksCount)
    pages.push({ isFirst: false, startIndex: cursor, endIndex: end })
    cursor = end
  }
  return pages
}

// ---------------------------------------------------------------------------
// Template TUNGGAL — pure function, tanpa Electron API / DB.
// ---------------------------------------------------------------------------
function bookRowHtml(book: BorrowCardBookData, index: number): string {
  return `<div class="book-row"><span class="num">${index + 1}.</span><span class="title">${escapeHtml(book.title)}</span><span class="inv">${escapeHtml(book.inventoryNumber)}</span></div>`
}

function logoElementHtml(data: BorrowCardData): string {
  if (data.header.logo) {
    return `<img class="logo-img" src="${escapeHtml(data.header.logo)}" alt="Logo Perpustakaan">`
  }
  return generateLogoMonogramSvg(data.header.schoolName, data.header.libraryName)
}

function headerInfoHtml(data: BorrowCardData): string {
  const status = borrowStatusConfig(data.footer.borrowStatus)
  return `<div class="header-info"><span class="qty">Jumlah: ${data.footer.totalBooks}</span><span class="badge ${status.className}">${escapeHtml(status.label)}</span></div>`
}

function headerHtml(data: BorrowCardData, isFirst: boolean): string {
  const headerClass = isFirst ? 'header' : 'header continue'
  const logoClass = isFirst ? 'logo' : 'logo continue'
  const logoHtml = `<div class="${logoClass}">${logoElementHtml(data)}</div>`

  if (isFirst) {
    return `<div class="${headerClass}">
  ${logoHtml}
  <div class="header-text">
    <div class="lib-name">${escapeHtml(data.header.libraryName)}</div>
    <div class="school-name">${escapeHtml(data.header.schoolName)}</div>
  </div>
  ${headerInfoHtml(data)}
</div>`
  }
  return `<div class="${headerClass}">
  ${logoHtml}
  <div class="header-text">
    <div class="lib-name">${escapeHtml(data.header.libraryName)}</div>
    <div class="school-name"><span class="continue-label">LANJUTAN</span> &middot; ${escapeHtml(data.borrow.borrowNumber)}</div>
  </div>
  ${headerInfoHtml(data)}
</div>`
}

function memberRowHtml(label: string, value: string): string {
  return `<div class="row"><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`
}

function bodyHtml(data: BorrowCardData): string {
  const m = data.member
  const className = m.className ? memberRowHtml('Kelas', m.className) : ''
  const memberType = m.memberType ? memberRowHtml('Jenis', m.memberType) : ''
  return `<div class="body">
  <div class="avatar">${m.avatarPlaceholder || generateAvatarPlaceholderSvg(m.fullName)}</div>
  <div class="col">
    ${memberRowHtml('Nama', m.fullName)}
    ${memberRowHtml('No. Anggota', m.memberNumber)}
    ${memberType}
    ${className}
  </div>
  <div class="col">
    ${memberRowHtml('No. Pinjam', data.borrow.borrowNumber)}
    ${memberRowHtml('Tgl Pinjam', data.borrow.borrowDate)}
    ${memberRowHtml('Jatuh Tempo', data.borrow.dueDate)}
    ${memberRowHtml('Petugas', data.footer.officerName)}
  </div>
</div>`
}

function booksZoneHtml(data: BorrowCardData, page: BorrowCardPage): string {
  const rows = data.books
    .slice(page.startIndex, page.endIndex)
    .map((book, i) => bookRowHtml(book, page.startIndex + i))
    .join('')
  return `<div class="books">${rows}</div>`
}

function footerHtml(data: BorrowCardData): string {
  return `<div class="footer">
  <div class="qr">${data.footer.qrSvg}</div>
  <div class="sign"><div class="line"></div><div class="officer">(${escapeHtml(data.footer.officerName)})</div></div>
</div>`
}

// Satu kartu (satu halaman 110×60mm). Halaman 2+ = kartu lanjutan (R4).
export function generateBorrowCardPageHtml(data: BorrowCardData, page: BorrowCardPage): string {
  if (page.isFirst) {
    return `<div class="borrow-card">
${headerHtml(data, true)}
${bodyHtml(data)}
${booksZoneHtml(data, page)}
${footerHtml(data)}
</div>`
  }
  return `<div class="borrow-card">
${headerHtml(data, false)}
${booksZoneHtml(data, page)}
${footerHtml(data)}
</div>`
}

// Auto pagination — hasilkan ARRAY halaman kartu (D10 / scope WO-1 item 5).
export function generateBorrowCardPages(data: BorrowCardData): string[] {
  return paginateBorrowCard(data.books.length).map((page) => generateBorrowCardPageHtml(data, page))
}

// Dokumen HTML lengkap — SATU-SATUNYA template untuk Preview / Print / PDF.
export function generateBorrowCardHtml(data: BorrowCardData): string {
  const pages = generateBorrowCardPages(data)
    .map((page) => `<div class="sheet">${page}</div>`)
    .join('\n')

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Kartu Peminjaman</title>
<style>
  @page { size: 110mm 60mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { background: #eef2f7; font-family: Arial, 'Segoe UI', sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { margin: 8px auto; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.14); page-break-after: always; break-after: page; }
  .sheet:last-of-type { page-break-after: auto; break-after: auto; }
  .borrow-card {
    width: 110mm; height: 60mm; padding: 3mm;
    display: flex; flex-direction: column;
    border: 1px solid #cbd5e1; border-radius: 2mm; background: #ffffff;
    overflow: hidden;
  }
  .header { display: flex; align-items: center; gap: 3mm; height: 12mm; border-bottom: 1px solid #e2e8f0; }
  .header.continue { height: 8mm; }
  .logo { width: 10mm; height: 10mm; flex: 0 0 10mm; display: flex; align-items: center; justify-content: center; border: 1px solid #cbd5e1; border-radius: 2mm; padding: 0.5mm; background: #ffffff; }
  .logo.continue { width: 7mm; height: 7mm; flex-basis: 7mm; }
  .logo svg, .logo-img { width: 100%; height: 100%; }
  .logo-img { object-fit: contain; }
  .header-text { line-height: 1.15; min-width: 0; flex: 1; overflow: hidden; }
  .lib-name { font-size: 9pt; font-weight: 700; color: #1d4ed8; text-transform: uppercase; }
  .school-name { font-size: 7pt; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .continue-label { font-size: 6pt; font-weight: 600; color: #64748b; }
  .header-info { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 0.6mm; margin-left: 2mm; }
  .header-info .qty { font-size: 6.5pt; font-weight: 600; color: #1f2937; white-space: nowrap; }
  .header-info .badge { margin-top: 0; }
  .body { display: flex; gap: 3mm; height: 18mm; margin-top: 0; align-items: stretch; }
  .avatar { width: 18mm; height: 18mm; flex: 0 0 18mm; display: flex; align-items: center; justify-content: center; }
  .avatar svg { width: 100%; height: 100%; }
  .col { flex: 1; min-width: 0; font-size: 6.5pt; display: flex; flex-direction: column; justify-content: center; gap: 1mm; }
  .row { display: flex; }
  .row b { flex: 0 0 21mm; font-weight: 600; color: #475569; }
  .row span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .books { flex: 1; min-height: 0; overflow: hidden; margin-top: 0; }
  .book-row { display: flex; justify-content: space-between; gap: 3mm; font-size: 8pt; line-height: 2.8mm; margin-bottom: 0; }
  .book-row .num { flex: 0 0 5mm; font-size: 6.5pt; color: #64748b; }
  .book-row .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .book-row .inv { flex: 0 0 auto; font-family: Consolas, 'Courier New', monospace; font-size: 6.5pt; }
  .footer { display: flex; align-items: flex-end; gap: 4mm; height: 9mm; margin-top: 0.5mm; }
  .badge { display: inline-block; padding: 0.5mm 2mm; border-radius: 1mm; font-size: 6pt; font-weight: 700; letter-spacing: 0.3px; margin-top: 1mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .badge-active   { background: #dcfce7; color: #166534; }
  .badge-returned { background: #e2e8f0; color: #334155; }
  .badge-overdue  { background: #fee2e2; color: #991b1b; }
  .badge-neutral  { background: #e2e8f0; color: #334155; }
  .qr { width: 9mm; height: 9mm; flex: 0 0 9mm; margin-left: auto; }
  .qr svg { width: 100%; height: 100%; }
  .sign { font-size: 6pt; text-align: center; }
  .sign .line { border-top: 1px solid #1f2937; width: 18mm; }
  .sign .officer { margin-top: 0.6mm; }
  @media print {
    body { background: #ffffff; }
    .sheet { margin: 0; box-shadow: none; }
  }
</style>
</head>
<body>
${pages}
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Data assembler — menyiapkan BorrowCardData dari hasil repository read-only.
// TIDAK mengubah BorrowService / Repository / Database (scope WO-1 item 10).
// ---------------------------------------------------------------------------
export interface BorrowCardSourceMember {
  fullName: string
  memberNumber: string
  memberType: string | null
}

export interface BorrowCardSourceBorrowing {
  id: string
  borrowNumber: string
  borrowDate: Date
  dueDate: Date
  returnDate: Date | null
  memberName: string
  memberNumber: string
  className: string | null
  member: BorrowCardSourceMember | null
  details: Array<{
    bookTitle: string
    bookCopy: { inventoryNumber: string; book: { title: string } } | null
  }>
}

export interface BorrowCardSourceSettings {
  libraryName: string
  schoolName: string
  logoPath: string
  librarianName: string
}

export interface BorrowCardBuildDeps {
  readFileAsDataUri: (path: string) => Promise<string | null>
}

export async function buildBorrowCardData(
  borrowing: BorrowCardSourceBorrowing,
  settings: BorrowCardSourceSettings,
  deps: BorrowCardBuildDeps
): Promise<BorrowCardData> {
  const fullName = borrowing.member?.fullName ?? borrowing.memberName
  const memberNumber = borrowing.member?.memberNumber ?? borrowing.memberNumber
  const memberType = memberTypeLabel(borrowing.member?.memberType) ?? borrowing.member?.memberType ?? ''

  const logo = settings.logoPath ? await deps.readFileAsDataUri(settings.logoPath) : null

  return {
    header: {
      logo: logo ?? '',
      schoolName: settings.schoolName,
      libraryName: settings.libraryName
    },
    member: {
      memberNumber,
      fullName,
      memberType,
      className: borrowing.className,
      avatarPlaceholder: generateAvatarPlaceholderSvg(fullName)
    },
    borrow: {
      borrowId: borrowing.id,
      borrowNumber: borrowing.borrowNumber,
      borrowDate: formatCardDate(borrowing.borrowDate),
      dueDate: formatCardDate(borrowing.dueDate)
    },
    books: borrowing.details.map((d) => ({
      title: d.bookCopy?.book?.title ?? d.bookTitle,
      inventoryNumber: d.bookCopy?.inventoryNumber ?? ''
    })),
    footer: {
      totalBooks: borrowing.details.length,
      borrowStatus: deriveBorrowStatus(borrowing.returnDate, borrowing.dueDate),
      qrSvg: generateQrCodeSvg(borrowing.id),
      officerName: settings.librarianName
    }
  }
}
