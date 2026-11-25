import { entryStates, jobStates, kinds } from './model'
import type { Cancellation, Entry, Job } from './model'

export function financeCsvRows(entries: Entry[]) {
  return [
    [
      'วันที่',
      'ประเภท',
      'คนรถ',
      'ทะเบียน',
      'จำนวนเงิน (บาท)',
      'ผู้รับเงิน / ผู้รับยอดหัก',
      'รายละเอียด',
      'สถานะ',
      'จำนวนรูปหลักฐาน',
      'รหัสรายการยกเลิกคิว',
    ],
    ...entries.map((entry) => [
      entry.date,
      kinds[entry.kind],
      entry.driverName,
      entry.plate,
      (entry.amount / 100).toFixed(2),
      entry.recipient,
      entry.description,
      entryStates[entry.status],
      entry.evidenceCount,
      entry.cancellationId ?? '',
    ]),
  ]
}

export function jobsCsvRows(jobs: Job[]) {
  return [
    ['วันที่', 'คนรถ', 'ทะเบียน', 'เส้นทาง', 'สถานะ', 'รายละเอียด'],
    ...jobs.map((job) => [
      job.date,
      job.driverName,
      job.plate,
      job.provinces.join(' → '),
      jobStates[job.status],
      job.note,
    ]),
  ]
}

export function cancellationsCsvRows(cancellations: Cancellation[], entries: Entry[]) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  return [
    [
      'วันที่',
      'คนรถ',
      'ทะเบียน',
      'เหตุผล',
      'ยอดหัก (บาท)',
      'ผู้รับยอดหัก',
      'สถานะยอดหัก',
      'คนขึ้นแทน',
      'เส้นทางคนขึ้นแทน',
      'ค่าขึ้นแทน (บาท)',
      'รหัสรายการยกเลิกคิว',
    ],
    ...cancellations.map((item) => {
      const deduction = byId.get(item.deductionEntryId)
      return [
        item.date,
        item.driverName,
        item.plate,
        item.reason,
        item.deductionAmount / 100,
        deduction?.recipient ?? '',
        deduction ? entryStates[deduction.status] : '',
        item.replacementDriverName,
        item.replacementProvinces.join(' → '),
        item.compensationAmount / 100,
        item.id,
      ]
    }),
  ]
}
