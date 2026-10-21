import { Phone } from 'lucide-react'
import { telephoneHref } from '../lib/phone'

export function PhoneLink({
  phone,
  name,
  compact = false,
}: {
  phone?: string
  name: string
  compact?: boolean
}) {
  const href = telephoneHref(phone)
  if (!href) return null
  return (
    <a
      className={`phone-link ${compact ? 'phone-link-compact' : ''}`}
      href={href}
      aria-label={`โทรหา ${name} ${phone}`}
      title={`โทร ${phone}`}
    >
      <Phone size={18} aria-hidden="true" />
      {!compact && <span>โทร {phone}</span>}
    </a>
  )
}
