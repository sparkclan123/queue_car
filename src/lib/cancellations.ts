import { collection, doc, runTransaction } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { provinces, today, validDate } from './model'
import type { Cancellation, CancellationInput, Entry, Job, QueueItem } from './model'

export function cancellationPlan(
  item: QueueItem,
  replacement: QueueItem | undefined,
  input: CancellationInput,
  id: string,
  actor: string,
  now = Date.now(),
  date = today(),
) {
  if (!input.reason.trim() || input.reason.trim().length > 200)
    throw new Error('ระบุเหตุผลยกเลิกไม่เกิน 200 ตัวอักษร')
  for (const amount of [input.deductionAmount, input.compensationAmount])
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000000)
      throw new Error('จำนวนเงินต้องเป็นศูนย์หรือไม่เกิน 10,000,000 บาท')
  if (
    input.replacementDriverId &&
    (!replacement || replacement.driverId !== input.replacementDriverId)
  )
    throw new Error('ผู้ขึ้นงานแทนไม่อยู่ในคิวแล้ว กรุณาเลือกใหม่')
  if (replacement?.driverId === item.driverId) throw new Error('ผู้ขึ้นงานแทนต้องเป็นคนรถคนอื่น')
  if (replacement && !input.replacementDriverId) throw new Error('กรุณาระบุผู้ขึ้นงานแทน')
  if (!replacement && input.compensationAmount)
    throw new Error('เลือกผู้ขึ้นงานแทนก่อนระบุค่าขึ้นงานแทน')
  if (
    input.deductionAmount &&
    (!input.deductionRecipient.trim() || input.deductionRecipient.trim().length > 100)
  )
    throw new Error('ระบุผู้รับยอดหักเงินไม่เกิน 100 ตัวอักษร')
  if (replacement && (!validDate(input.jobDate) || input.jobDate < date))
    throw new Error('วันที่ขึ้นงานแทนต้องเป็นวันนี้หรือวันถัดไป')
  if (
    replacement &&
    (!input.provinces.length ||
      input.provinces.length > 8 ||
      input.provinces.some((p) => !provinces.includes(p)))
  )
    throw new Error('เลือกจังหวัดขึ้นงานแทน 1–8 จุด')
  const record: Cancellation = {
    id,
    driverId: item.driverId,
    driverName: item.driverName,
    plate: item.plate,
    date,
    reason: input.reason.trim(),
    replacementDriverId: replacement?.driverId || '',
    replacementDriverName: replacement?.driverName || '',
    replacementPlate: replacement?.plate || '',
    replacementJobId: replacement ? `${id}_job` : '',
    replacementJobDate: replacement ? input.jobDate : '',
    replacementProvinces: replacement ? input.provinces : [],
    deductionAmount: input.deductionAmount,
    compensationAmount: input.compensationAmount,
    deductionEntryId: input.deductionAmount ? `${id}_deduction` : '',
    compensationEntryId: input.compensationAmount ? `${id}_replacement` : '',
    actor,
    createdAt: now,
  }
  const entries: Entry[] = []
  const makeEntry = (
    driver: QueueItem,
    entryId: string,
    kind: Entry['kind'],
    amount: number,
    recipient: string,
    description: string,
  ): Entry => ({
    id: entryId,
    driverId: driver.driverId,
    driverName: driver.driverName,
    plate: driver.plate,
    kind,
    amount,
    date,
    recipient,
    description,
    status: 'pending',
    evidenceCount: 0,
    createdAt: now,
    updatedAt: now,
    cancellationId: id,
  })
  if (input.deductionAmount)
    entries.push(
      makeEntry(
        item,
        record.deductionEntryId,
        'deduction',
        input.deductionAmount,
        input.deductionRecipient.trim(),
        `หักจากการยกเลิกคิว · ${record.reason}`,
      ),
    )
  if (replacement && input.compensationAmount)
    entries.push(
      makeEntry(
        replacement,
        record.compensationEntryId,
        'replacement',
        input.compensationAmount,
        replacement.driverName,
        `ขึ้นงานแทน ${item.driverName} · ${record.reason}`,
      ),
    )
  const job: Job | undefined = replacement
    ? {
        id: record.replacementJobId,
        driverId: replacement.driverId,
        driverName: replacement.driverName,
        plate: replacement.plate,
        truckType: replacement.truckType,
        date: input.jobDate,
        provinces: input.provinces,
        status: input.jobDate === date ? 'running' : 'scheduled',
        note: '',
        createdAt: now,
        updatedAt: now,
      }
    : undefined
  return { record, entries, job }
}

export async function cancelQueueTransaction(
  db: Firestore,
  queueId: string,
  input: CancellationInput,
  actor: string,
) {
  const cancellationRef = doc(collection(db, 'cancellations'))
  return runTransaction(db, async (tx) => {
    const current = await tx.get(doc(db, 'queue', queueId))
    if (!current.exists()) throw new Error('คิวนี้ถูกเปลี่ยนไปแล้ว กรุณาโหลดใหม่')
    const replacementRef = input.replacementDriverId
      ? doc(db, 'queue', input.replacementDriverId)
      : null
    const replacement = replacementRef ? await tx.get(replacementRef) : undefined
    const driver = input.replacementDriverId
      ? await tx.get(doc(db, 'drivers', input.replacementDriverId))
      : undefined
    if (
      input.replacementDriverId &&
      (!driver?.exists() || !driver.data().active || driver.data().activeJobId)
    )
      throw new Error('ผู้ขึ้นงานแทนมีงานอยู่หรือไม่พร้อมรับงาน')
    const plan = cancellationPlan(
      { id: current.id, ...current.data() } as QueueItem,
      replacement?.exists()
        ? ({ id: replacement.id, ...replacement.data() } as QueueItem)
        : undefined,
      input,
      cancellationRef.id,
      actor,
    )
    const { id: _id, ...record } = plan.record
    tx.set(cancellationRef, record)
    tx.delete(current.ref)
    if (plan.job && replacement && driver) {
      const { id, ...job } = plan.job
      tx.set(doc(db, 'jobs', id), job)
      tx.delete(replacement.ref)
      tx.update(driver.ref, { activeJobId: id, updatedAt: plan.record.createdAt })
    }
    for (const { id, ...entry } of plan.entries) tx.set(doc(db, 'entries', id), entry)
    tx.set(doc(collection(db, 'audits')), {
      action: 'ยกเลิกคิว',
      detail: `${record.driverName} · ${record.reason}${record.replacementDriverName ? ` · ขึ้นแทนโดย ${record.replacementDriverName}` : ''}`,
      actor,
      createdAt: record.createdAt,
    })
    return plan
  })
}
