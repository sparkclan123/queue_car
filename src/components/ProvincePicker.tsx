import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, X } from 'lucide-react'
import { provinces } from '../lib/model'

export function ProvincePicker({
  label,
  inputLabel,
  stops,
  onChange,
}: {
  label: string
  inputLabel: string
  stops: string[]
  onChange: (stops: string[]) => void
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const term = search.trim().normalize('NFC')
  const matches = provinces.filter((province) => province.includes(term))
  const selected = provinces.find((province) => province === term)
  const full = stops.length >= 8

  useEffect(() => {
    const menu = list.current
    const option = menu?.children[active] as HTMLElement | undefined
    if (!open || !menu || !option) return
    if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop
    else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight)
      menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight
  }, [active, open, search])

  function choose(province: string) {
    setSearch(province)
    input.current?.focus()
    setOpen(false)
    setActive(0)
  }
  function add() {
    if (!selected || full) return
    onChange([...stops, selected])
    setSearch('')
    setOpen(false)
    setActive(0)
  }
  return (
    <div className="province-picker">
      <label className="province-label" htmlFor={id}>
        {label} <b>*</b>
      </label>
      <div className="inline-input">
        <div
          className="province-combobox"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
          }}
        >
          <div className="province-input-wrap">
            <input
              ref={input}
              id={id}
              role="combobox"
              aria-label={inputLabel}
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={open ? `${id}-list` : undefined}
              aria-activedescendant={open && matches[active] ? `${id}-option-${active}` : undefined}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={60}
              placeholder="พิมพ์ค้นหาจังหวัด…"
              value={search}
              disabled={full}
              onFocus={() => {
                setOpen(true)
                setActive(0)
              }}
              onChange={(e) => {
                setSearch(e.target.value)
                setOpen(true)
                setActive(0)
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  setOpen(true)
                  setActive((index) =>
                    !open
                      ? e.key === 'ArrowDown'
                        ? 0
                        : Math.max(0, matches.length - 1)
                      : Math.max(
                          0,
                          Math.min(matches.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)),
                        ),
                  )
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  if (open && matches[active]) choose(matches[active])
                  else setOpen(true)
                } else if (e.key === 'Escape' && open) {
                  e.preventDefault()
                  e.stopPropagation()
                  setOpen(false)
                }
              }}
            />
            <button
              type="button"
              className="province-toggle"
              tabIndex={-1}
              disabled={full}
              aria-label={open ? 'ปิดรายการจังหวัด' : 'เปิดรายการจังหวัด'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const next = !open
                input.current?.focus()
                setOpen(next)
                setActive(0)
              }}
            >
              <ChevronDown size={18} />
            </button>
          </div>
          {open && !full && (
            <div className="province-dropdown">
              <p className="province-result-count" role="status">
                {matches.length ? `พบ ${matches.length} จังหวัด` : 'ไม่พบจังหวัด ลองพิมพ์ชื่อใหม่'}
              </p>
              <ul
                id={`${id}-list`}
                ref={list}
                role="listbox"
                aria-label="จังหวัดที่พบ"
                className="province-options"
              >
                {matches.map((province, index) => (
                  <li key={province} role="presentation">
                    <button
                      type="button"
                      role="option"
                      id={`${id}-option-${index}`}
                      aria-selected={active === index}
                      className={active === index ? 'active' : ''}
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(province)}
                    >
                      <span>{province}</span>
                      {province === selected && <Check size={16} />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button className="btn secondary" type="button" disabled={!selected || full} onClick={add}>
          <Plus size={18} /> เพิ่ม
        </button>
      </div>
      <div className="stops">
        {stops.map((province, index) => (
          <div key={index}>
            <span className="stop-number">{index + 1}</span>
            <span>{province}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label={`ลบจุดส่ง ${index + 1} ${province}`}
              onClick={() => onChange(stops.filter((_, i) => i !== index))}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      {full && (
        <p className="field-help" role="status">
          ครบ 8 จุดแล้ว ลบจุดส่งก่อนเพิ่มจังหวัดใหม่
        </p>
      )}
    </div>
  )
}
