export function telephoneHref(phone: string | undefined) {
  const value = (phone || '')
    .trim()
    .replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - '๐'.charCodeAt(0)))
  if (!/^\+?[\d\s().-]+$/.test(value)) return null
  const number = value.replace(/[\s().-]/g, '')
  return /^\+?\d{6,15}$/.test(number) ? `tel:${number}` : null
}
