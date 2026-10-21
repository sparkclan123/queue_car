import { describe, expect, it } from 'vitest'
import { cancellationPlan } from '../lib/cancellations'
import { optionalSatang } from '../lib/model'
import type { CancellationInput, Entry, Job, QueueItem } from '../lib/model'
import {
  filterReport,
  forDriver,
  reportDays,
  reportDrivers,
  totals,
  validatePeriod,
} from '../lib/reports'
const queue: QueueItem = {
  id: 'd1',
  driverId: 'd1',
  driverName: 'คนเดิม',
  plate: '70-0001',
  truckType: '10 ล้อ',
  joinedAt: 1,
}
const replacement = { ...queue, id: 'd2', driverId: 'd2', driverName: 'คนแทน', plate: '70-0002' }
const input: CancellationInput = {
  reason: 'รถเสีย',
  replacementDriverId: 'd2',
  jobDate: '2026-10-20',
  provinces: ['ชลบุรี', 'ระยอง'],
  deductionAmount: 50025,
  compensationAmount: 30050,
  deductionRecipient: 'กองกลาง',
}
const plan = (changes: Partial<CancellationInput> = {}) =>
  cancellationPlan(queue, replacement, { ...input, ...changes }, 'c1', 'owner', 1, '2026-10-20')
describe('cancellation and replacement accounting', () => {
  it('records unequal deduction and compensation once and attributes each to the correct driver', () => {
    const p = plan()
    expect(p.entries.map((e) => [e.driverId, e.kind, e.amount, e.status])).toEqual([
      ['d1', 'deduction', 50025, 'pending'],
      ['d2', 'replacement', 30050, 'pending'],
    ])
    expect(p.entries.every((e) => e.cancellationId === p.record.id)).toBe(true)
    expect(p.job?.driverId).toBe('d2')
    expect(p.job?.provinces).toEqual(['ชลบุรี', 'ระยอง'])
    expect(p.job).not.toHaveProperty('deductionAmount')
    expect(p.job?.note).toBe('')
  })
  it('supports cancellation with no replacement or money', () => {
    const p = cancellationPlan(
      queue,
      undefined,
      {
        ...input,
        replacementDriverId: '',
        deductionAmount: 0,
        compensationAmount: 0,
        provinces: [],
      },
      'c2',
      'owner',
      1,
      '2026-10-20',
    )
    expect(p.entries).toEqual([])
    expect(p.job).toBeUndefined()
    expect(p.record.replacementJobId).toBe('')
  })
  it('supports deduction without a replacement and schedules future replacement jobs', () => {
    const p = cancellationPlan(
      queue,
      undefined,
      { ...input, replacementDriverId: '', compensationAmount: 0 },
      'c2',
      'owner',
      1,
      '2026-10-20',
    )
    expect(p.entries).toHaveLength(1)
    expect(plan({ jobDate: '2026-10-21' }).job?.status).toBe('scheduled')
  })
  it.each([-1, 1.25, 1000000001, NaN])('rejects invalid monetary units %s', (amount) => {
    expect(() => plan({ deductionAmount: amount })).toThrow()
    expect(() => plan({ compensationAmount: amount })).toThrow()
  })
  it('rejects self replacement, missing replacement, past dates and bad routes', () => {
    expect(() =>
      cancellationPlan(queue, queue, { ...input, replacementDriverId: 'd1' }, 'c1', 'owner'),
    ).toThrow()
    expect(() => cancellationPlan(queue, undefined, input, 'c1', 'owner')).toThrow()
    expect(() => plan({ jobDate: '2026-10-19' })).toThrow()
    expect(() => plan({ provinces: [] })).toThrow()
    expect(() => plan({ provinces: ['ไม่ใช่จังหวัด'] })).toThrow()
    expect(() => plan({ deductionRecipient: '' })).toThrow()
  })
  it('accepts optional zero amounts without allowing invalid input', () => {
    for (const value of ['', '0', '0.00']) expect(optionalSatang(value)).toBe(0)
    expect(optionalSatang('0.29')).toBe(29)
    for (const value of ['-1', 'NaN', '1e2', '0.000']) expect(() => optionalSatang(value)).toThrow()
  })
})
describe('date range reports', () => {
  const baseJob = {
    id: 'j1',
    driverId: 'd1',
    driverName: 'คนเดิม',
    plate: '70-0001',
    truckType: '10 ล้อ',
    date: '2026-10-01',
    provinces: ['ชลบุรี', 'ระยอง'],
    status: 'completed',
    note: '',
    createdAt: 1,
    updatedAt: 1,
  } as Job
  const baseEntry = {
    id: 'e1',
    driverId: 'd1',
    driverName: 'คนเดิม',
    plate: '70-0001',
    kind: 'advance',
    date: '2026-10-20',
    amount: 10001,
    recipient: 'คนเดิม',
    description: 'เบิกเดินทาง',
    status: 'paid',
    evidenceCount: 0,
    createdAt: 1,
    updatedAt: 1,
  } as Entry
  it('uses the latest recorded driver identity while retaining historical details', () => {
    const rows = reportDrivers({
      jobs: [{ ...baseJob, date: '2026-10-20', plate: '70-9999' }, baseJob],
      entries: [{ ...baseEntry, date: '2026-09-30' }],
      cancellations: [],
    })
    expect(rows[0].plate).toBe('70-9999')
    expect(rows[0].totals.trips).toBe(2)
  })
  it('includes both endpoints across months and rejects invalid or reversed dates', () => {
    const data = {
      jobs: [baseJob, { ...baseJob, id: 'j2', date: '2026-09-30' }],
      entries: [baseEntry],
      cancellations: [],
    }
    expect(filterReport(data, { start: '2026-10-01', end: '2026-10-20' }).jobs).toHaveLength(1)
    expect(filterReport(data, { start: '2026-09-30', end: '2026-10-20' }).jobs).toHaveLength(2)
    expect(filterReport(data, { start: '2026-10-01', end: '2026-10-20' }).entries).toHaveLength(1)
    expect(() => validatePeriod({ start: '2026-10-21', end: '2026-10-20' })).toThrow()
    expect(() => validatePeriod({ start: '2026-02-30', end: '2026-03-01' })).toThrow()
    expect(() => validatePeriod({ start: '', end: '2026-03-01' })).toThrow()
  })
  it('keeps pending amounts separate from paid amounts and excludes voided/cancelled records from totals', () => {
    const t = totals({
      jobs: [baseJob, { ...baseJob, id: 'j2', status: 'cancelled' }],
      entries: [
        baseEntry,
        { ...baseEntry, id: 'e2', amount: 20002, status: 'pending' },
        { ...baseEntry, id: 'e3', amount: 99999, status: 'void' },
        { ...baseEntry, id: 'e4', kind: 'deduction', amount: 5001 },
        { ...baseEntry, id: 'e5', kind: 'deduction', amount: 7002, status: 'pending' },
      ],
      cancellations: [],
    })
    expect(t.trips).toBe(1)
    expect(t.completed).toBe(1)
    expect(t.outgoing).toBe(30003)
    expect(t.deductions).toBe(12003)
    expect(t.netPaid).toBe(5000)
    expect(t.pendingOut).toBe(20002)
    expect(t.pendingDeduction).toBe(7002)
    expect(t.entryCount).toBe(4)
    expect(t.advanceCount).toBe(2)
  })
  it('charts count advances separately from repairs and count a multi-province job once', () => {
    const data = filterReport(
      {
        jobs: [baseJob, { ...baseJob, id: 'j2', status: 'cancelled' }],
        entries: [
          baseEntry,
          { ...baseEntry, id: 'e2', amount: 20202, status: 'pending' },
          { ...baseEntry, id: 'e3', kind: 'repair', amount: 80000 },
          { ...baseEntry, id: 'e4', status: 'void', amount: 99999 },
          { ...baseEntry, id: 'e5', date: '2026-09-30' },
        ],
        cancellations: [],
      },
      { start: '2026-10-01', end: '2026-10-20' },
    )
    const person = reportDrivers(data)[0]
    expect(person.totals.advanceCount).toBe(2)
    expect(person.totals.byKind.advance).toBe(30203)
    expect(person.totals.outgoing).toBe(110203)
    expect(person.totals.trips).toBe(1)
    const days = reportDays(data)
    expect(days.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-20'])
    expect(days[0].totals.trips).toBe(1)
    expect(days[1].totals.advanceCount).toBe(2)
    expect(days[1].totals.byKind.advance).toBe(30203)
    expect(
      reportDays({
        jobs: [{ ...baseJob, status: 'cancelled' }],
        entries: [{ ...baseEntry, status: 'void' }],
        cancellations: [],
      }),
    ).toEqual([])
  })
  it('includes the cancellation in both driver histories but never double counts money', () => {
    const p = plan(),
      data = { jobs: [p.job!], entries: p.entries, cancellations: [p.record] }
    expect(reportDrivers(data)).toHaveLength(2)
    expect(forDriver(data, 'd1').cancellations).toHaveLength(1)
    expect(forDriver(data, 'd2').cancellations).toHaveLength(1)
    expect(totals(forDriver(data, 'd1')).outgoing).toBe(0)
    expect(totals(forDriver(data, 'd1')).deductions).toBe(50025)
    expect(totals(forDriver(data, 'd2')).outgoing).toBe(30050)
    expect(totals(data).outgoing).toBe(30050)
  })
})
