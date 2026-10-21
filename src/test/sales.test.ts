import { describe, expect, it } from 'vitest'
import { formatThaiPhone, normalizeThaiPhone, validateSalesContact } from '../lib/sales'
describe('Thai sales contact numbers', () => {
  it('normalizes local, international, Thai digits and landlines to dialable Thai numbers', () => {
    for (const input of ['081-234-5678', '+66 81 234 5678', '๐๘๑ ๒๓๔ ๕๖๗๘'])
      expect(normalizeThaiPhone(input)).toBe('0812345678')
    expect(normalizeThaiPhone('+66 (2) 123-4567')).toBe('021234567')
    expect(formatThaiPhone('021234567')).toBe('02-123-4567')
    expect(formatThaiPhone('0812345678')).toBe('081-234-5678')
  })
  it('rejects foreign, incomplete and unsafe telephone input', () => {
    for (const input of [
      '',
      '123456789',
      '08123',
      '+1 212 555 1234',
      '0012345678',
      'tel:0812345678',
      '*123#',
      '0812345678;ext=1',
    ])
      expect(normalizeThaiPhone(input)).toBeNull()
  })
  it('validates the stored fields and preserves readable multiline responsibility notes', () => {
    expect(
      validateSalesContact({
        name: '  คุณแพร  ',
        phone: '+66 81 234 5678',
        details: '  ลูกค้า A\nชลบุรี  ',
      }),
    ).toEqual({ name: 'คุณแพร', phone: '0812345678', details: 'ลูกค้า A\nชลบุรี' })
    const valid = { name: 'คุณแพร', phone: '0812345678', details: '' }
    for (const input of [
      { ...valid, name: '   ' },
      { ...valid, name: 'x'.repeat(101) },
      { ...valid, phone: 'bad' },
      { ...valid, details: 'x'.repeat(2001) },
    ])
      expect(() => validateSalesContact(input)).toThrow()
  })
})
