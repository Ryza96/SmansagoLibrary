// Util format teks untuk Laporan Cetak A4 (TAHAP 1 = data layer).
// Murni (tanpa API renderer / Electron / Prisma) agar dapat dipakai
// service main maupun — kelak — template HTML di main. Format tanggal
// yang dipakai dokumen cetak adalah dd/MM/yyyy (konsisten dengan default
// Setting.reportDateFormat "DD/MM/YYYY" — setting itu sendiri tetap hanya
// label, bukan konsumen; format cetak dikunci di sini).
// Tanggal diinterpretasikan dalam zona waktu lokal (getDate/dll.) agar
// cocok dengan yang tampil di layar; string tanggal ISO "yyyy-MM-dd"
// (tanpa waktu) diurai per-komponen untuk menghindari geser hari akibat
// parsing UTC di zona minus.
import { formatRupiah } from './format-rupiah'

function parseReportDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const trimmed = String(value).trim()
  if (trimmed === '') return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (dateOnly) {
    const d = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// dd/MM/yyyy — dipakai untuk sel tabel DAN baris meta/periode pada kop
// dokumen (satu format untuk seluruh dokumen cetak). null / string kosong /
// tanggal tidak valid → "-".
export function formatReportDateId(value: Date | string | null | undefined): string {
  const d = parseReportDate(value)
  if (!d) return '-'
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}

// Format rupiah untuk total Nilai Aset (Laporan Koleksi). Delegasi ke
// formatRupiah yang sudah ada (manual, pemisah ribuan titik, tanpa Intl)
// agar seluruh aplikasi memakai satu implementasi pemisah ribuan.
export function formatRupiahId(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'Rp 0'
  return formatRupiah(value)
}
