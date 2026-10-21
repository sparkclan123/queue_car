import {
  collection,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore'
import type { Firestore, QueryConstraint, QueryDocumentSnapshot } from 'firebase/firestore'
import { kinds, validDate } from './model'
import type { Cancellation, Entry, Job } from './model'

export type Period = { start: string; end: string }
export type ReportData = { jobs: Job[]; entries: Entry[]; cancellations: Cancellation[] }
export const emptyReport: ReportData = { jobs: [], entries: [], cancellations: [] }
export function validatePeriod({ start, end }: Period) {
  if (!validDate(start) || !validDate(end)) throw new Error('กรุณาเลือกวันที่ให้ครบ')
  if (start > end) throw new Error('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด')
}
export function inPeriod(date: string, period: Period) {
  return date >= period.start && date <= period.end
}
export function filterReport(data: ReportData, period: Period): ReportData {
  validatePeriod(period)
  return {
    jobs: data.jobs.filter((j) => inPeriod(j.date, period)),
    entries: data.entries.filter((e) => inPeriod(e.date, period)),
    cancellations: data.cancellations.filter((c) => inPeriod(c.date, period)),
  }
}
export async function readReportRange<T>(
  db: Firestore,
  path: string,
  period: Period,
  cancelled = () => false,
  pageSize = 500,
): Promise<T[]> {
  validatePeriod(period)
  const rows: T[] = []
  let cursor: QueryDocumentSnapshot | undefined
  do {
    if (cancelled()) throw new Error('ยกเลิกการโหลดรายงาน')
    const constraints: QueryConstraint[] = [
      where('date', '>=', period.start),
      where('date', '<=', period.end),
      orderBy('date', 'desc'),
      limit(pageSize),
    ]
    if (cursor) constraints.push(startAfter(cursor))
    const page = await getDocsFromServer(query(collection(db, path), ...constraints))
    rows.push(...page.docs.map((d) => ({ id: d.id, ...d.data() }) as T))
    if (rows.length > 20000)
      throw new Error('ช่วงนี้มีข้อมูลมากกว่า 20,000 รายการ กรุณาเลือกช่วงวันที่สั้นลง')
    if (page.size < pageSize) break
    cursor = page.docs.at(-1)
  } while (cursor)
  return rows
}
export function totals(data: ReportData) {
  const entries = data.entries.filter((e) => e.status !== 'void')
  const byKind = Object.fromEntries(
    Object.keys(kinds).map((k) => [
      k,
      entries.filter((e) => e.kind === k).reduce((sum, e) => sum + e.amount, 0),
    ]),
  ) as Record<Entry['kind'], number>
  const sum = (status: Entry['status'], deduction: boolean) =>
    entries
      .filter((e) => e.status === status && (e.kind === 'deduction') === deduction)
      .reduce((n, e) => n + e.amount, 0)
  const paidOut = sum('paid', false),
    paidDeduction = sum('paid', true)
  return {
    trips: data.jobs.filter((j) => j.status !== 'cancelled').length,
    completed: data.jobs.filter((j) => j.status === 'completed').length,
    running: data.jobs.filter((j) => j.status === 'running').length,
    scheduled: data.jobs.filter((j) => j.status === 'scheduled').length,
    provinces: [
      ...new Set(data.jobs.filter((j) => j.status !== 'cancelled').flatMap((j) => j.provinces)),
    ],
    byKind,
    advanceCount: entries.filter((e) => e.kind === 'advance').length,
    outgoing: entries.filter((e) => e.kind !== 'deduction').reduce((n, e) => n + e.amount, 0),
    deductions: byKind.deduction,
    paidOut,
    paidDeduction,
    netPaid: paidOut - paidDeduction,
    pendingOut: sum('pending', false),
    pendingDeduction: sum('pending', true),
    entryCount: entries.length,
  }
}
export function reportDays(data: ReportData) {
  const days = new Map<string, ReportData>()
  function group(date: string) {
    if (!days.has(date)) days.set(date, { jobs: [], entries: [], cancellations: [] })
    return days.get(date)!
  }
  for (const j of data.jobs) if (j.status !== 'cancelled') group(j.date).jobs.push(j)
  for (const e of data.entries) if (e.status !== 'void') group(e.date).entries.push(e)
  return [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({ date, totals: totals(rows) }))
}
export function forDriver(data: ReportData, driverId: string): ReportData {
  return {
    jobs: data.jobs.filter((j) => j.driverId === driverId),
    entries: data.entries.filter((e) => e.driverId === driverId),
    cancellations: data.cancellations.filter(
      (c) => c.driverId === driverId || c.replacementDriverId === driverId,
    ),
  }
}
export function reportDrivers(data: ReportData) {
  const drivers = new Map<string, { id: string; name: string; plate: string }>()
  const groups = new Map<string, ReportData>()
  function group(id: string) {
    if (!groups.has(id)) groups.set(id, { jobs: [], entries: [], cancellations: [] })
    return groups.get(id)!
  }
  const latest = new Map<string, { date: string; createdAt: number }>()
  function remember(id: string, name: string, plate: string, date: string, createdAt: number) {
    const previous = latest.get(id)
    if (
      !previous ||
      date > previous.date ||
      (date === previous.date && createdAt > previous.createdAt)
    ) {
      drivers.set(id, { id, name, plate })
      latest.set(id, { date, createdAt })
    }
  }
  for (const row of [...data.jobs, ...data.entries, ...data.cancellations])
    remember(row.driverId, row.driverName, row.plate, row.date, row.createdAt)
  for (const c of data.cancellations)
    if (c.replacementDriverId)
      remember(
        c.replacementDriverId,
        c.replacementDriverName,
        c.replacementPlate,
        c.date,
        c.createdAt,
      )
  for (const j of data.jobs) group(j.driverId).jobs.push(j)
  for (const e of data.entries) group(e.driverId).entries.push(e)
  for (const c of data.cancellations) {
    group(c.driverId).cancellations.push(c)
    if (c.replacementDriverId) group(c.replacementDriverId).cancellations.push(c)
  }
  return [...drivers.values()]
    .map((d) => ({ ...d, totals: totals(group(d.id)) }))
    .sort((a, b) => b.totals.trips - a.totals.trips || a.name.localeCompare(b.name, 'th'))
}
