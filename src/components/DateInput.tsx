import { useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { CalendarDays } from 'lucide-react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue'> & {
  type?: 'date' | 'month'
  value?: string
  defaultValue?: string
  displayValue?: string
}

// Keep the native picker/validation, but give its visible face a predictable width on mobile.
export function DateInput({
  type = 'date',
  value,
  defaultValue = '',
  displayValue,
  className = '',
  onChange,
  onClick,
  onKeyDown,
  ...props
}: Props) {
  const [draft, setDraft] = useState(defaultValue)
  const selected = value ?? draft
  const parts = selected.split('-')
  const label =
    displayValue ||
    (selected
      ? type === 'month'
        ? `${parts[1]}/${parts[0]}`
        : `${parts[2]}/${parts[1]}/${parts[0]}`
      : type === 'month'
        ? 'เลือกเดือน'
        : 'เลือกวันที่')
  function open(input: HTMLInputElement) {
    try {
      if (!input.disabled && !input.readOnly && input.showPicker) {
        input.showPicker()
        return true
      }
    } catch {
      /* Older browsers still open their native picker when the input is tapped. */
    }
    return false
  }
  return (
    <span className={`date-input ${className}`}>
      <span className="date-input-face" aria-hidden="true">
        <span>{label}</span>
        <CalendarDays size={16} />
      </span>
      <input
        {...props}
        className="date-input-native"
        type={type}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={(e) => {
          setDraft(e.target.value)
          onChange?.(e)
        }}
        onClick={(e) => {
          onClick?.(e)
          if (!e.defaultPrevented) open(e.currentTarget)
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          if (!e.defaultPrevented && (e.key === 'Enter' || e.key === ' ') && open(e.currentTarget))
            e.preventDefault()
        }}
      />
    </span>
  )
}
