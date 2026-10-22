import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Camera, Check, LoaderCircle, Plus, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { errorMessage } from '../lib/firebase'
import { kinds, optionalSatang, toSatang, today } from '../lib/model'
import type { Driver, Entry, QueueItem } from '../lib/model'
import { compressEvidence, fileSize, MAX_EVIDENCE_IMAGES } from '../lib/evidence'
import type { PreparedEvidence } from '../lib/evidence'
import { Avatar, Empty, Hint } from './ui'
import { DateInput } from './DateInput'
import { ProvincePicker } from './ProvincePicker'
export function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const locked = useRef(false)
  return {
    busy,
    error,
    run: async (fn: () => Promise<void>) => {
      if (locked.current) return
      locked.current = true
      setBusy(true)
      setError('')
      try {
        await fn()
        onDone()
      } catch (e) {
        setError(errorMessage(e))
      } finally {
        locked.current = false
        setBusy(false)
      }
    },
  }
}
export function Footer({
  busy,
  error,
  disabled = false,
  label = 'บันทึกข้อมูล',
}: {
  busy: boolean
  error: string
  disabled?: boolean
  label?: string
}) {
  return (
    <>
      <div role="alert" className={error ? 'form-error' : ''}>
        {error}
      </div>
      <button className="btn primary form-submit" disabled={busy || disabled} type="submit">
        {busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}{' '}
        {busy ? 'กำลังบันทึก…' : label}
      </button>
    </>
  )
}
export function DriverForm({ driver, onDone }: { driver?: Driver; onDone: () => void }) {
  const s = useStore(),
    submit = useSubmit(onDone)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        void submit.run(() =>
          s.saveDriver(
            {
              name: String(f.get('name')),
              plate: String(f.get('plate')),
              phone: String(f.get('phone')),
              truckType: String(f.get('truckType')),
              active: f.get('active') === 'on',
            },
            driver?.id,
          ),
        )
      }}
      className="form"
    >
      <label>
        ชื่อคนรถ / ชื่อที่ใช้แสดง <b>*</b>
        <input
          name="name"
          placeholder="เช่น สมชาย ใจดี"
          maxLength={80}
          required
          defaultValue={driver?.name}
        />
      </label>
      <div className="form-grid">
        <label>
          ทะเบียนรถ <b>*</b>
          <input
            name="plate"
            placeholder="เช่น 70-1234"
            maxLength={30}
            required
            defaultValue={driver?.plate}
          />
        </label>
        <label>
          ประเภทรถ
          <select name="truckType" defaultValue={driver?.truckType || 'รถพ่วง 22 ล้อ'}>
            {[
              'รถพ่วง 22 ล้อ',
              'รถบรรทุก 10 ล้อ',
              'รถบรรทุก 6 ล้อ',
              'รถเทรลเลอร์',
              'รถกระบะ',
              'อื่น ๆ',
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        เบอร์โทร <span className="optional">ไม่บังคับ</span>
        <input
          type="tel"
          name="phone"
          maxLength={30}
          defaultValue={driver?.phone}
          placeholder="ไม่บังคับ"
        />
      </label>
      <label className="checkbox">
        <input type="checkbox" name="active" defaultChecked={driver?.active ?? true} />
        เปิดใช้งานคนรถคนนี้
      </label>
      <Hint>ชื่อ ทะเบียน และประเภทรถจะแสดงต่อสาธารณะเมื่ออยู่ในคิวหรือมีงานวิ่ง</Hint>
      <Footer {...submit} />
    </form>
  )
}
export function QueueForm({
  onDone,
  onAddDriver,
}: {
  onDone: () => void
  onAddDriver: () => void
}) {
  const s = useStore(),
    [selected, setSelected] = useState(''),
    [search, setSearch] = useState(''),
    submit = useSubmit(onDone)
  const available = s.data.drivers.filter(
    (d) =>
      d.active &&
      !d.activeJobId &&
      !s.data.queue.some((q) => q.id === d.id) &&
      `${d.name} ${d.plate}`.includes(search),
  )
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        if (selected) void submit.run(() => s.joinQueue(selected))
      }}
    >
      <input
        className="search-input"
        placeholder="ค้นหาชื่อคนรถหรือทะเบียน"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="ค้นหาคนรถที่พร้อมลงคิว"
      />
      <div className="driver-options">
        {available.map((d, i) => (
          <label className={`driver-option ${selected === d.id ? 'selected' : ''}`} key={d.id}>
            <input
              type="radio"
              name="driver"
              required
              value={d.id}
              checked={selected === d.id}
              onChange={() => setSelected(d.id)}
            />
            <Avatar name={d.name} index={i} />
            <span>
              <strong>{d.name}</strong>
              <small>
                {d.plate} · {d.truckType}
              </small>
            </span>
            {selected === d.id && <Check size={18} />}
          </label>
        ))}
        {!available.length && (
          <Empty
            title="ไม่มีคนรถที่พร้อมลงคิว"
            detail="คนรถอาจอยู่ในคิวหรือมีงานที่ยังไม่จบ"
            action={
              <button type="button" className="btn secondary" onClick={onAddDriver}>
                <Plus size={16} /> เพิ่มคนรถ
              </button>
            }
          />
        )}
      </div>
      <Hint>คิวเรียงตามเวลาที่ลง คนที่ลงก่อนจะอยู่ด้านบน</Hint>
      {available.length > 0 && <Footer {...submit} label="ยืนยันลงคิว" />}
    </form>
  )
}
export function JobForm({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  const s = useStore(),
    [stops, setStops] = useState<string[]>([]),
    submit = useSubmit(onDone)
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        void submit.run(() => s.saveJob(item, String(f.get('date')), stops, String(f.get('note'))))
      }}
    >
      <div className="selected-person">
        <Avatar name={item.driverName} />
        <div>
          <strong>{item.driverName}</strong>
          <small>
            {item.plate} · {item.truckType}
          </small>
        </div>
      </div>
      <label>
        วันที่ออกงาน <b>*</b>
        <DateInput name="date" required min={today()} defaultValue={today()} />
      </label>
      <ProvincePicker
        label="จังหวัดปลายทาง"
        inputLabel="เลือกจังหวัด"
        stops={stops}
        onChange={setStops}
      />
      <Hint>เพิ่มจังหวัดตามลำดับการวิ่ง พ่วงได้สูงสุด 8 จุดในเที่ยวเดียว</Hint>
      <label>
        รายละเอียดงาน <span className="optional">ผู้เข้าชมทุกคนเห็น</span>
        <textarea
          name="note"
          maxLength={300}
          placeholder="เช่น จุดส่งสินค้า หรือรายละเอียดเส้นทาง"
          rows={2}
        />
      </label>
      <Footer {...submit} label="ยืนยันจ่ายงานและนำออกจากคิว" />
    </form>
  )
}
export function CancelQueueForm({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  const s = useStore(),
    [replacement, setReplacement] = useState(''),
    [stops, setStops] = useState<string[]>([]),
    submit = useSubmit(onDone)
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        void submit.run(() =>
          s.cancelQueue(item.id, {
            reason: String(f.get('reason')),
            replacementDriverId: replacement,
            jobDate: String(f.get('jobDate') || today()),
            provinces: stops,
            deductionAmount: optionalSatang(String(f.get('deduction') || '0')),
            compensationAmount: replacement
              ? optionalSatang(String(f.get('compensation') || '0'))
              : 0,
            deductionRecipient: String(f.get('deductionRecipient') || ''),
          }),
        )
      }}
    >
      <p>
        นำ <strong>{item.driverName}</strong> ทะเบียน {item.plate} ออกจากคิว
      </p>
      <label>
        เหตุผลที่ยกเลิก <b>*</b>
        <textarea
          name="reason"
          rows={3}
          required
          maxLength={200}
          placeholder="เช่น รถเข้าซ่อม / คนรถขอลา"
        />
      </label>
      <div className="form-section-title">
        คนขึ้นงานแทน <span>ถ้ามี</span>
      </div>
      <label>
        ผู้ขึ้นงานแทน
        <select value={replacement} onChange={(e) => setReplacement(e.target.value)}>
          <option value="">ไม่มีคนขึ้นงานแทน</option>
          {s.data.queue
            .filter((q) => q.id !== item.id)
            .sort((a, b) => a.joinedAt - b.joinedAt)
            .map((q) => (
              <option key={q.id} value={q.id}>
                {q.driverName} · {q.plate}
              </option>
            ))}
        </select>
        <small className="field-help">เลือกจากรถในคิว ระบบจะจ่ายงานและนำคนแทนออกจากคิวด้วย</small>
      </label>
      {replacement && (
        <>
          <label>
            วันที่ขึ้นงานแทน <b>*</b>
            <DateInput name="jobDate" defaultValue={today()} min={today()} required />
          </label>
          <ProvincePicker
            label="จังหวัด / จุดส่งตามลำดับ"
            inputLabel="จังหวัดขึ้นงานแทน"
            stops={stops}
            onChange={setStops}
          />
        </>
      )}
      <div className="form-section-title">
        ยอดเงินจากการยกเลิก <span>ไม่คิดเงินใส่ 0</span>
      </div>
      <label>
        หักจาก {item.driverName} (บาท)
        <input
          name="deduction"
          inputMode="decimal"
          defaultValue="0"
          pattern="[0-9]+(\.[0-9]{1,2})?"
        />
      </label>
      <label>
        ยอดหักนี้ให้ใคร / เข้าบัญชีใด
        <input name="deductionRecipient" defaultValue="กองกลาง" maxLength={100} />
      </label>
      {replacement && (
        <label>
          ให้ผู้ขึ้นงานแทน (บาท)
          <input
            name="compensation"
            inputMode="decimal"
            defaultValue="0"
            pattern="[0-9]+(\.[0-9]{1,2})?"
          />
        </label>
      )}
      <Hint>
        ยอดหักและยอดให้คนแทนแยกกันได้ ระบบสร้างรายการ “รอดำเนินการ” ให้แต่ละคน
        ยืนยันจ่ายหรือหักจริงได้ที่การเงิน ไม่ต้องลงรายการซ้ำ
      </Hint>
      <Footer
        {...submit}
        label={replacement ? 'ยืนยันยกเลิกและจ่ายงานให้คนแทน' : 'ยืนยันยกเลิกคิว'}
      />
    </form>
  )
}
export function EntryForm({ onDone }: { onDone: () => void }) {
  const s = useStore(),
    [kind, setKind] = useState<Entry['kind']>('advance'),
    [images, setImages] = useState<PreparedEvidence[]>([]),
    [imageBusy, setImageBusy] = useState(false),
    [imageProgress, setImageProgress] = useState(''),
    [imageError, setImageError] = useState(''),
    submit = useSubmit(onDone)
  const preparing = useRef(false)
  async function onFiles(files: FileList | null) {
    if (!files?.length || preparing.current || submit.busy) return
    const selected = Array.from(files)
    setImageError('')
    if (images.length + selected.length > MAX_EVIDENCE_IMAGES) {
      setImageError(
        `เพิ่มได้อีก ${MAX_EVIDENCE_IMAGES - images.length} รูป (สูงสุด ${MAX_EVIDENCE_IMAGES} รูปต่อรายการ) กรุณาเลือกใหม่`,
      )
      return
    }
    preparing.current = true
    setImageBusy(true)
    try {
      const result: PreparedEvidence[] = [],
        failures: string[] = []
      for (const [index, file] of selected.entries()) {
        setImageProgress(`กำลังย่อรูป ${index + 1}/${selected.length}`)
        try {
          result.push(await compressEvidence(file))
        } catch (e) {
          failures.push(`${file.name}: ${errorMessage(e)}`)
        }
      }
      setImages((current) => [...current, ...result])
      if (failures.length)
        setImageError(`เพิ่มไม่ได้ ${failures.length} รูป\n${failures.join('\n')}`)
    } finally {
      preparing.current = false
      setImageBusy(false)
      setImageProgress('')
    }
  }
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (preparing.current) return
    const f = new FormData(e.currentTarget)
    void submit.run(async () => {
      const d = s.data.drivers.find((d) => d.id === f.get('driver'))
      if (!d) throw new Error('กรุณาเลือกคนรถ')
      await s.saveEntry(
        {
          driverId: d.id,
          driverName: d.name,
          plate: d.plate,
          kind,
          amount: toSatang(String(f.get('amount'))),
          date: String(f.get('date')),
          recipient: String(f.get('recipient')).trim(),
          description: String(f.get('description')).trim(),
          status: 'pending',
        },
        images.map(({ id, name, dataUrl }) => ({ id, name, dataUrl })),
      )
    })
  }
  return (
    <form className="form" onSubmit={save}>
      <div className="kind-options">
        {Object.entries(kinds)
          .filter(([k]) => k !== 'replacement')
          .map(([k, v]) => (
            <button
              type="button"
              key={k}
              className={k === kind ? 'active' : ''}
              onClick={() => setKind(k as Entry['kind'])}
            >
              {v}
            </button>
          ))}
      </div>
      <label>
        คนรถ / ทะเบียน <b>*</b>
        <select name="driver" required defaultValue="">
          <option value="" disabled>
            เลือกคนรถ
          </option>
          {s.data.drivers
            .filter((d) => d.active)
            .map((d) => (
              <option value={d.id} key={d.id}>
                {d.name} · {d.plate}
              </option>
            ))}
        </select>
      </label>
      <div className="form-grid">
        <label>
          จำนวนเงิน (บาท) <b>*</b>
          <input
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            required
            maxLength={14}
            pattern="[0-9]+(\.[0-9]{1,2})?"
          />
        </label>
        <label>
          วันที่ <b>*</b>
          <DateInput name="date" required defaultValue={today()} />
        </label>
      </div>
      <label>
        {kind === 'deduction' ? 'หักเงินให้ใคร / ผู้รับ' : 'ผู้รับเงิน / ร้านค้า'} <b>*</b>
        <input
          name="recipient"
          required
          maxLength={100}
          placeholder={
            kind === 'deduction' ? 'เช่น กองกลาง / ชื่อผู้รับ' : 'เช่น ชื่อคนรถ หรือชื่ออู่ซ่อมรถ'
          }
        />
      </label>
      <label>
        {kind === 'repair' ? 'รายละเอียดการซ่อม' : 'รายละเอียด / เหตุผล'} <b>*</b>
        <textarea
          name="description"
          required
          maxLength={500}
          rows={2}
          placeholder={
            kind === 'repair' ? 'เช่น เปลี่ยนยางหน้า 2 เส้น' : 'ระบุว่าเบิกหรือหักค่าอะไร'
          }
        />
      </label>
      <label>
        รูปหลักฐาน{' '}
        <span className="optional">
          {images.length}/{MAX_EVIDENCE_IMAGES} รูป
        </span>
      </label>
      <p className="evidence-help">เลือกหลายรูปพร้อมกัน หรือกดเพิ่มรูปอีกครั้งได้</p>
      <div className="evidence-upload evidence-upload-many" aria-busy={imageBusy}>
        {images.map((image) => (
          <div className="thumb" key={image.id}>
            <img src={image.dataUrl} alt={image.name} />
            <button
              type="button"
              disabled={imageBusy || submit.busy}
              onClick={() => setImages((current) => current.filter((i) => i.id !== image.id))}
              aria-label={`ลบรูป ${image.name}`}
            >
              <X size={14} />
            </button>
            <small>{fileSize(image.compressedBytes)}</small>
          </div>
        ))}
        {images.length < MAX_EVIDENCE_IMAGES && (
          <label className="upload-btn">
            {imageBusy ? <LoaderCircle size={22} className="spin" /> : <Camera size={22} />}
            <span>{imageBusy ? 'กำลังย่อรูป…' : 'เพิ่มรูปหลักฐาน'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              aria-label="เพิ่มรูปหลักฐาน"
              disabled={imageBusy || submit.busy}
              onChange={(e) => {
                void onFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        )}
      </div>
      {imageBusy && (
        <p className="evidence-help" role="status">
          {imageProgress} · กรุณารอให้ครบก่อนบันทึก
        </p>
      )}
      {images.length > 0 && (
        <div className="evidence-size-summary">
          <strong>
            {images.length} รูป · หลังย่อ{' '}
            {fileSize(images.reduce((sum, image) => sum + image.compressedBytes, 0))}
          </strong>
          <span>
            ต้นฉบับรวม {fileSize(images.reduce((sum, image) => sum + image.originalBytes, 0))} ·
            ขนาดไฟล์รูปก่อนจัดเก็บ
          </span>
        </div>
      )}
      {imageError && (
        <div className="form-error evidence-errors" role="alert">
          {imageError}
        </div>
      )}
      <Hint>
        ย่อเป็น JPG อัตโนมัติประมาณไม่เกิน 200 KB ต่อรูป ผู้ชมเปิดดูหลักฐานได้
        เก็บต้นฉบับไว้หากต้องการใช้เอกสารความละเอียดสูง
      </Hint>
      <Footer
        busy={submit.busy}
        disabled={imageBusy}
        error={submit.error}
        label="บันทึกรายการรอดำเนินการ"
      />
    </form>
  )
}
export function ConfirmForm({
  text,
  label,
  onConfirm,
  onDone,
}: {
  text: string
  label: string
  onConfirm: () => Promise<void>
  onDone: () => void
}) {
  const submit = useSubmit(onDone)
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        void submit.run(onConfirm)
      }}
    >
      <p className="confirm-text">{text}</p>
      <Footer {...submit} label={label} />
    </form>
  )
}
export function LoginPanel({
  onLogin,
  busy,
  error,
}: {
  onLogin: () => void
  busy: boolean
  error: string
}) {
  return (
    <div className="form">
      <div className="login-illustration">
        <span>G</span>
      </div>
      <h3 className="center">สำหรับผู้ดูแลระบบ</h3>
      <p className="center muted">
        จัดการคิว งานวิ่ง การเบิกเงิน และหลักฐาน
        <br />
        ด้วยบัญชี Google ที่ได้รับสิทธิ์
      </p>
      <button className="btn primary form-submit" disabled={busy} onClick={onLogin}>
        {busy ? <LoaderCircle size={18} className="spin" /> : <span className="google-g">G</span>}{' '}
        เข้าสู่ระบบด้วย Google <ArrowRight size={17} />
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Hint>
        ดูคิว คนรถ งานวิ่ง การเงินและหลักฐานได้ทันที เข้าสู่ระบบเมื่อต้องการเพิ่มหรือแก้ไข
      </Hint>
    </div>
  )
}
