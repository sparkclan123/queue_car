import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { cancellationPlan, cancelQueueTransaction } from '../lib/cancellations'
import { today } from '../lib/model'
import { changeQueueStatus } from '../lib/queue'
import type { CancellationInput, Job, QueueItem } from '../lib/model'
import { readReportRange } from '../lib/reports'
import { changeMemberRole, OWNER_EMAIL } from '../lib/members'
import { saveSalesContact } from '../lib/sales'
import type { Firestore } from 'firebase/firestore'
import {
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
let env: RulesTestEnvironment
const ownerEmail = 'owner@example.com'
const driver = {
  name: 'คนรถทดสอบ',
  plate: '70-0001',
  truckType: 'รถพ่วง 22 ล้อ',
  phone: '0800000000',
  active: true,
  activeJobId: '',
  createdAt: 1,
  updatedAt: 1,
}
const q = {
  driverId: 'd1',
  driverName: driver.name,
  plate: driver.plate,
  truckType: driver.truckType,
  joinedAt: 1,
}
const entry = {
  driverId: 'd1',
  driverName: driver.name,
  plate: driver.plate,
  kind: 'advance',
  amount: 10001,
  date: '2026-10-20',
  recipient: 'คนรถ',
  description: 'ค่าเดินทาง',
  status: 'pending',
  evidenceCount: 0,
  createdAt: 1,
  updatedAt: 1,
}
const job = {
  driverId: 'd1',
  driverName: driver.name,
  plate: driver.plate,
  truckType: driver.truckType,
  date: '2026-10-20',
  provinces: ['ชลบุรี', 'ระยอง'],
  status: 'running',
  note: '',
  createdAt: 1,
  updatedAt: 1,
}
function owner() {
  return env
    .authenticatedContext('owner', {
      email: ownerEmail,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore()
}
function outsider() {
  return env
    .authenticatedContext('outsider', {
      email: 'other@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore()
}
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-queue-car',
    firestore: { host: '127.0.0.1', port: 8085, rules: readFileSync('firestore.rules', 'utf8') },
  })
})
describe('cancellation, replacement and range reporting', () => {
  const input: CancellationInput = {
    reason: 'รถเสีย',
    replacementDriverId: 'd2',
    jobDate: today(),
    provinces: ['ชลบุรี', 'ระยอง'],
    deductionAmount: 50025,
    compensationAmount: 30050,
    deductionRecipient: 'กองกลาง',
  }
  async function replacementSeed() {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'drivers', 'd2'), {
        ...driver,
        name: 'คนแทน',
        plate: '70-0002',
      })
      await setDoc(doc(c.firestore(), 'queue', 'd2'), {
        ...q,
        driverId: 'd2',
        driverName: 'คนแทน',
        plate: '70-0002',
        joinedAt: 2,
      })
    })
  }
  it('atomically cancels original, assigns replacement and links unequal pending money entries', async () => {
    await replacementSeed()
    const db = owner() as unknown as Firestore
    await updateDoc(doc(db, 'queue', 'd1'), { status: 'heading' })
    const p = await cancelQueueTransaction(db, 'd1', input, ownerEmail)
    expect((await getDoc(doc(db, 'queue', 'd1'))).exists()).toBe(false)
    expect((await getDoc(doc(db, 'queue', 'd2'))).exists()).toBe(false)
    expect((await getDoc(doc(db, 'drivers', 'd2'))).data()?.activeJobId).toBe(p.job?.id)
    expect((await getDoc(doc(db, 'entries', p.record.deductionEntryId))).data()?.amount).toBe(50025)
    expect((await getDoc(doc(db, 'entries', p.record.compensationEntryId))).data()?.status).toBe(
      'pending',
    )
    const publicJob = (
      await getDoc(doc(env.unauthenticatedContext().firestore(), 'jobs', p.job!.id))
    ).data()
    expect(publicJob).not.toHaveProperty('reason')
    expect(publicJob).not.toHaveProperty('deductionAmount')
    await assertSucceeds(
      getDocs(collection(env.unauthenticatedContext().firestore(), 'cancellations')),
    )
    await assertSucceeds(getDocs(collection(outsider(), 'cancellations')))
    await assertSucceeds(
      updateDoc(doc(db, 'entries', p.record.deductionEntryId), { status: 'paid', updatedAt: 2 }),
    )
    await assertFails(updateDoc(doc(db, 'cancellations', p.record.id), { deductionAmount: 1 }))
  })
  it('supports a cancellation without any money or replacement', async () => {
    const db = owner() as unknown as Firestore
    const p = await cancelQueueTransaction(
      db,
      'd1',
      { ...input, replacementDriverId: '', deductionAmount: 0, compensationAmount: 0 },
      ownerEmail,
    )
    expect(p.job).toBeUndefined()
    expect(p.entries).toHaveLength(0)
    expect((await getDoc(doc(db, 'cancellations', p.record.id))).exists()).toBe(true)
    expect((await getDocs(collection(db, 'entries'))).size).toBe(1)
  })
  it('prevents duplicate payments when two clients cancel the same queue concurrently', async () => {
    await replacementSeed()
    const db = owner() as unknown as Firestore
    const results = await Promise.allSettled([
      cancelQueueTransaction(db, 'd1', input, ownerEmail),
      cancelQueueTransaction(db, 'd1', input, ownerEmail),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((await getDocs(collection(db, 'cancellations'))).size).toBe(1)
    expect((await getDocs(collection(db, 'entries'))).size).toBe(3)
  })
  it('leaves the original queue intact when replacement is no longer available', async () => {
    const db = owner() as unknown as Firestore
    await expect(cancelQueueTransaction(db, 'd1', input, ownerEmail)).rejects.toThrow()
    expect((await getDoc(doc(db, 'queue', 'd1'))).exists()).toBe(true)
    expect((await getDocs(collection(db, 'cancellations'))).empty).toBe(true)
  })
  it('rejects incomplete or tampered accounting batches without partially cancelling a queue', async () => {
    const db = owner() as unknown as Firestore
    const p = cancellationPlan(
      { id: 'd1', ...q } as QueueItem,
      undefined,
      {
        ...input,
        replacementDriverId: '',
        compensationAmount: 0,
      },
      'c_bad',
      ownerEmail,
    )
    const { id, ...record } = p.record
    const b = writeBatch(db)
    b.set(doc(db, 'cancellations', id), record)
    b.delete(doc(db, 'queue', 'd1'))
    const { id: entryId, ...value } = p.entries[0]
    b.set(doc(db, 'entries', entryId), { ...value, amount: value.amount + 1 })
    await assertFails(b.commit())
    expect((await getDoc(doc(db, 'queue', 'd1'))).exists()).toBe(true)
    expect((await getDoc(doc(db, 'cancellations', id))).exists()).toBe(false)
    await assertFails(
      setDoc(doc(db, 'entries', 'orphan'), {
        ...entry,
        kind: 'replacement',
        cancellationId: 'missing',
      }),
    )
    await assertFails(setDoc(doc(db, 'entries', 'orphan2'), { ...entry, kind: 'replacement' }))
  })
  it('paginates every record across a date range, including tied dates, without duplication', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      for (let i = 0; i < 5; i++)
        await setDoc(doc(c.firestore(), 'jobs', `range${i}`), {
          ...job,
          date: i === 4 ? '2026-11-01' : i === 0 ? '2026-09-30' : '2026-10-01',
        })
    })
    const rows = await readReportRange<Job>(
      env.unauthenticatedContext().firestore() as unknown as Firestore,
      'jobs',
      { start: '2026-09-30', end: '2026-10-20' },
      () => false,
      2,
    )
    expect(rows).toHaveLength(5)
    expect(new Set(rows.map((j) => j.id)).size).toBe(5)
    expect(rows.some((j) => j.date === '2026-11-01')).toBe(false)
    await expect(
      readReportRange(owner() as unknown as Firestore, 'jobs', {
        start: '2026-10-21',
        end: '2026-10-20',
      }),
    ).rejects.toThrow()
  })
})
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore()
    await Promise.all([
      setDoc(doc(db, 'admins', ownerEmail), { active: true }),
      setDoc(doc(db, 'drivers', 'd1'), driver),
      setDoc(doc(db, 'queue', 'd1'), q),
      setDoc(doc(db, 'settings', 'queue'), { tailAt: 1 }),
      setDoc(doc(db, 'jobs', 'historic'), { ...job, status: 'completed' }),
      setDoc(doc(db, 'entries', 'e1'), entry),
      setDoc(doc(db, 'entries', 'e1', 'evidence', 'i1'), {
        name: 'receipt.jpg',
        dataUrl: 'data:image/jpeg;base64,/9j/AA==',
      }),
      setDoc(doc(db, 'audits', 'a1'), {
        action: 'test',
        detail: 'private',
        actor: ownerEmail,
        createdAt: 1,
      }),
    ])
  })
})
afterAll(async () => {
  await env.cleanup()
})
describe('Guest and unauthorized isolation', () => {
  it('Guest can read queues and jobs without login', async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertSucceeds(getDocs(collection(db, 'queue')))
    await assertSucceeds(getDocs(collection(db, 'jobs')))
  })
  it('Guest can read driver contacts, money, evidence and audit, but not settings or admin roles', async () => {
    const db = env.unauthenticatedContext().firestore()
    for (const path of [
      ['drivers', 'd1'],
      ['entries', 'e1'],
      ['entries', 'e1', 'evidence', 'i1'],
      ['audits', 'a1'],
    ])
      await assertSucceeds(getDoc(doc(db, path.join('/'))))
    await assertFails(getDocs(collection(db, 'admins')))
    await assertFails(getDoc(doc(db, 'admins', ownerEmail)))
    await assertFails(getDocs(collection(db, 'settings')))
    expect((await getDoc(doc(db, 'drivers', 'd1'))).data()?.phone).toBe(driver.phone)
    const report = await readReportRange(db as unknown as Firestore, 'entries', {
      start: '2026-10-01',
      end: '2026-10-31',
    })
    expect(report).toHaveLength(1)
  })
  it('a Google account without admin role can read business records but cannot write', async () => {
    const db = outsider()
    await assertSucceeds(getDocs(collection(db, 'entries')))
    await assertFails(setDoc(doc(db, 'drivers', 'd2'), driver))
    await assertFails(updateDoc(doc(db, 'queue', 'd1'), { joinedAt: 5 }))
    await assertSucceeds(getDoc(doc(db, 'admins', 'other@example.com')))
  })
  it.each(['guest', 'outsider'])(
    '%s cannot create, edit or remove any business records',
    async (role) => {
      const db = role === 'guest' ? env.unauthenticatedContext().firestore() : outsider()
      for (const path of [
        'drivers/d1',
        'queue/d1',
        'jobs/historic',
        'entries/e1',
        'entries/e1/evidence/i1',
        'audits/a1',
      ]) {
        const ref = doc(db, path)
        const existing = (await getDoc(ref)).data()!
        await assertFails(setDoc(ref, existing))
        await assertFails(deleteDoc(ref))
      }
      await assertFails(setDoc(doc(db, 'drivers', 'new'), driver))
      await assertFails(setDoc(doc(db, 'entries', 'new'), entry))
      await assertFails(updateDoc(doc(db, 'drivers', 'd1'), { phone: '0811111111' }))
      await assertFails(updateDoc(doc(db, 'entries', 'e1'), { status: 'paid', updatedAt: 2 }))
      await assertFails(updateDoc(doc(db, 'entries', 'e1'), { status: 'void', updatedAt: 2 }))
      await assertFails(updateDoc(doc(db, 'queue', 'd1'), { status: 'heading' }))
      await expect(
        cancelQueueTransaction(
          db as unknown as Firestore,
          'd1',
          {
            reason: 'unauthorized',
            replacementDriverId: '',
            jobDate: today(),
            provinces: [],
            deductionAmount: 0,
            compensationAmount: 0,
            deductionRecipient: '',
          },
          ownerEmail,
        ),
      ).rejects.toThrow()
      expect((await getDoc(doc(db, 'queue', 'd1'))).exists()).toBe(true)
    },
  )
  it('cannot self-promote as a viewer or an ordinary admin', async () => {
    await assertFails(setDoc(doc(outsider(), 'admins', 'other@example.com'), { active: true }))
    await assertFails(setDoc(doc(owner(), 'admins', 'new@example.com'), { active: true }))
  })
  it('rejects unverified email and non-Google sign-in', async () => {
    for (const [verified, provider] of [
      [false, 'google.com'],
      [true, 'password'],
    ] as const) {
      const db = env
        .authenticatedContext('bad', {
          email: ownerEmail,
          email_verified: verified,
          firebase: { sign_in_provider: provider },
        })
        .firestore()
      await assertSucceeds(getDoc(doc(db, 'drivers', 'd1')))
      await assertFails(updateDoc(doc(db, 'drivers', 'd1'), { phone: '0811111111' }))
    }
  })
  it('queue documents reject fields outside their schema', async () => {
    await assertFails(updateDoc(doc(owner(), 'queue', 'd1'), { phone: '0800000000' }))
  })
})
describe('Admin workflows and constraints', () => {
  it('changes a legacy queue to heading and back without moving it or creating a job or payment', async () => {
    const db = owner() as unknown as Firestore
    const item = { id: 'd1', ...q }
    await changeQueueStatus(db, item, 'heading', ownerEmail)
    const guestQueue = await getDoc(doc(env.unauthenticatedContext().firestore(), 'queue', 'd1'))
    expect(guestQueue.data()).toEqual({ ...q, status: 'heading' })
    expect((await getDoc(doc(db, 'drivers', 'd1'))).data()?.activeJobId).toBe('')
    expect((await getDocs(collection(db, 'jobs'))).size).toBe(1)
    expect((await getDocs(collection(db, 'entries'))).size).toBe(1)
    const audits = await getDocs(collection(db, 'audits'))
    expect(audits.docs.some((d) => d.data().detail.includes('กำลังไปขึ้นงาน'))).toBe(true)
    await changeQueueStatus(db, { ...item, status: 'heading' }, 'waiting', ownerEmail)
    expect((await getDoc(doc(db, 'queue', 'd1'))).data()).toEqual({ ...q, status: 'waiting' })
  })
  it('only lets admins change queue status and rejects unsupported statuses', async () => {
    for (const db of [env.unauthenticatedContext().firestore(), outsider()]) {
      await assertFails(updateDoc(doc(db, 'queue', 'd1'), { status: 'heading' }))
    }
    for (const status of ['running', '', null, 1]) {
      await assertFails(updateDoc(doc(owner(), 'queue', 'd1'), { status }))
    }
  })
  it('accepts a new waiting queue and preserves heading through a driver edit and tail move', async () => {
    const db = owner()
    const create = writeBatch(db)
    create.set(doc(db, 'drivers', 'd2'), { ...driver, name: 'คนใหม่' })
    await create.commit()
    const join = writeBatch(db)
    join.set(doc(db, 'queue', 'd2'), {
      ...q,
      driverId: 'd2',
      driverName: 'คนใหม่',
      joinedAt: 2,
      status: 'waiting',
    })
    join.update(doc(db, 'settings', 'queue'), { tailAt: 2 })
    await assertSucceeds(join.commit())
    await updateDoc(doc(db, 'queue', 'd1'), { status: 'heading' })
    const edit = writeBatch(db)
    edit.update(doc(db, 'drivers', 'd1'), { name: 'ชื่อใหม่' })
    edit.update(doc(db, 'queue', 'd1'), { driverName: 'ชื่อใหม่' })
    await assertSucceeds(edit.commit())
    const move = writeBatch(db)
    move.update(doc(db, 'queue', 'd1'), { joinedAt: 3 })
    move.update(doc(db, 'settings', 'queue'), { tailAt: 3 })
    await assertSucceeds(move.commit())
    expect((await getDoc(doc(db, 'queue', 'd1'))).data()).toMatchObject({
      status: 'heading',
      joinedAt: 3,
      driverName: 'ชื่อใหม่',
    })
  })
  it('does not create duplicate status history when two clients submit the same change', async () => {
    const db = owner() as unknown as Firestore
    const results = await Promise.allSettled([
      changeQueueStatus(db, { id: 'd1', ...q }, 'heading', ownerEmail),
      changeQueueStatus(db, { id: 'd1', ...q }, 'heading', ownerEmail),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((await getDocs(collection(db, 'audits'))).size).toBe(2)
  })
  it('allows admin private records', async () => {
    await assertSucceeds(getDoc(doc(owner(), 'entries', 'e1', 'evidence', 'i1')))
    await assertSucceeds(getDocs(collection(owner(), 'drivers')))
  })
  it('moves a queue entry to the tail atomically', async () => {
    const db = owner(),
      b = writeBatch(db)
    b.update(doc(db, 'queue', 'd1'), { joinedAt: 2 })
    b.update(doc(db, 'settings', 'queue'), { tailAt: 2 })
    await assertSucceeds(b.commit())
    expect((await getDoc(doc(db, 'queue', 'd1'))).data()?.joinedAt).toBe(2)
  })
  it('does not allow a queue jump without advancing its sequence', async () => {
    await assertFails(updateDoc(doc(owner(), 'queue', 'd1'), { joinedAt: 999 }))
  })
  it.each(['legacy', 'heading'])('assigns a multi-province job from a %s queue', async (state) => {
    const db = owner(),
      b = writeBatch(db)
    if (state === 'heading') await updateDoc(doc(db, 'queue', 'd1'), { status: 'heading' })
    b.set(doc(db, 'jobs', 'j1'), job)
    b.delete(doc(db, 'queue', 'd1'))
    b.update(doc(db, 'drivers', 'd1'), { activeJobId: 'j1', updatedAt: 2 })
    await assertSucceeds(b.commit())
    expect((await getDoc(doc(db, 'queue', 'd1'))).exists()).toBe(false)
    await expect(
      changeQueueStatus(db as unknown as Firestore, { id: 'd1', ...q }, 'heading', ownerEmail),
    ).rejects.toThrow('คิวหรือสถานะถูกเปลี่ยนไปแล้ว')
  })
  it('does not allow standalone job creation without locking driver', async () => {
    await assertFails(setDoc(doc(owner(), 'jobs', 'j1'), job))
  })
  it('does not allow deactivating an in-queue driver', async () => {
    await assertFails(updateDoc(doc(owner(), 'drivers', 'd1'), { active: false }))
  })
  it('rejects negative and decimal satang', async () => {
    await assertFails(setDoc(doc(owner(), 'entries', 'bad'), { ...entry, amount: -100 }))
    await assertFails(setDoc(doc(owner(), 'entries', 'bad'), { ...entry, amount: 10.25 }))
  })
  it('saves entry and JPEG evidence atomically', async () => {
    const db = owner(),
      b = writeBatch(db)
    b.set(doc(db, 'entries', 'e2'), { ...entry, evidenceCount: 1 })
    b.set(doc(db, 'entries', 'e2', 'evidence', 'i1'), {
      name: 'receipt.jpg',
      dataUrl: 'data:image/jpeg;base64,/9j/AA==',
    })
    await assertSucceeds(b.commit())
  })
  it('cannot inject evidence after the immutable entry was created', async () => {
    await assertFails(
      setDoc(doc(owner(), 'entries', 'e1', 'evidence', 'new'), {
        name: 'bad.jpg',
        dataUrl: 'data:image/jpeg;base64,/9j/AA==',
      }),
    )
  })
  it('paid entries cannot change money and void records cannot be reopened', async () => {
    const db = owner()
    await assertSucceeds(updateDoc(doc(db, 'entries', 'e1'), { status: 'paid', updatedAt: 2 }))
    await assertFails(updateDoc(doc(db, 'entries', 'e1'), { amount: 10 }))
    await assertSucceeds(updateDoc(doc(db, 'entries', 'e1'), { status: 'void', updatedAt: 3 }))
    await assertFails(updateDoc(doc(db, 'entries', 'e1'), { status: 'pending', updatedAt: 4 }))
  })
  it('prevents spoofing the audit actor', async () => {
    await assertFails(
      setDoc(doc(owner(), 'audits', 'fake'), {
        action: 'edit',
        detail: '',
        actor: 'other@example.com',
        createdAt: 2,
      }),
    )
  })
  it('concurrent assignment only succeeds once', async () => {
    const db = owner()
    async function assign(id: string) {
      return runTransaction(db, async (tx) => {
        const ref = doc(db, 'queue', 'd1'),
          queue = await tx.get(ref)
        if (!queue.exists()) throw new Error('Already assigned')
        tx.set(doc(db, 'jobs', id), job)
        tx.delete(ref)
        tx.update(doc(db, 'drivers', 'd1'), { activeJobId: id, updatedAt: 2 })
      })
    }
    const results = await Promise.allSettled([assign('ja'), assign('jb')])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  })
})

describe('sales contact access and persistence', () => {
  const input = {
    name: 'เซลล์ทดสอบ',
    phone: '+66 81 234 5678',
    details: 'ดูแลลูกค้า\nชลบุรีและระยอง',
  }
  it('admin saves and edits a contact with audit history; guests can read full details', async () => {
    const db = owner() as unknown as Firestore
    const id = await saveSalesContact(db, input, ownerEmail)
    const guest = env.unauthenticatedContext().firestore()
    const initial = (await getDoc(doc(guest, 'salesContacts', id))).data()!
    expect(initial).toMatchObject({ name: input.name, phone: '0812345678', details: input.details })
    await saveSalesContact(
      db,
      { ...input, name: 'เซลล์ชื่อใหม่', phone: '02-123-4567', details: 'ดูแลกรุงเทพฯ' },
      ownerEmail,
      id,
    )
    expect((await getDoc(doc(guest, 'salesContacts', id))).data()).toMatchObject({
      name: 'เซลล์ชื่อใหม่',
      phone: '021234567',
      details: 'ดูแลกรุงเทพฯ',
      createdAt: initial.createdAt,
    })
    expect((await getDocs(collection(guest, 'salesContacts'))).size).toBe(1)
    expect((await getDocs(collection(db, 'audits'))).size).toBe(3)
    await expect(saveSalesContact(db, input, ownerEmail, 'missing')).rejects.toThrow(
      'ไม่พบข้อมูลเซลล์',
    )
  })
  it('guest and a signed-in viewer cannot add, edit or delete sales contacts', async () => {
    const id = await saveSalesContact(owner() as unknown as Firestore, input, ownerEmail)
    for (const db of [env.unauthenticatedContext().firestore(), outsider()]) {
      const record = (await getDoc(doc(db, 'salesContacts', id))).data()!
      await assertSucceeds(getDocs(collection(db, 'salesContacts')))
      await assertFails(setDoc(doc(db, 'salesContacts', 'new'), record))
      await assertFails(updateDoc(doc(db, 'salesContacts', id), { phone: '0899999999' }))
      await assertFails(deleteDoc(doc(db, 'salesContacts', id)))
    }
  })
  it('rejects malformed contact records, immutable timestamp changes and hard deletes', async () => {
    const db = owner()
    const value = {
      name: input.name,
      phone: '0812345678',
      details: input.details,
      createdAt: 1,
      updatedAt: 1,
    }
    for (const bad of [
      { ...value, name: '' },
      { ...value, name: '   ' },
      { ...value, name: 'x'.repeat(101) },
      { ...value, phone: '+12125551234' },
      { ...value, details: 'x'.repeat(2001) },
      { ...value, role: 'admin' },
      { ...value, updatedAt: 0 },
    ])
      await assertFails(setDoc(doc(db, 'salesContacts', 'bad'), bad))
    await assertSucceeds(setDoc(doc(db, 'salesContacts', 'valid'), value))
    await assertFails(updateDoc(doc(db, 'salesContacts', 'valid'), { createdAt: 0 }))
    await assertFails(deleteDoc(doc(db, 'salesContacts', 'valid')))
  })
})

describe('owner-managed membership', () => {
  function root(verified = true, provider: 'google.com' | 'password' = 'google.com') {
    return env
      .authenticatedContext('root', {
        email: OWNER_EMAIL,
        email_verified: verified,
        firebase: { sign_in_provider: provider },
      })
      .firestore()
  }
  const role = (active = true) => ({ active, updatedBy: OWNER_EMAIL, updatedAt: serverTimestamp() })
  const profile = () => ({
    email: 'other@example.com',
    name: 'สมาชิก',
    lastLoginAt: serverTimestamp(),
  })
  it('owner can grant and revoke an admin, including writes from an existing signed-in session', async () => {
    const member = outsider()
    await assertFails(updateDoc(doc(member, 'drivers', 'd1'), { phone: '0811111111' }))
    await changeMemberRole(root() as unknown as Firestore, ' OTHER@example.com ', true, OWNER_EMAIL)
    await assertSucceeds(updateDoc(doc(member, 'drivers', 'd1'), { phone: '0811111111' }))
    expect((await getDoc(doc(member, 'admins', 'other@example.com'))).data()?.active).toBe(true)
    await changeMemberRole(root() as unknown as Firestore, 'other@example.com', false, OWNER_EMAIL)
    await assertFails(updateDoc(doc(member, 'drivers', 'd1'), { phone: '0822222222' }))
    await assertSucceeds(getDoc(doc(member, 'drivers', 'd1')))
    expect((await getDocs(collection(root(), 'memberAudits'))).size).toBe(2)
  })
  it('only the owner can list roles, members and permission history', async () => {
    for (const name of ['admins', 'members', 'memberAudits']) {
      await assertSucceeds(getDocs(collection(root(), name)))
      for (const db of [owner(), outsider(), env.unauthenticatedContext().firestore()]) {
        await assertFails(getDocs(collection(db, name)))
      }
    }
    await assertFails(getDoc(doc(owner(), 'admins', 'someone@example.com')))
    for (const db of [owner(), outsider(), env.unauthenticatedContext().firestore()]) {
      await assertFails(setDoc(doc(db, 'admins', 'other@example.com'), role()))
      await assertFails(setDoc(doc(db, 'admins', OWNER_EMAIL), role(false)))
    }
  })
  it('protects owner access and validates every role change', async () => {
    await assertFails(setDoc(doc(root(), 'admins', OWNER_EMAIL), role(false)))
    await assertFails(deleteDoc(doc(root(), 'admins', OWNER_EMAIL)))
    await assertFails(setDoc(doc(root(), 'admins', 'Bad@Example.com'), role()))
    await assertFails(setDoc(doc(root(), 'admins', 'not-an-email'), role()))
    await assertFails(
      setDoc(doc(root(), 'admins', 'new@example.com'), { ...role(), role: 'owner' }),
    )
    await assertFails(
      setDoc(doc(root(), 'admins', 'new@example.com'), {
        ...role(),
        updatedBy: 'fake@example.com',
      }),
    )
    await assertFails(
      setDoc(doc(root(), 'admins', 'new@example.com'), { ...role(), active: 'true' }),
    )
    await assertSucceeds(setDoc(doc(root(), 'admins', 'new@example.com'), role()))
    await assertFails(deleteDoc(doc(root(), 'admins', 'new@example.com')))
    await assertSucceeds(updateDoc(doc(root(), 'drivers', 'd1'), { phone: '0811111111' }))
    for (const db of [root(false), root(true, 'password')]) {
      await assertFails(setDoc(doc(db, 'admins', 'new@example.com'), role()))
      await assertFails(getDocs(collection(db, 'members')))
    }
  })
  it('a signed-in Google user registers only their own verified profile and cannot inject roles', async () => {
    await assertSucceeds(setDoc(doc(outsider(), 'members', 'outsider'), profile()))
    await assertSucceeds(getDoc(doc(outsider(), 'members', 'outsider')))
    await assertSucceeds(
      setDoc(doc(outsider(), 'members', 'outsider'), { ...profile(), name: 'ชื่อใหม่' }),
    )
    await assertFails(setDoc(doc(outsider(), 'members', 'root'), profile()))
    await assertFails(
      setDoc(doc(outsider(), 'members', 'outsider'), { ...profile(), email: OWNER_EMAIL }),
    )
    await assertFails(
      setDoc(doc(outsider(), 'members', 'outsider'), { ...profile(), active: true }),
    )
    await assertFails(
      setDoc(doc(env.unauthenticatedContext().firestore(), 'members', 'outsider'), profile()),
    )
    await assertFails(getDoc(doc(owner(), 'members', 'outsider')))
    await assertSucceeds(getDoc(doc(root(), 'members', 'outsider')))
  })
})
