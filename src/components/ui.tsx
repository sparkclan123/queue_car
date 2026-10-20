import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, Check, CircleHelp, Truck, X } from 'lucide-react'
export function Logo() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Truck size={24} />
      </span>
      <span>
        คิวรถ<span className="brand-en">QUEUECAR</span>
      </span>
    </div>
  )
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    d?.showModal()
    return () => d?.close()
  }, [])
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('.modal-head button')?.focus()
  }, [title])
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-head">
        <div>
          <h2 id="modal-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-btn" aria-label="ปิดหน้าต่าง" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string
  detail: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Truck size={27} />
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  )
}
export function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return <span className={`avatar tone-${index % 4}`}>{name.slice(0, 1)}</span>
}
export function Route({ provinces }: { provinces: string[] }) {
  return (
    <div className="route">
      {provinces.map((p, i) => (
        <span key={i}>
          {i > 0 && <ArrowRight size={13} />}
          <span className={i === 0 ? '' : 'next-stop'}>{p}</span>
        </span>
      ))}
    </div>
  )
}
export function Badge({ state, children }: { state: string; children: ReactNode }) {
  return (
    <span className={`badge ${state}`}>
      {state === 'completed' && <Check size={12} />}
      <i />
      {children}
    </span>
  )
}
export function Hint({ children }: { children: ReactNode }) {
  return (
    <div className="hint">
      <CircleHelp size={16} />
      <span>{children}</span>
    </div>
  )
}
export function MapArt() {
  return (
    <svg className="map-art" viewBox="0 0 380 230" fill="none" aria-hidden="true">
      <path
        d="M32 162 102 193 204 145 311 171 360 113 255 84 280 30 168 48 98 22 62 90Z"
        fill="#e0ecdf"
      />
      <path
        d="m4 133 91 35 95-44 108 25 78-68M58 208l50-70-2-88M189 224l-11-72 46-55-17-72M268 202l-2-85 44-61"
        stroke="#fff"
        strokeWidth="11"
      />
      <path
        d="m77 164 66-29 59 9 57-54 51 9"
        stroke="#9abca1"
        strokeWidth="3"
        strokeDasharray="5 6"
      />
      <circle cx="77" cy="164" r="11" fill="#fff" />
      <circle cx="77" cy="164" r="5" fill="#36795e" />
      <circle cx="310" cy="99" r="13" fill="#174f43" />
      <circle cx="310" cy="99" r="5" fill="#d1efa7" />
      <g transform="translate(181 112)">
        <rect x="-24" y="-22" width="60" height="43" rx="10" fill="#174f43" />
        <path
          d="M-12-10H8V8H-12ZM8-4h8l7 7v5H8"
          stroke="#fff"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle cx="-5" cy="10" r="4" fill="#d1efa7" />
        <circle cx="16" cy="10" r="4" fill="#d1efa7" />
      </g>
      <rect x="31" y="56" width="100" height="32" rx="16" fill="#fff" />
      <circle cx="48" cy="72" r="4" fill="#4b8d68" />
      <text x="60" y="77" fontSize="12" fill="#436452" fontFamily="sans-serif">
        พร้อมเดินทาง
      </text>
      <path d="m332 180 0 21m-10-11h20" stroke="#a3bd9e" strokeWidth="2" />
    </svg>
  )
}
