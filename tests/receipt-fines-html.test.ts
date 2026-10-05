import { describe, it, expect } from 'vitest'
import { renderFinesBlockHtml } from '../src/shared/utils/receipt-fines-html'

describe('renderFinesBlockHtml', () => {
  it('(a) tanpa denda → string kosong', () => {
    expect(renderFinesBlockHtml(undefined, undefined)).toBe('')
    expect(renderFinesBlockHtml([], 0)).toBe('')
  })

  it('(b) rusak berat 75000 UNPAID → memuat Rp 75.000 dan Total', () => {
    const html = renderFinesBlockHtml(
      [{ type: 'HEAVY_DAMAGE', label: 'Rusak Berat', amount: 75000, status: 'UNPAID' }],
      75000
    )
    expect(html).toContain('Rp 75.000')
    expect(html).toContain('Total denda yang harus dibayar')
  })

  it('(c) LATE memuat "5 hari" dan "Rp 1.000"', () => {
    const html = renderFinesBlockHtml(
      [{ type: 'LATE', label: 'Terlambat', amount: 5000, status: 'UNPAID', lateDays: 5, ratePerDay: 1000 }],
      5000
    )
    expect(html).toContain('5 hari')
    expect(html).toContain('Rp 1.000')
  })

  it('(d) semua PAID/WAIVED → "Tidak ada denda yang harus dibayar"', () => {
    const html = renderFinesBlockHtml(
      [
        { type: 'LOST', label: 'Hilang', amount: 25000, status: 'PAID' },
        { type: 'LATE', label: 'Terlambat', amount: 3000, status: 'WAIVED' }
      ],
      0
    )
    expect(html).toContain('Tidak ada denda yang harus dibayar')
  })

  it('(e) teks berisi <script> di-escape', () => {
    const html = renderFinesBlockHtml(
      [{ type: 'LATE', label: '<script>alert(1)</script>', amount: 1000, status: 'UNPAID' }],
      1000
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('PENGEMBALIAN dengan borrowDate valid memuat tanggal & tanpa Invalid Date', async () => {
    const { PrintService } = await import('../electron/main/services/print.service')
    const svc = new PrintService(null as any, null as any, '')
    const html = (svc as any).generateReceiptHtml(
      { libraryName: 'P', borrowingNumber: 'PJ/1', memberName: 'M', memberNumber: 'S', returnDate: new Date('2026-10-01').toISOString(), borrowDate: new Date('2026-09-25').toISOString(), items: [], totalItems: 0 },
      'PENGEMBALIAN'
    )
    expect(html).toContain(new Date('2026-09-25').toLocaleDateString('id-ID'))
    expect(html).not.toContain('Invalid Date')
  })

  it('PENGEMBALIAN tanpa borrowDate memuat "-" & tanpa Invalid Date', async () => {
    const { PrintService } = await import('../electron/main/services/print.service')
    const svc = new PrintService(null as any, null as any, '')
    const html = (svc as any).generateReceiptHtml(
      { libraryName: 'P', borrowingNumber: 'PJ/1', memberName: 'M', memberNumber: 'S', returnDate: new Date('2026-10-01').toISOString(), items: [], totalItems: 0 },
      'PENGEMBALIAN'
    )
    expect(html).toContain('-')
    expect(html).not.toContain('Invalid Date')
  })

  it('PEMINJAMAN tidak berubah perilaku Tanggal Pinjam', async () => {
    const { PrintService } = await import('../electron/main/services/print.service')
    const svc = new PrintService(null as any, null as any, '')
    const html = (svc as any).generateReceiptHtml(
      { libraryName: 'P', borrowingNumber: 'PJ/1', memberName: 'M', memberNumber: 'S', borrowDate: new Date('2026-09-25').toISOString(), dueDate: new Date('2026-10-02').toISOString(), items: [], totalItems: 0 },
      'PEMINJAMAN'
    )
    expect(html).toContain(new Date('2026-09-25').toLocaleDateString('id-ID'))
    expect(html).not.toContain('Invalid Date')
  })

  it('PENGEMBALIAN memuat blok denda, PEMINJAMAN tidak', async () => {
    const { PrintService } = await import('../electron/main/services/print.service')
    const svc = new PrintService(null as any, null as any, '')
    const base = {
      libraryName: 'Perpustakaan',
      borrowingNumber: 'PJ/1',
      memberName: 'M',
      memberNumber: 'S-1',
      returnDate: new Date('2026-10-01').toISOString(),
      items: [],
      totalItems: 0,
      fines: [{ type: 'HEAVY_DAMAGE', label: 'Rusak Berat', amount: 75000, status: 'UNPAID' }],
      totalUnpaid: 75000
    }
    const ret = (svc as any).generateReceiptHtml(base, 'PENGEMBALIAN')
    expect(ret).toContain('DENDA')
    expect(ret).toContain('Rp 75.000')
    const loan = (svc as any).generateReceiptHtml({ ...base, borrowDate: base.returnDate, dueDate: base.returnDate }, 'PEMINJAMAN')
    expect(loan).not.toContain('DENDA')
  })
})
