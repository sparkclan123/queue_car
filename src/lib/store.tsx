import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { auth, db, errorMessage, isDemo, resumeAuth } from './firebase'
import { demoData } from './demo'
import { cancellationPlan, cancelQueueTransaction } from './cancellations'
import { changeQueueStatus, validateQueueStatusChange } from './queue'
import { emptyData, queueStates, today } from './model'
import { OWNER_EMAIL } from './members'
import { useCurrentDay } from './useReports'
import { saveSalesContact as persistSalesContact, validateSalesContact } from './sales'
import type { SalesContactInput } from './sales'
import type {
  Audit,
  CancellationInput,
  Data,
  Driver,
  Entry,
  Evidence,
  Job,
  QueueItem,
  QueueStatus,
} from './model'

type Store = {
  data: Data
  admin: boolean
  owner: boolean
  email: string
  demo: boolean
  configured: boolean
  loading: boolean
  error: string
  jobsError: string
  online: boolean
  currentDay: string
  day: string
  setDay: (s: string) => void
  month: string
  setMonth: (s: string) => void
  toggleDemoAdmin: () => void
  saveSalesContact: (input: SalesContactInput, id?: string) => Promise<void>
  saveDriver: (
    d: Omit<Driver, 'id' | 'createdAt' | 'updatedAt' | 'activeJobId'>,
    id?: string,
  ) => Promise<void>
  joinQueue: (id: string) => Promise<void>
  cancelQueue: (id: string, input: CancellationInput) => Promise<void>
  moveToEnd: (item: QueueItem) => Promise<void>
  setQueueStatus: (item: QueueItem, status: QueueStatus) => Promise<void>
  saveJob: (q: QueueItem, date: string, provinces: string[], note: string) => Promise<void>
  jobStatus: (j: Job, status: Job['status']) => Promise<void>
  saveEntry: (
    e: Omit<Entry, 'id' | 'createdAt' | 'updatedAt' | 'evidenceCount'>,
    evidence: Evidence[],
  ) => Promise<void>
  entryStatus: (e: Entry, status: Entry['status']) => Promise<void>
  evidence: (id: string) => Promise<Evidence[]>
  resetDemo: () => void
}
const Context = createContext<Store | null>(null)
const demoKey = 'queuecar-demo-v1'
function initialDemo(): Data {
  try {
    const v = localStorage.getItem(demoKey)
    if (v) {
      const d = JSON.parse(v)
      if (d.drivers && d.queue && d.jobs && d.entries && d.audits)
        return { ...emptyData, ...d, cancellations: d.cancellations || [] }
    }
  } catch {}
  return demoData()
}
export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(() => (isDemo ? initialDemo() : emptyData)),
    [admin, setAdmin] = useState(false),
    [owner, setOwner] = useState(false),
    [email, setEmail] = useState(''),
    [loading, setLoading] = useState(!isDemo && !!db),
    [error, setError] = useState(''),
    [jobsError, setJobsError] = useState(''),
    [online, setOnline] = useState(navigator.onLine),
    [day, setDay] = useState(today()),
    [month, setMonth] = useState(today().slice(0, 7))
  const [demoEvidence, setDemoEvidence] = useState<Record<string, Evidence[]>>({})
  const currentDay = useCurrentDay()
  useEffect(() => {
    const on = () => setOnline(true),
      off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  useEffect(() => {
    if (isDemo)
      try {
        localStorage.setItem(demoKey, JSON.stringify(data))
      } catch {
        setError('พื้นที่ตัวอย่างในเครื่องเต็ม')
      }
  }, [data])
  useEffect(() => {
    if (!auth || !db) return
    void resumeAuth().catch((e) => setError(errorMessage(e)))
    let generation = 0
    let stopRole: (() => void) | undefined
    const stopAuth = onAuthStateChanged(auth, async (u) => {
      const g = ++generation
      stopRole?.()
      stopRole = undefined
      setAdmin(false)
      setOwner(false)
      setEmail(u?.email || '')
      if (u?.email && u.emailVerified) {
        try {
          const token = await u.getIdTokenResult()
          if (g !== generation || token.signInProvider !== 'google.com') return
          const email = u.email.toLowerCase()
          const isOwner = email === OWNER_EMAIL
          setOwner(isOwner)
          setAdmin(isOwner)
          stopRole = onSnapshot(
            doc(db!, 'admins', email),
            (snapshot) => {
              if (g === generation) setAdmin(isOwner || snapshot.data()?.active === true)
            },
            (e) => {
              if (g === generation) {
                setAdmin(isOwner)
                setError(errorMessage(e))
              }
            },
          )
          await setDoc(doc(db!, 'members', u.uid), {
            email,
            name: (u.displayName || '').slice(0, 100),
            lastLoginAt: serverTimestamp(),
          })
        } catch (e) {
          if (g === generation) setError(errorMessage(e))
        }
      }
    })
    return () => {
      generation++
      stopAuth()
      stopRole?.()
    }
  }, [])
  useEffect(() => {
    if (!db) return
    setLoading(true)
    setError('')
    setJobsError('')
    setData((d) => ({ ...d, jobs: [] }))
    const ready = new Set<string>()
    const fail = (e: unknown) => {
      setError(errorMessage(e))
      setLoading(false)
    }
    const subs = [
      onSnapshot(
        query(collection(db, 'queue'), orderBy('joinedAt')),
        (s) => {
          setData((d) => ({
            ...d,
            queue: s.docs.map((d) => ({ id: d.id, ...d.data() }) as QueueItem),
          }))
          ready.add('queue')
          if (ready.size >= 2) setLoading(false)
        },
        fail,
      ),
      onSnapshot(
        // Keep today's live activity available even when the jobs page is showing another day.
        query(collection(db, 'jobs'), where('date', 'in', [...new Set([day, currentDay])])),
        (s) => {
          setData((d) => ({ ...d, jobs: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Job) }))
          ready.add('jobs')
          if (ready.size >= 2) setLoading(false)
        },
        (e) => {
          setJobsError(errorMessage(e))
          fail(e)
        },
      ),
    ]
    return () => subs.forEach((s) => s())
  }, [day, currentDay])
  useEffect(() => {
    if (!db) return
    setData((d) => ({ ...d, entries: [] }))
    const fail = (e: unknown) => setError(errorMessage(e))
    const subs = [
      onSnapshot(
        query(collection(db, 'drivers'), orderBy('name'), limit(500)),
        (s) =>
          setData((d) => ({
            ...d,
            drivers: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Driver),
          })),
        fail,
      ),
      onSnapshot(
        query(
          collection(db, 'entries'),
          where('date', '>=', month + '-01'),
          where('date', '<=', month + '-31'),
          orderBy('date', 'desc'),
          limit(1000),
        ),
        (s) =>
          setData((d) => ({
            ...d,
            entries: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Entry),
          })),
        fail,
      ),
      onSnapshot(
        query(collection(db, 'audits'), orderBy('createdAt', 'desc'), limit(30)),
        (s) =>
          setData((d) => ({
            ...d,
            audits: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Audit),
          })),
        fail,
      ),
    ]
    return () => subs.forEach((s) => s())
  }, [month])
  const requireAdmin = () => {
    if (!admin) throw new Error('เฉพาะผู้ดูแลเท่านั้น')
    if (!online && !isDemo) throw new Error('กรุณาเชื่อมต่ออินเทอร์เน็ตก่อนบันทึก')
  }
  const audit = (action: string, detail: string): Omit<Audit, 'id'> => ({
    action,
    detail,
    actor: email || 'demo',
    createdAt: Date.now(),
  })
  const demoUpdate = (fn: (d: Data) => Data, action: string, detail: string) =>
    setData((d) => {
      const next = fn(d)
      return {
        ...next,
        audits: [{ id: crypto.randomUUID(), ...audit(action, detail) }, ...next.audits].slice(
          0,
          30,
        ),
      }
    })
  const saveSalesContact: Store['saveSalesContact'] = async (input, id) => {
    requireAdmin()
    if (!isDemo) {
      await persistSalesContact(db!, input, email, id)
      return
    }
    const value = validateSalesContact(input),
      now = Date.now()
    if (id && !data.salesContacts.some((contact) => contact.id === id))
      throw new Error('ไม่พบข้อมูลเซลล์นี้ กรุณาเปิดรายการใหม่')
    demoUpdate(
      (d) => ({
        ...d,
        salesContacts: id
          ? d.salesContacts.map((contact) =>
              contact.id === id ? { ...contact, ...value, updatedAt: now } : contact,
            )
          : [
              ...d.salesContacts,
              { ...value, id: crypto.randomUUID(), createdAt: now, updatedAt: now },
            ],
      }),
      id ? 'แก้ไขเซลล์' : 'เพิ่มเซลล์',
      value.name,
    )
  }
  const saveDriver: Store['saveDriver'] = async (input, id) => {
    requireAdmin()
    const name = input.name.trim(),
      plate = input.plate.trim()
    if (!name || !plate) throw new Error('กรุณาระบุชื่อคนรถและทะเบียน')
    const now = Date.now(),
      value = { ...input, name, plate, updatedAt: now }
    if (isDemo) {
      const current = data.drivers.find((d) => d.id === id)
      if (current?.activeJobId && !input.active) throw new Error('ต้องจบงานที่กำลังวิ่งก่อน')
      if (!input.active && data.queue.some((q) => q.id === id))
        throw new Error('กรุณานำคนรถออกจากคิวก่อน')
      demoUpdate(
        (d) => ({
          ...d,
          drivers: id
            ? d.drivers.map((x) => (x.id === id ? { ...x, ...value } : x))
            : [
                ...d.drivers,
                { ...value, id: crypto.randomUUID(), activeJobId: '', createdAt: now },
              ],
        }),
        'คนรถ',
        name,
      )
      return
    }
    const ref = id ? doc(db!, 'drivers', id) : doc(collection(db!, 'drivers'))
    await runTransaction(db!, async (tx) => {
      const current = await tx.get(ref)
      const queue = await tx.get(doc(db!, 'queue', ref.id))
      if (current.data()?.activeJobId && !input.active) throw new Error('ต้องจบงานที่กำลังวิ่งก่อน')
      if (queue.exists() && !input.active) throw new Error('กรุณานำคนรถออกจากคิวก่อน')
      tx.set(ref, current.exists() ? value : { ...value, createdAt: now, activeJobId: '' }, {
        merge: true,
      })
      if (queue.exists())
        tx.update(queue.ref, { driverName: name, plate, truckType: input.truckType })
      tx.set(doc(collection(db!, 'audits')), audit('คนรถ', name))
    })
  }
  const joinQueue: Store['joinQueue'] = async (id) => {
    requireAdmin()
    const make = (d: Driver): Omit<QueueItem, 'id'> => ({
      driverId: id,
      driverName: d.name,
      plate: d.plate,
      truckType: d.truckType,
      joinedAt: Date.now(),
      status: 'waiting',
    })
    if (isDemo) {
      const d = data.drivers.find((d) => d.id === id)
      if (!d || !d.active || d.activeJobId || data.queue.some((q) => q.id === id))
        throw new Error('คนรถนี้ไม่พร้อมลงคิว หรืออยู่ในคิวแล้ว')
      demoUpdate((s) => ({ ...s, queue: [...s.queue, { id, ...make(d) }] }), 'ลงคิว', d.name)
      return
    }
    await runTransaction(db!, async (tx) => {
      const d = await tx.get(doc(db!, 'drivers', id)),
        q = await tx.get(doc(db!, 'queue', id)),
        seq = await tx.get(doc(db!, 'settings', 'queue'))
      const tailAt = Math.max(Date.now(), (seq.data()?.tailAt || 0) + 1)
      if (!d.exists() || !d.data().active || d.data().activeJobId || q.exists())
        throw new Error('คนรถนี้ไม่พร้อมลงคิว หรืออยู่ในคิวแล้ว')
      tx.set(q.ref, { ...make({ id, ...d.data() } as Driver), joinedAt: tailAt })
      tx.set(seq.ref, { tailAt })
      tx.set(doc(collection(db!, 'audits')), audit('ลงคิว', d.data().name))
    })
  }
  const setQueueStatus: Store['setQueueStatus'] = async (item, status) => {
    requireAdmin()
    if (isDemo) {
      const current = data.queue.find((q) => q.id === item.id)
      validateQueueStatusChange(current, item, status)
      demoUpdate(
        (d) => ({ ...d, queue: d.queue.map((q) => (q.id === item.id ? { ...q, status } : q)) }),
        'สถานะคิว',
        `${current!.driverName} · ${queueStates[status]}`,
      )
      return
    }
    await changeQueueStatus(db!, item, status, email)
  }
  const cancelQueue: Store['cancelQueue'] = async (id, input) => {
    requireAdmin()
    if (isDemo) {
      const item = data.queue.find((q) => q.id === id)
      if (!item) throw new Error('คิวนี้ถูกเปลี่ยนไปแล้ว')
      const replacement = data.queue.find((q) => q.id === input.replacementDriverId)
      const driver = data.drivers.find((d) => d.id === input.replacementDriverId)
      if (replacement && (!driver?.active || driver.activeJobId))
        throw new Error('ผู้ขึ้นงานแทนไม่พร้อมรับงาน')
      const plan = cancellationPlan(item, replacement, input, crypto.randomUUID(), 'demo')
      demoUpdate(
        (d) => ({
          ...d,
          queue: d.queue.filter((q) => q.id !== id && q.id !== replacement?.id),
          jobs: plan.job ? [...d.jobs, plan.job] : d.jobs,
          entries: [...plan.entries, ...d.entries],
          cancellations: [plan.record, ...d.cancellations],
          drivers: plan.job
            ? d.drivers.map((driver) =>
                driver.id === replacement?.driverId
                  ? { ...driver, activeJobId: plan.job!.id, updatedAt: plan.record.createdAt }
                  : driver,
              )
            : d.drivers,
        }),
        'ยกเลิกคิว',
        `${item.driverName} · ${input.reason}${replacement ? ` · ขึ้นแทนโดย ${replacement.driverName}` : ''}`,
      )
      return
    }
    await cancelQueueTransaction(db!, id, input, email)
  }
  const moveToEnd: Store['moveToEnd'] = async (item) => {
    requireAdmin()
    if (isDemo) {
      const joinedAt = Math.max(Date.now(), ...data.queue.map((q) => q.joinedAt + 1))
      demoUpdate(
        (d) => ({ ...d, queue: d.queue.map((q) => (q.id === item.id ? { ...q, joinedAt } : q)) }),
        'ย้ายไปท้ายคิว',
        item.driverName,
      )
      return
    }
    await runTransaction(db!, async (tx) => {
      const q = await tx.get(doc(db!, 'queue', item.id)),
        seq = await tx.get(doc(db!, 'settings', 'queue'))
      if (!q.exists()) throw new Error('คิวนี้ถูกเปลี่ยนไปแล้ว')
      const tailAt = Math.max(Date.now(), (seq.data()?.tailAt || 0) + 1, q.data().joinedAt + 1)
      tx.update(q.ref, { joinedAt: tailAt })
      tx.set(seq.ref, { tailAt })
      tx.set(doc(collection(db!, 'audits')), audit('ย้ายไปท้ายคิว', q.data().driverName))
    })
  }
  const saveJob: Store['saveJob'] = async (q, date, provinces, note) => {
    requireAdmin()
    if (!provinces.length || provinces.length > 8) throw new Error('เลือกจังหวัด 1–8 จังหวัด')
    if (date < today()) throw new Error('วันออกงานต้องไม่เป็นวันที่ผ่านมาแล้ว')
    const now = Date.now(),
      value: Omit<Job, 'id'> = {
        driverId: q.driverId,
        driverName: q.driverName,
        plate: q.plate,
        truckType: q.truckType,
        date,
        provinces,
        status: date === today() ? 'running' : 'scheduled',
        note,
        createdAt: now,
        updatedAt: now,
      }
    if (isDemo) {
      const id = crypto.randomUUID()
      if (!data.queue.some((x) => x.id === q.id)) throw new Error('คิวนี้ถูกเปลี่ยนไปแล้ว')
      demoUpdate(
        (d) => ({
          ...d,
          queue: d.queue.filter((x) => x.id !== q.id),
          jobs: [...d.jobs, { id, ...value }],
          drivers: d.drivers.map((x) => (x.id === q.driverId ? { ...x, activeJobId: id } : x)),
        }),
        'จ่ายงาน',
        `${q.driverName} → ${provinces.join(' → ')}`,
      )
      return
    }
    const jobRef = doc(collection(db!, 'jobs'))
    await runTransaction(db!, async (tx) => {
      const queue = await tx.get(doc(db!, 'queue', q.id)),
        driver = await tx.get(doc(db!, 'drivers', q.driverId))
      if (!queue.exists() || !driver.exists() || driver.data().activeJobId)
        throw new Error('คิวนี้ถูกเปลี่ยนไปแล้ว กรุณาลองใหม่')
      tx.set(jobRef, {
        ...value,
        driverName: queue.data().driverName,
        plate: queue.data().plate,
        truckType: queue.data().truckType,
      })
      tx.delete(queue.ref)
      tx.update(driver.ref, { activeJobId: jobRef.id, updatedAt: now })
      tx.set(
        doc(collection(db!, 'audits')),
        audit('จ่ายงาน', `${q.driverName} → ${provinces.join(' → ')}`),
      )
    })
  }
  const jobStatus: Store['jobStatus'] = async (j, status) => {
    requireAdmin()
    const valid = (s: string) =>
      s === 'scheduled'
        ? ['running', 'cancelled'].includes(status)
        : s === 'running'
          ? ['completed', 'cancelled'].includes(status)
          : false
    if (isDemo) {
      const c = data.jobs.find((x) => x.id === j.id)
      if (!c || !valid(c.status)) throw new Error('สถานะงานถูกเปลี่ยนไปแล้ว')
      demoUpdate(
        (d) => ({
          ...d,
          jobs: d.jobs.map((x) => (x.id === j.id ? { ...x, status, updatedAt: Date.now() } : x)),
          drivers: d.drivers.map((x) =>
            x.id === j.driverId && status !== 'running' ? { ...x, activeJobId: '' } : x,
          ),
        }),
        'สถานะงาน',
        `${j.driverName} · ${status}`,
      )
      return
    }
    await runTransaction(db!, async (tx) => {
      const current = await tx.get(doc(db!, 'jobs', j.id)),
        driver = await tx.get(doc(db!, 'drivers', j.driverId))
      if (!current.exists() || !valid(current.data().status))
        throw new Error('สถานะงานถูกเปลี่ยนไปแล้ว')
      tx.update(current.ref, { status, updatedAt: Date.now() })
      if (driver.exists() && driver.data().activeJobId === j.id && status !== 'running')
        tx.update(driver.ref, { activeJobId: '', updatedAt: Date.now() })
      tx.set(doc(collection(db!, 'audits')), audit('สถานะงาน', `${j.driverName} · ${status}`))
    })
  }
  const saveEntry: Store['saveEntry'] = async (input, evidence) => {
    requireAdmin()
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 1000000000)
      throw new Error('จำนวนเงินไม่ถูกต้อง')
    if (evidence.length > 3) throw new Error('แนบได้ไม่เกิน 3 รูป')
    const value = {
      ...input,
      evidenceCount: evidence.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    if (isDemo) {
      const id = crypto.randomUUID()
      setDemoEvidence((v) => ({ ...v, [id]: evidence }))
      demoUpdate(
        (d) => ({ ...d, entries: [{ id, ...value }, ...d.entries] }),
        'การเงิน',
        input.description,
      )
      return
    }
    const ref = doc(collection(db!, 'entries'))
    const batch = writeBatch(db!)
    batch.set(ref, value)
    evidence.forEach(({ id, ...e }) => batch.set(doc(ref, 'evidence', id), e))
    batch.set(
      doc(collection(db!, 'audits')),
      audit('การเงิน', `${input.driverName} · ${input.description}`),
    )
    await batch.commit()
  }
  const entryStatus: Store['entryStatus'] = async (e, status) => {
    requireAdmin()
    if (isDemo) {
      if (e.status === 'void') throw new Error('รายการนี้ยกเลิกแล้ว')
      demoUpdate(
        (d) => ({
          ...d,
          entries: d.entries.map((x) =>
            x.id === e.id ? { ...x, status, updatedAt: Date.now() } : x,
          ),
        }),
        'สถานะการเงิน',
        `${e.driverName} · ${status}`,
      )
      return
    }
    await runTransaction(db!, async (tx) => {
      const current = await tx.get(doc(db!, 'entries', e.id))
      if (
        !current.exists() ||
        current.data().status === 'void' ||
        (status === 'paid' && current.data().status !== 'pending')
      )
        throw new Error('รายการนี้ถูกเปลี่ยนไปแล้ว')
      tx.update(current.ref, { status, updatedAt: Date.now() })
      tx.set(doc(collection(db!, 'audits')), audit('สถานะการเงิน', `${e.driverName} · ${status}`))
    })
  }
  const evidence: Store['evidence'] = async (id) => {
    if (isDemo) return demoEvidence[id] || []
    const s = await getDocs(collection(db!, 'entries', id, 'evidence'))
    return s.docs.map((x) => ({ id: x.id, ...x.data() }) as Evidence)
  }
  return (
    <Context.Provider
      value={{
        data,
        admin,
        owner: isDemo ? admin : owner,
        email,
        demo: isDemo,
        configured: !!db,
        loading,
        error,
        jobsError,
        online,
        currentDay,
        day,
        setDay,
        month,
        setMonth,
        toggleDemoAdmin: () => {
          if (isDemo) setAdmin(!admin)
        },
        saveDriver,
        saveSalesContact,
        joinQueue,
        cancelQueue,
        moveToEnd,
        setQueueStatus,
        saveJob,
        jobStatus,
        saveEntry,
        entryStatus,
        evidence,
        resetDemo: () => {
          setData(demoData())
          setDemoEvidence({})
        },
      }}
    >
      {children}
    </Context.Provider>
  )
}
export function useStore() {
  const s = useContext(Context)
  if (!s) throw new Error('Store missing')
  return s
}
