import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
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
  it('Guest cannot read drivers, money, evidence, audit or admin list', async () => {
    const db = env.unauthenticatedContext().firestore()
    for (const path of [
      ['drivers', 'd1'],
      ['entries', 'e1'],
      ['entries', 'e1', 'evidence', 'i1'],
      ['audits', 'a1'],
    ])
      await assertFails(getDoc(doc(db, path.join('/'))))
    await assertFails(getDocs(collection(db, 'admins')))
  })
  it('a Google account without admin role has no access to private data or writes', async () => {
    const db = outsider()
    await assertFails(getDocs(collection(db, 'entries')))
    await assertFails(setDoc(doc(db, 'drivers', 'd2'), driver))
    await assertFails(updateDoc(doc(db, 'queue', 'd1'), { joinedAt: 5 }))
    await assertSucceeds(getDoc(doc(db, 'admins', 'other@example.com')))
  })
  it('cannot self-promote even as owner', async () => {
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
      await assertFails(getDoc(doc(db, 'drivers', 'd1')))
    }
  })
  it('public documents cannot include private extra fields', async () => {
    await assertFails(updateDoc(doc(owner(), 'queue', 'd1'), { phone: '0800000000' }))
  })
})
describe('Admin workflows and constraints', () => {
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
  it('assigns a multi-province job and releases the queue in one batch', async () => {
    const db = owner(),
      b = writeBatch(db)
    b.set(doc(db, 'jobs', 'j1'), job)
    b.delete(doc(db, 'queue', 'd1'))
    b.update(doc(db, 'drivers', 'd1'), { activeJobId: 'j1', updatedAt: 2 })
    await assertSucceeds(b.commit())
    expect((await getDoc(doc(db, 'queue', 'd1'))).exists()).toBe(false)
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
