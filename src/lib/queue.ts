import { collection, doc, runTransaction } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { queueStates, queueStatus } from './model'
import type { QueueItem, QueueStatus } from './model'

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
