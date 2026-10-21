import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { Check, ChevronRight, ContactRound, Pencil, Plus, Search } from 'lucide-react'
import { db, errorMessage } from '../lib/firebase'
import { useStore } from '../lib/store'
import { formatThaiPhone, normalizeThaiPhone } from '../lib/sales'
import type { SalesContact } from '../lib/sales'
import { Footer, useSubmit } from './Forms'
import { Avatar, Modal } from './ui'
import { PhoneLink } from './PhoneLink'

export function SalesPanel() {
  const s = useStore()
  const [records, setRecords] = useState<SalesContact[]>([])
  const [loading, setLoading] = useState(!s.demo)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [dialog, setDialog] = useState<{ mode: 'view' | 'edit'; contact?: SalesContact } | null>(
    null,
  )
  useEffect(() => {
    if (s.demo) return
    if (!db) {
      setLoading(false)
      setError('ยังไม่ได้เชื่อมต่อฐานข้อมูล')
      return
    }
    setLoading(true)
    setError('')
    return onSnapshot(
      query(collection(db, 'salesContacts'), orderBy('name')),
      (snapshot) => {
        setRecords(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as SalesContact))
        setLoading(false)
      },
      (e) => {
        setError(errorMessage(e))
        setLoading(false)
      },
    )
  }, [s.demo, revision])
  useEffect(() => {
    if (!s.admin && dialog?.mode === 'edit') setDialog(null)
  }, [s.admin, dialog])
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 3500)
    return () => clearTimeout(timer)
  }, [message])
  const contacts = [...(s.demo ? s.data.salesContacts : records)].sort((a, b) =>
    a.name.localeCompare(b.name, 'th'),
  )
  const term = search.trim().toLocaleLowerCase('th')
  const phoneTerm = normalizeThaiPhone(term) || term.replace(/[\s().-]/g, '')
  const visible = contacts.filter(
    (contact) =>
      `${contact.name} ${contact.details}`.toLocaleLowerCase('th').includes(term) ||
      (phoneTerm && contact.phone.includes(phoneTerm)),
  )
  const selected = contacts.find((contact) => contact.id === dialog?.contact?.id) || dialog?.contact
  return (
    <section className="sales-directory" aria-label="รายชื่อเซลล์">
      <div className="sales-toolbar">
        <div className="search-box">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="ค้นหาเซลล์"
            placeholder="ค้นหาชื่อ เบอร์โทร หรือเรื่องที่ดูแล"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {s.admin && (
          <button className="btn primary" onClick={() => setDialog({ mode: 'edit' })}>
            <Plus size={18} />
            เพิ่มเซลล์
          </button>
        )}
      </div>
      {loading ? (
        <p className="sales-state" role="status">
          กำลังโหลดข้อมูลเซลล์…
        </p>
      ) : error ? (
        <div className="notice error" role="alert">
          {error}
          <button className="btn secondary small" onClick={() => setRevision((value) => value + 1)}>
            ลองอีกครั้ง
          </button>
        </div>
      ) : (
        <>
          <p className="sales-count">
            {term
              ? `พบ ${visible.length} จาก ${contacts.length} คน`
              : `เซลล์ทั้งหมด ${contacts.length} คน`}
          </p>
          {visible.length ? (
            <div className="sales-grid">
              {visible.map((contact, index) => (
                <article className="sales-card" key={contact.id}>
                  <button
                    className="sales-card-open"
                    onClick={() => setDialog({ mode: 'view', contact })}
                    aria-label={`ดูรายละเอียดเซลล์ ${contact.name}`}
                  >
                    <span className="sales-identity">
                      <Avatar name={contact.name} index={index} />
                      <strong>{contact.name}</strong>
                      <ChevronRight size={17} />
                    </span>
                    <span className="sales-details-label">รายละเอียดที่ดูแล</span>
                    <span className="sales-preview">
                      {contact.details || 'ยังไม่ได้ระบุรายละเอียดที่ดูแล'}
                    </span>
                  </button>
                  <div className="sales-card-actions">
                    <PhoneLink phone={formatThaiPhone(contact.phone)} name={contact.name} />
                    {s.admin && (
                      <button
                        className="text-btn"
                        aria-label={`แก้ไขเซลล์ ${contact.name}`}
                        onClick={() => setDialog({ mode: 'edit', contact })}
                      >
                        <Pencil size={15} />
                        แก้ไข
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="sales-state">
              <ContactRound size={28} aria-hidden="true" />
              <h2>{term ? 'ไม่พบเซลล์ที่ค้นหา' : 'ยังไม่มีข้อมูลเซลล์'}</h2>
              <p>
                {term
                  ? 'ลองเปลี่ยนชื่อ เบอร์โทร หรือรายละเอียดที่ค้นหา'
                  : s.admin
                    ? 'กดเพิ่มเซลล์ เพื่อบันทึกชื่อ เบอร์โทร และรายละเอียดที่ดูแล'
                    : 'ข้อมูลจะแสดงเมื่อผู้ดูแลเพิ่มเซลล์'}
              </p>
              {term && (
                <button className="text-btn" onClick={() => setSearch('')}>
                  ล้างการค้นหา
                </button>
              )}
            </div>
          )}
        </>
      )}
      {message && (
        <div className="toast" role="status">
          <Check size={17} />
          {message}
        </div>
      )}
      {dialog && (
        <Modal
          title={
            dialog.mode === 'view'
              ? 'ข้อมูลเซลล์'
              : dialog.contact
                ? 'แก้ไขข้อมูลเซลล์'
                : 'เพิ่มเซลล์'
          }
          onClose={() => setDialog(null)}
        >
          {dialog.mode === 'edit' && s.admin ? (
            <SalesForm
              key={dialog.contact?.id || 'new'}
              contact={dialog.contact}
              onDone={() => {
                setDialog(null)
                setMessage('บันทึกข้อมูลเซลล์เรียบร้อยแล้ว')
              }}
            />
          ) : (
            selected && (
              <div className="sales-detail">
                <div className="sales-identity">
                  <Avatar name={selected.name} />
                  <h3>{selected.name}</h3>
                </div>
                <PhoneLink phone={formatThaiPhone(selected.phone)} name={selected.name} />
                <h4>รายละเอียดที่ดูแล</h4>
                <p>{selected.details || 'ยังไม่ได้ระบุรายละเอียดที่ดูแล'}</p>
                {s.admin && (
                  <button
                    className="btn secondary"
                    onClick={() => setDialog({ mode: 'edit', contact: selected })}
                  >
                    <Pencil size={16} />
                    แก้ไขข้อมูล
                  </button>
                )}
              </div>
            )
          )}
        </Modal>
      )}
    </section>
  )
}

function SalesForm({ contact, onDone }: { contact?: SalesContact; onDone: () => void }) {
  const s = useStore(),
    submit = useSubmit(onDone)
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        void submit.run(() =>
          s.saveSalesContact(
            {
              name: String(data.get('name')),
              phone: String(data.get('phone')),
              details: String(data.get('details')),
            },
            contact?.id,
          ),
        )
      }}
    >
      <label>
        ชื่อเซลล์ <b>*</b>
        <input
          name="name"
          autoComplete="off"
          required
          maxLength={100}
          defaultValue={contact?.name}
          placeholder="ชื่อหรือชื่อเล่นที่ใช้ติดต่อ"
        />
      </label>
      <label>
        เบอร์โทรไทย <b>*</b>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          required
          maxLength={30}
          defaultValue={contact?.phone}
          placeholder="081-234-5678"
        />
        <span className="sales-field-help">เบอร์มือถือหรือเบอร์สำนักงาน · รองรับ +66</span>
      </label>
      <label>
        รายละเอียดที่ดูแล <span className="optional">ไม่บังคับ</span>
        <textarea
          name="details"
          rows={5}
          maxLength={2000}
          defaultValue={contact?.details}
          placeholder="เช่น ลูกค้าที่ดูแล พื้นที่รับผิดชอบ จุดขึ้นสินค้า หรือเรื่องที่ติดต่อได้"
        />
        <span className="sales-field-help">สูงสุด 2,000 ตัวอักษร</span>
      </label>
      <p className="sales-field-help">Guest ดูข้อมูลนี้ได้ ผู้ดูแลเท่านั้นที่เพิ่มหรือแก้ไขได้</p>
      <Footer {...submit} />
    </form>
  )
}
