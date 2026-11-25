import { collection, doc, runTransaction } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { queueStates, queueStatus } from './model'
import type { Driver, Job, QueueItem, QueueStatus } from './model'

export function queueJoinPlan(
  driver: Driver | undefined,
  alreadyQueued: boolean,
  job: Job | undefined,
  expectedJobId: string,
  joinedAt: number,
) {
  if (!driver?.active || alreadyQueued) throw new Error('คนรถนี้ไม่พร้อมลงคิว หรืออยู่ในคิวแล้ว')
  if ((driver.activeJobId || '') !== expectedJobId)
    throw new Error('งานของคนรถเปลี่ยนไปแล้ว กรุณาเปิดรายการลงคิวใหม่')
  if (
    expectedJobId &&
    (job?.id !== expectedJobId || job.driverId !== driver.id || job.status !== 'running')
  )
    throw new Error('ลงคิวพร้อมจบงานได้เฉพาะเที่ยวที่กำลังวิ่ง')

  const item = {
    driverId: driver.id,
    driverName: driver.name,
    plate: driver.plate,
    truckType: driver.truckType,
    joinedAt,
    status: 'waiting',
  } satisfies Omit<QueueItem, 'id'>
  const action = expectedJobId ? 'จบงานและลงคิว' : 'ลงคิว'
  const detail = job ? `${driver.name} · ${job.provinces.join(' → ')}` : driver.name
  return { item, action, detail }
}

export async function joinQueueTransaction(
  db: Firestore,
  driverId: string,
  expectedJobId: string,
  actor: string,
) {
  await runTransaction(db, async (tx) => {
    const driver = await tx.get(doc(db, 'drivers', driverId))
    const queue = await tx.get(doc(db, 'queue', driverId))
    const sequence = await tx.get(doc(db, 'settings', 'queue'))
    const job = expectedJobId ? await tx.get(doc(db, 'jobs', expectedJobId)) : undefined
    const now = Date.now()
    const joinedAt = Math.max(now, (sequence.data()?.tailAt || 0) + 1)
    const { item, action, detail } = queueJoinPlan(
      driver.exists() ? ({ ...driver.data(), id: driver.id } as Driver) : undefined,
      queue.exists(),
      job?.exists() ? ({ ...job.data(), id: job.id } as Job) : undefined,
      expectedJobId,
      joinedAt,
    )
    if (job) {
      tx.update(job.ref, { status: 'completed', updatedAt: now })
      tx.update(driver.ref, { activeJobId: '', updatedAt: now })
    }
    tx.set(queue.ref, item)
    tx.set(sequence.ref, { tailAt: joinedAt })
    tx.set(doc(collection(db, 'audits')), { action, detail, actor, createdAt: now })
  })
}

export function validateQueueStatusChange(
  current: QueueItem | undefined,
  expected: QueueItem,
  status: QueueStatus,
) {
  if (status !== 'waiting' && status !== 'heading') throw new Error('สถานะคิวไม่ถูกต้อง')
  if (
    !current ||
    current.id !== expected.id ||
    current.joinedAt !== expected.joinedAt ||
    queueStatus(current) !== queueStatus(expected) ||
    queueStatus(current) === status
  )
    throw new Error('คิวหรือสถานะถูกเปลี่ยนไปแล้ว กรุณาเปิดคิวล่าสุดอีกครั้ง')
}

export async function changeQueueStatus(
  db: Firestore,
  item: QueueItem,
  status: QueueStatus,
  actor: string,
) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'queue', item.id)
    const snapshot = await tx.get(ref)
    const current = snapshot.exists()
      ? ({ ...snapshot.data(), id: snapshot.id } as QueueItem)
      : undefined
    validateQueueStatusChange(current, item, status)
    tx.update(ref, { status })
    tx.set(doc(collection(db, 'audits')), {
      action: 'สถานะคิว',
      detail: `${current!.driverName} · ${queueStates[status]}`,
      actor,
      createdAt: Date.now(),
    })
  })
}
