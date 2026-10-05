// Format rupiah manual (pemisah ribuan titik), tanpa Intl.
export function formatRupiah(n: number): string {
  const negative = n < 0
  const digits = Math.abs(Math.trunc(n)).toString()
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negative ? '-' : ''}Rp ${grouped}`
}
