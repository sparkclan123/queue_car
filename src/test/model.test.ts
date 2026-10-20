import { describe, expect, it } from 'vitest'
import { csvCell, dateLabel, money, provinces, shiftDate, toSatang } from '../lib/model'
describe('money stored as integer satang', () => {
  it('preserves decimals exactly', () => {
    expect(toSatang('1000.05')).toBe(100005)
    expect(toSatang('0.29')).toBe(29)
    expect(money(100005)).toBe('1,000.05')
  })
  it.each(['0', '-1', '1e3', 'NaN', '1.005', '1,000', '10000000.01', 'Infinity', ''])(
    'rejects invalid money %s',
    (v) => expect(() => toSatang(v)).toThrow(),
  )
})
describe('Thai dates and exports', () => {
  it('handles leap days and year boundaries', () => {
    expect(shiftDate('2024-03-01', -1)).toBe('2024-02-29')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(dateLabel('2026-10-20', true)).toContain('2569')
  })
  it('contains all 77 unique provinces', () => {
    expect(provinces).toHaveLength(77)
    expect(new Set(provinces).size).toBe(77)
  })
  it('escapes CSV and neutralizes spreadsheet formulas', () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""')
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"')
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"')
  })
})
