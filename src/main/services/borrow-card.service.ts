import type { BorrowCardData, BorrowCardBookData } from '../../shared/dto/borrow-card'
import { deriveBorrowStatus } from '../../shared/config/borrow-status'
import { memberTypeLabel } from '../../shared/config/member-type'
import { generateQrCodeSvg } from './barcode.service'

// WO-A6 — Borrow Card Engine (Single Source of Truth untuk Preview / Print / PDF).
// Source of truth desain: design-reference/kartu-a6-preview.html (A6 Portrait 105×148mm).
//
// Dua bagian wajib terpisah:
//   (a) DATA ASSEMBLER  buildBorrowCardData(...) → BorrowCardData (murni, tanpa Electron API).
//   (b) TEMPLATE TUNGGAL generateBorrowCardHtml(data) → HTML (pure function; TIDAK membaca DB).
// Template hanya menerima BorrowCardData; semua string sudah diformat, SVG sudah di-generate.

// ---------------------------------------------------------------------------
// Layout — kartu A6 Portrait 105mm × 148mm (menggantikan 110×60 landscape).
// TANPA pagination (keputusan PO): SATU kartu = SATU halaman, SEMUA baris buku
// dirender apa pun jumlahnya. Aturan operasional maksimal 5 buku per transaksi;
// bila suatu saat >5 baris, kartu boleh tampil padat — TODO: evaluasi ulang
// layout bila aturan berubah, jangan memecah ke beberapa halaman.
// Struktur kartu:
//   header 20mm (logo-icon + brand + blok navy "KARTU PEMINJAMAN") + strip 1mm
//   body   = QR 26mm + info peminjaman (tgl/jatuh tempo/petugas) + box DATA ANGGOTA
//   books  = label "DAFTAR BUKU" + tabel 4 kolom (No. / Judul Buku / Kode Inv. / Jml)
//   footer 10mm (strip navy bermotto)
// ---------------------------------------------------------------------------
export const BORROW_CARD_LAYOUT = {
  pageWidthMm: 105,
  pageHeightMm: 148,
  paddingMm: 3
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
// Template TUNGGAL — pure function, tanpa Electron API / DB.
// ---------------------------------------------------------------------------
function logoElementHtml(data: BorrowCardData): string {
  if (data.header.logo) {
    return `<img class="logo-img" src="${escapeHtml(data.header.logo)}" alt="Logo Perpustakaan">`
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="#12235a" stroke-width="1.6"><path d="M2 6c3-1.5 6-1.5 9 0v13c-3-1.5-6-1.5-9 0V6z"/><path d="M22 6c-3-1.5-6-1.5-9 0v13c3-1.5 6-1.5 9 0V6z"/></svg>`
}

function headerHtml(data: BorrowCardData): string {
  return `<div class="header">
  <div class="header-left">
    <div class="logo-icon">${logoElementHtml(data)}</div>
    <div>
      <div class="brand-name">${escapeHtml(data.header.libraryName)}</div>
      ${data.header.schoolName ? `<div class="brand-sub">${escapeHtml(data.header.schoolName)}</div>` : ''}
    </div>
  </div>
  <div class="header-right"><span>KARTU<br>PEMINJAMAN</span></div>
</div>
<div class="header-strip"></div>`
}

function borrowInfoHtml(data: BorrowCardData): string {
  return `<div class="peminjaman-info">
  <div class="pj-label">No. Peminjaman</div>
  <div class="pj-value">${escapeHtml(data.borrow.borrowNumber)}</div>
  <div class="pj-divider"></div>
  <div class="kv-row"><span class="k">Tgl Pinjam</span><span class="v">${escapeHtml(data.borrow.borrowDate)}</span></div>
  <div class="kv-row"><span class="k">Jatuh Tempo</span><span class="v">${escapeHtml(data.borrow.dueDate)}</span></div>
  <div class="kv-row"><span class="k">Petugas</span><span class="v">${escapeHtml(data.footer.officerName)}</span></div>
</div>`
}

function iconRowHtml(label: string, value: string): string {
  return `<div class="icon-row"><div class="icon-circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg></div><div class="label-col">${escapeHtml(label)}</div><div class="val-col">${escapeHtml(value)}</div></div>`
}

function memberSectionHtml(data: BorrowCardData): string {
  const m = data.member
  const kelas = m.className ? iconRowHtml('Kelas', m.className) : ''
  return `<div class="member-section">
  <span class="sec-label">DATA ANGGOTA</span>
  <div class="box-outline">
    ${iconRowHtml('Nama', m.fullName)}
    ${iconRowHtml('ID Anggota', m.memberNumber)}
    ${kelas}
  </div>
</div>`
}

function bodyHtml(data: BorrowCardData): string {
  return `<div class="body">
  <div class="top-row">
    <div class="qr-box">${data.footer.qrSvg}</div>
    ${borrowInfoHtml(data)}
  </div>
  ${memberSectionHtml(data)}
</div>`
}

function bookRowHtml(book: BorrowCardBookData, index: number): string {
  // Jml = 1 per baris (satu baris = satu eksemplar buku dipinjam).
  return `<tr><td>${index + 1}</td><td class="title">${escapeHtml(book.title)}</td><td class="inv">${escapeHtml(book.inventoryNumber)}</td><td>1</td></tr>`
}

function booksZoneHtml(data: BorrowCardData): string {
  const rows = data.books.map((book, i) => bookRowHtml(book, i)).join('')
  return `<div class="books">
  <span class="sec-label">DAFTAR BUKU</span>
  <table class="buku">
    <thead><tr><th>No.</th><th>Judul Buku</th><th>Kode Inv.</th><th>Jml</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`
}

function footerHtml(): string {
  return `<div class="footer">
  <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.6"><path d="M2 6c3-1.5 6-1.5 9 0v13c-3-1.5-6-1.5-9 0V6z"/><path d="M22 6c-3-1.5-6-1.5-9 0v13c3-1.5 6-1.5 9 0V6z"/></svg>
  <span>&ldquo;Buku adalah jendela ilmu, baca hari ini, cerdas esok hari.&rdquo;</span>
</div>`
}

// Dokumen HTML lengkap — SATU-SATUNYA template untuk Preview / Print / PDF.
// SATU kartu = SATU halaman A6 105×148mm (tanpa pagination / tanpa lanjutan).
export function generateBorrowCardHtml(data: BorrowCardData): string {
  const page = `<div class="borrow-card">
${headerHtml(data)}
${bodyHtml(data)}
${booksZoneHtml(data)}
${footerHtml()}
</div>`
  const sheets = `<div class="sheet">${page}</div>`

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Kartu Peminjaman</title>
<style>
  @page { size: 105mm 148mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { background: #eef2f7; font-family: Arial, 'Segoe UI', sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { margin: 8px auto; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.14); page-break-after: always; break-after: page; }
  .sheet:last-of-type { page-break-after: auto; break-after: auto; }

  .borrow-card {
    width: 105mm; height: 148mm;
    display: flex; flex-direction: column;
    background: #ffffff; overflow: hidden;
  }

  /* HEADER */
  .header { flex: 0 0 20mm; display: flex; }
  .header-left { flex: 1.15; display: flex; align-items: center; gap: 2.2mm; padding: 0 3mm; min-width: 0; }
  .logo-icon { width: 8mm; height: 8mm; flex: 0 0 8mm; border: 0.5mm solid #12235a; border-radius: 1.3mm; display: flex; align-items: center; justify-content: center; background: #ffffff; overflow: hidden; }
  .logo-icon svg { width: 5.2mm; height: 5.2mm; }
  .logo-icon .logo-img { width: 100%; height: 100%; object-fit: contain; }
  .brand-name { font-size: 10pt; font-weight: 800; color: #12235a; letter-spacing: -0.02em; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .brand-sub { font-size: 6pt; color: #475569; margin-top: 0.4mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .header-right { flex: 1; background: #12235a; clip-path: polygon(10mm 0, 100% 0, 100% 100%, 0 100%); display: flex; align-items: center; justify-content: center; padding-left: 3mm; }
  .header-right span { color: #ffffff; font-size: 9.5pt; font-weight: 800; text-align: center; line-height: 1.15; }
  .header-strip { flex: 0 0 1mm; background: #12235a; }

  /* BODY */
  .body { flex: 0 0 auto; padding: 3mm 3.2mm 0; display: flex; flex-direction: column; gap: 2.6mm; }
  .top-row { display: flex; gap: 2.8mm; }
  .qr-box { width: 26mm; height: 26mm; flex: 0 0 26mm; border: 0.35mm solid #93a3c7; border-radius: 1.5mm; display: flex; align-items: center; justify-content: center; padding: 1.5mm; }
  .qr-box svg { width: 100%; height: 100%; }
  .peminjaman-info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: flex-start; }
  .pj-label { font-size: 7pt; font-weight: 700; color: #12235a; }
  .pj-value { font-size: 10pt; font-weight: 800; color: #12235a; margin-top: 0.3mm; margin-bottom: 1.6mm; }
  .pj-divider { border-bottom: 0.25mm solid #cbd5e1; margin-bottom: 1.4mm; }
  .kv-row { display: flex; justify-content: space-between; font-size: 7pt; margin-bottom: 1mm; }
  .kv-row .k { font-weight: 700; color: #1e293b; }
  .kv-row .v { color: #334155; text-align: right; }

  /* SECTION LABEL + BOX ANGGOTA */
  .sec-label { background: #12235a; color: #ffffff; font-size: 7pt; font-weight: 700; padding: 1.1mm 3mm; display: inline-block; align-self: flex-start; clip-path: polygon(0 0, 100% 0, calc(100% - 2mm) 100%, 0 100%); letter-spacing: 0.02em; }
  .box-outline { border: 0.3mm solid #93a3c7; border-radius: 1.5mm; padding: 2mm 2.5mm; margin-top: -0.5mm; }
  .icon-row { display: flex; align-items: center; gap: 2mm; margin-bottom: 1.4mm; }
  .icon-row:last-child { margin-bottom: 0; }
  .icon-circle { width: 5mm; height: 5mm; flex: 0 0 5mm; border-radius: 50%; background: #12235a; display: flex; align-items: center; justify-content: center; }
  .icon-circle svg { width: 2.8mm; height: 2.8mm; fill: #ffffff; }
  .icon-row .label-col { width: 15mm; flex: 0 0 15mm; font-size: 7pt; font-weight: 700; }
  .icon-row .val-col { font-size: 7pt; color: #334155; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* DAFTAR BUKU */
  .books { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 1.2mm; padding: 2.6mm 3.2mm 3mm; }
  table.buku { width: 100%; border-collapse: collapse; font-size: 6pt; }
  table.buku th { background: #12235a; color: #ffffff; font-weight: 700; padding: 1.1mm 1mm; text-align: left; }
  table.buku th:first-child, table.buku td:first-child { text-align: center; width: 5mm; }
  table.buku th:nth-child(3), table.buku td:nth-child(3) { text-align: center; width: 14mm; }
  table.buku th:last-child, table.buku td:last-child { text-align: center; width: 7mm; }
  table.buku td { padding: 1mm 1mm; border-bottom: 0.2mm solid #e2e8f0; color: #334155; }
  table.buku td.title { overflow: hidden; text-overflow: ellipsis; }
  table.buku td.inv { font-family: Consolas, 'Courier New', monospace; }

  /* FOOTER */
  .footer { flex: 0 0 10mm; background: #12235a; color: #ffffff; display: flex; align-items: center; justify-content: center; gap: 2mm; padding: 0 4mm; font-size: 6.5pt; text-align: center; line-height: 1.4; }
  .footer svg { width: 4mm; height: 4mm; flex: 0 0 4mm; }

  @media print {
    body { background: #ffffff; }
    .sheet { margin: 0; box-shadow: none; }
  }
</style>
</head>
<body>
${sheets}
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
