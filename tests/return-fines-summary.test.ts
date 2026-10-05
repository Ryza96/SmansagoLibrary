import { describe, it, expect } from 'vitest'
import { summarizeReturnFines } from '../src/shared/utils/return-fines-summary'

describe('summarizeReturnFines', () => {
  it('(a) undefined dan [] → items kosong, total 0', () => {
    expect(summarizeReturnFines(undefined)).toEqual({ items: [], total: 0 })
    expect(summarizeReturnFines([])).toEqual({ items: [], total: 0 })
  })

  it('(b) satu denda HEAVY_DAMAGE 75000 → label "Rusak Berat", total 75000', () => {
    const s = summarizeReturnFines([{ type: 'HEAVY_DAMAGE', amount: 75000 }])
    expect(s.items.length).toBe(1)
    expect(s.items[0].label).toBe('Rusak Berat')
    expect(s.total).toBe(75000)
  })

  it('(c) HEAVY_DAMAGE + LOST + LATE → total 105000, 3 item berurutan', () => {
    const s = summarizeReturnFines([
      { type: 'HEAVY_DAMAGE', amount: 75000 },
      { type: 'LOST', amount: 25000 },
      { type: 'LATE', amount: 5000 }
    ])
    expect(s.total).toBe(105000)
    expect(s.items.map((i) => i.type)).toEqual(['HEAVY_DAMAGE', 'LOST', 'LATE'])
  })

  it('(d) tipe tidak dikenal → label memakai type', () => {
    const s = summarizeReturnFines([{ type: 'UNKNOWN', amount: 1000 }])
    expect(s.items[0].label).toBe('UNKNOWN')
  })
})
