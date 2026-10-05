import { describe, it, expect } from 'vitest'
import {
  calculateLateFine,
  resolveBookValue,
  lateFineDedupeKey,
  detailFineDedupeKey
} from '../src/main/services/fine-calculator'
import { DEFAULT_BOOK_VALUE, DEFAULT_LATE_FEE_PER_DAY } from '../src/shared/config/fine'

describe('calculateLateFine', () => {
  it('returns null when returned on the due day at a different hour', () => {
    expect(
      calculateLateFine({
        dueDate: new Date(2026, 9, 10, 9, 0),
        returnedAt: new Date(2026, 9, 10, 15, 30),
        ratePerDay: DEFAULT_LATE_FEE_PER_DAY
      })
    ).toBeNull()
  })

  it('1 day late with rate 1000', () => {
    expect(
      calculateLateFine({
        dueDate: new Date(2026, 9, 10),
        returnedAt: new Date(2026, 9, 11),
        ratePerDay: 1000
      })
    ).toEqual({ lateDays: 1, amount: 1000 })
  })

  it('5 days late with different rates', () => {
    const base = { dueDate: new Date(2026, 9, 1), returnedAt: new Date(2026, 9, 6) }
    expect(calculateLateFine({ ...base, ratePerDay: 1000 })).toEqual({ lateDays: 5, amount: 5000 })
    expect(calculateLateFine({ ...base, ratePerDay: 2000 })).toEqual({ lateDays: 5, amount: 10000 })
  })

  it('returns null when returned early', () => {
    expect(
      calculateLateFine({
        dueDate: new Date(2026, 9, 10),
        returnedAt: new Date(2026, 9, 5),
        ratePerDay: 1000
      })
    ).toBeNull()
  })

  it('due 23:59, returned 00:01 next day = 1 late day', () => {
    expect(
      calculateLateFine({
        dueDate: new Date(2026, 9, 10, 23, 59),
        returnedAt: new Date(2026, 9, 11, 0, 1),
        ratePerDay: 1000
      })
    ).toEqual({ lateDays: 1, amount: 1000 })
  })
})

describe('resolveBookValue', () => {
  it('null/undefined/0/negative -> DEFAULT_BOOK_VALUE', () => {
    expect(resolveBookValue(null)).toBe(DEFAULT_BOOK_VALUE)
    expect(resolveBookValue(undefined)).toBe(DEFAULT_BOOK_VALUE)
    expect(resolveBookValue(0)).toBe(DEFAULT_BOOK_VALUE)
    expect(resolveBookValue(-5000)).toBe(DEFAULT_BOOK_VALUE)
  })

  it('positive value passes through', () => {
    expect(resolveBookValue(75000)).toBe(75000)
  })
})

describe('dedupe keys', () => {
  it('late fine key', () => {
    expect(lateFineDedupeKey('b1')).toBe('LATE:b1')
  })
  it('detail fine key', () => {
    expect(detailFineDedupeKey('d1')).toBe('DETAIL:d1')
  })
})
