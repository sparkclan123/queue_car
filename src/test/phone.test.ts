import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PhoneLink } from '../components/PhoneLink'
import { telephoneHref } from '../lib/phone'

describe('driver call links', () => {
  it.each([
    ['081-234-5678', 'tel:0812345678'],
    [' (02) 123 4567 ', 'tel:021234567'],
    ['+66 81 234 5678', 'tel:+66812345678'],
    ['๐๘๑-๒๓๔-๕๖๗๘', 'tel:0812345678'],
  ])('normalizes %s without changing its digits', (input, expected) => {
    expect(telephoneHref(input)).toBe(expected)
  })
  it.each([
    undefined,
    '',
    'ไม่มีเบอร์',
    '123',
    'javascript:alert(1)',
    'https://example.com',
    '*123#',
    '+66+81',
    '1234567890123456',
  ])('does not create a call link for %s', (input) => {
    expect(telephoneHref(input)).toBeNull()
    expect(renderToStaticMarkup(createElement(PhoneLink, { name: 'คนรถ', phone: input }))).toBe('')
  })
  it('renders an accessible dialer link rather than initiating a call', () => {
    const html = renderToStaticMarkup(
      createElement(PhoneLink, { name: 'คนรถ', phone: '081-234-5678', compact: true }),
    )
    expect(html).toContain('href="tel:0812345678"')
    expect(html).toContain('aria-label="โทรหา คนรถ 081-234-5678"')
    expect(html).toContain('phone-link-compact')
  })
})
