import { useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowRight, ChevronRight, RefreshCw, Search } from 'lucide-react'
import {
  dateLabel,
  entryStates,
  exportCsv,
  jobStates,
  kinds,
  money,
  queueStates,
  queueStatus,
  shiftDate,
} from '../lib/model'
import type { Cancellation, Driver, Entry, Job, QueueItem } from '../lib/model'
import { forDriver, reportDrivers, totals, validatePeriod } from '../lib/reports'
import type { Period, ReportData } from '../lib/reports'
import { Badge, Route } from './ui'
import { PhoneLink } from './PhoneLink'
import { DateInput } from './DateInput'
import { ReportCharts, ReportView } from './ReportCharts'
import { telephoneHref } from '../lib/phone'

export type ReportDriver = { id: string; name: string; plate: string }
export type ReportProps = {
  data: ReportData
  loading: boolean
  error: string
  period: Period
  currentDay: string
  onPeriod: (start: string, end: string | null) => void
  onRefresh: () => void
  onDriver: (driver: ReportDriver) => void
  onJob: (job: Job) => void
  onEntry: (entry: Entry) => void
}
export function PeriodPicker({
  period,
  currentDay,
  onPeriod,
}: Pick<ReportProps, 'period' | 'currentDay' | 'onPeriod'>) {
  const [start, setStart] = useState(period.start),
    [end, setEnd] = useState(period.end),
    [error, setError] = useState('')
  useEffect(() => {
    setStart(period.start)
    setEnd(period.end)
  }, [period.start, period.end])
  function apply(a: string, b: string) {
    try {
      validatePeriod({ start: a, end: b })
      setError('')
      onPeriod(a, b === currentDay ? null : b)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <div className="period-picker">
      <form
        className="period-fields"
        onSubmit={(e) => {
          e.preventDefault()
          apply(start, end)
        }}
      >
        <label>
          วันที่เริ่มต้น
          <DateInput
            aria-label="วันที่เริ่มต้นรายงาน"
            type="date"
            value={start}
            required
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          ถึงวันที่
          <DateInput
            aria-label="วันที่สิ้นสุดรายงาน"
            type="date"
            value={end}
            required
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <button className="btn primary" type="submit">
          ดูรายงาน <ArrowRight size={16} />
        </button>
      </form>
      <div className="period-shortcuts">
        <span>เลือกเร็ว</span>
        <button onClick={() => apply(currentDay, currentDay)}>วันนี้</button>
        <button onClick={() => apply(shiftDate(currentDay, -6), currentDay)}>7 วันล่าสุด</button>
        <button onClick={() => apply(currentDay.slice(0, 7) + '-01', currentDay)}>เดือนนี้</button>
        {end !== currentDay && (
          <button onClick={() => apply(start, currentDay)}>สิ้นสุดวันนี้</button>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function ReportState({
  loading,
  error,
  onRefresh,
}: Pick<ReportProps, 'loading' | 'error' | 'onRefresh'>) {
  if (loading)
    return (
      <div className="report-state" role="status">
        <RefreshCw className="spin" size={18} /> กำลังรวมข้อมูลตามช่วงวันที่…
      </div>
    )
  if (error)
    return (
      <div className="report-state error" role="alert">
        <span>{error}</span>
        <button className="text-btn" onClick={onRefresh}>
          โหลดรายงานอีกครั้ง
        </button>
      </div>
    )
  return null
}
function NoRows({ children = 'ไม่มีรายการในช่วงวันที่นี้' }: { children?: string }) {
  return <p className="report-empty">{children}</p>
}
export function JobRows({ jobs, onJob }: { jobs: Job[]; onJob: ReportProps['onJob'] }) {
  return jobs.length ? (
    <div className="report-list">
      {[...jobs]
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
        .map((j) => (
          <button className="report-job-row" key={j.id} onClick={() => onJob(j)}>
            <span className="report-row-date">{dateLabel(j.date)}</span>
            <span className="report-row-main">
              <strong>
                {j.driverName} <span>{j.plate}</span>
              </strong>
              <Route provinces={j.provinces} />
            </span>
            <Badge state={j.status}>{jobStates[j.status]}</Badge>
            <ChevronRight size={16} />
          </button>
        ))}
    </div>
  ) : (
    <NoRows>ไม่มีงานวิ่งในช่วงวันที่นี้</NoRows>
  )
}
export function EntryRows({
  entries,
  onEntry,
}: {
  entries: Entry[]
  onEntry: ReportProps['onEntry']
}) {
  return entries.length ? (
    <div className="report-list">
      {[...entries]
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
        .map((e) => (
          <button
            className={`report-entry-row ${e.status === 'void' ? 'is-void' : ''}`}
            key={e.id}
            onClick={() => onEntry(e)}
          >
            <span className="report-row-main">
              <strong>{e.description}</strong>
              <small>
                {e.driverName} · {kinds[e.kind]} · {dateLabel(e.date)}
              </small>
              <small>
                ให้ {e.recipient}
                {e.evidenceCount ? ` · หลักฐาน ${e.evidenceCount} รูป` : ''}
              </small>
            </span>
            <span className="report-row-money">
              <strong className={e.kind === 'deduction' ? 'deduction' : ''}>
                {e.kind === 'deduction' ? '−' : ''}฿{money(e.amount)}
              </strong>
              <Badge state={e.status}>{entryStates[e.status]}</Badge>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
    </div>
  ) : (
    <NoRows>ไม่มีรายการการเงินในช่วงวันที่นี้</NoRows>
  )
}
export function CancellationRows({
  items,
  entries,
  onEntry,
}: {
  items: Cancellation[]
  entries: Entry[]
  onEntry: ReportProps['onEntry']
}) {
  return items.length ? (
    <div className="cancellation-list">
      {[...items]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((c) => (
          <details key={c.id} className="cancellation-row">
            <summary>
              <span>
                <strong>
                  {c.driverName} <span>ยกเลิกคิว</span>
                </strong>
                <small>
                  {c.replacementDriverName
                    ? `${c.replacementDriverName} ขึ้นงานแทน`
                    : 'ไม่มีคนขึ้นงานแทน'}{' '}
                  · {dateLabel(c.date)}
                </small>
              </span>
              <ChevronRight size={18} />
            </summary>
            <div className="cancellation-body">
              <p>
                <b>เหตุผล</b> {c.reason}
              </p>
              <p>
                รถที่ยกเลิก {c.plate}
                {c.replacementPlate && ` · รถขึ้นแทน ${c.replacementPlate}`}
              </p>
              {c.replacementJobDate && (
                <p>
                  ขึ้นงานแทน {dateLabel(c.replacementJobDate, true)} ·{' '}
                  {c.replacementProvinces.join(' → ')}
                </p>
              )}
              <div className="cancellation-amounts">
                {[
                  {
                    label: `หักจาก ${c.driverName}`,
                    amount: c.deductionAmount,
                    id: c.deductionEntryId,
                  },
                  ...(c.replacementDriverId
                    ? [
                        {
                          label: `ให้ ${c.replacementDriverName}`,
                          amount: c.compensationAmount,
                          id: c.compensationEntryId,
                        },
                      ]
                    : []),
                ].map((row) => {
                  const entry = entries.find((e) => e.id === row.id)
                  return (
                    <div key={row.label}>
                      <span>{row.label}</span>
                      <strong>฿{money(row.amount)}</strong>
                      {entry ? (
                        <button className="text-btn" onClick={() => onEntry(entry)}>
                          {entryStates[entry.status]} <ChevronRight size={14} />
                        </button>
                      ) : (
                        <small>{row.amount ? 'ยอดที่บันทึกตอนยกเลิก' : 'ไม่มีรายการเงิน'}</small>
                      )}
                    </div>
                  )
                })}
              </div>
              <small className="field-help">
                ยอดตามข้อตกลงตอนยกเลิกคิว · สถานะการจ่ายหรือหักดูจากรายการการเงิน
              </small>
            </div>
          </details>
        ))}
    </div>
  ) : (
    <NoRows>ไม่มีการยกเลิกคิวในช่วงวันที่นี้</NoRows>
  )
}

function FinancialBreakdown({ data }: { data: ReportData }) {
  const t = totals(data)
  return (
    <div className="financial-breakdown">
      <dl>
        {Object.entries(kinds).map(([kind, label]) => (
          <div key={kind}>
            <dt>{label}</dt>
            <dd>฿{money(t.byKind[kind as Entry['kind']])}</dd>
          </div>
        ))}
      </dl>
      <div className="settlement-line">
        <span>
          จ่ายแล้ว <b>฿{money(t.paidOut)}</b>
        </span>
        <span>
          หักแล้ว <b>฿{money(t.paidDeduction)}</b>
        </span>
        <span>
          จ่ายสุทธิแล้ว <b>฿{money(t.netPaid)}</b>
        </span>
      </div>
      <p>
        รอจ่าย ฿{money(t.pendingOut)} · รอหัก ฿{money(t.pendingDeduction)} · ไม่นับรายการที่ยกเลิก
      </p>
    </div>
  )
}

export function ReportPanel(props: ReportProps) {
  const { data, period, onDriver, onJob, onEntry } = props
  const [tab, setTab] = useState('drivers'),
    [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'chart'>('list')
  const t = useMemo(() => totals(data), [data]),
    people = useMemo(() => reportDrivers(data), [data])
  const filteredPeople = people.filter((d) => `${d.name} ${d.plate}`.includes(search))
  const tabs = [
    ['drivers', 'คนรถ', people.length],
    ['jobs', 'เที่ยววิ่ง', data.jobs.length],
    ['money', 'การเงิน', data.entries.length],
    ['cancellations', 'ยกเลิกคิว', data.cancellations.length],
  ]
  function download() {
    const header = [
      'คนรถ',
      'ทะเบียน',
      'เที่ยววิ่ง',
      'จบงาน',
      'จังหวัด',
      'ยอดจ่ายที่บันทึก (บาท)',
      'ยอดหักที่บันทึก (บาท)',
      'จ่ายสุทธิแล้ว (บาท)',
    ]
    exportCsv(`สรุปคนรถ-${period.start}-${period.end}.csv`, [
      header,
      ...people.map((d) => [
        d.name,
        d.plate,
        d.totals.trips,
        d.totals.completed,
        d.totals.provinces.join(' / '),
        d.totals.outgoing / 100,
        d.totals.deductions / 100,
        d.totals.netPaid / 100,
      ]),
    ])
  }
  return (
    <section className="reports-section">
      <div className="report-section-heading">
        <div>
          <span className="section-index">03 / รายงาน</span>
          <h2>ภาพรวมการเดินรถ</h2>
        </div>
        <button
          className="icon-btn refresh-report"
          aria-label="รีเฟรชรายงาน"
          disabled={props.loading}
          onClick={props.onRefresh}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      <PeriodPicker {...props} />
      <p className="report-period-caption">
        ข้อมูล {dateLabel(period.start, true)} – {dateLabel(period.end, true)}
      </p>
      <ReportState {...props} />
      {!props.loading && !props.error && (
        <>
          <div className="report-metrics">
            <div>
              <span>งานวิ่ง</span>
              <strong>
                {t.trips}
                <small>เที่ยว</small>
              </strong>
              <p>
                จบแล้ว {t.completed} · วิ่งอยู่ {t.running} · รอ {t.scheduled}
              </p>
            </div>
            <div>
              <span>เบิกและค่าใช้จ่าย</span>
              <strong>
                <small>฿</small>
                {money(t.outgoing)}
              </strong>
              <p>รวมค่าซ่อมและค่าขึ้นแทน</p>
            </div>
            <div>
              <span>ยอดหักเงิน</span>
              <strong className="deduction">
                <small>฿</small>
                {money(t.deductions)}
              </strong>
              <p>ดำเนินการแล้ว ฿{money(t.paidDeduction)}</p>
            </div>
            <div>
              <span>จ่ายสุทธิแล้ว</span>
              <strong>
                <small>฿</small>
                {money(t.netPaid)}
              </strong>
              <p>จ่ายแล้ว − หักแล้ว</p>
            </div>
          </div>
          <div className="report-pending-note">
            ยอดบันทึกรวมรายการรอดำเนินการ · รอจ่าย ฿{money(t.pendingOut)} · รอหัก ฿
            {money(t.pendingDeduction)}
          </div>
          <ReportView value={view} onChange={setView} />
          {view === 'chart' ? (
            <ReportCharts data={data} onDriver={onDriver} />
          ) : (
            <>
              <div className="report-tabs" role="tablist" aria-label="หมวดรายงาน">
                {tabs.map(([id, label, count]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(String(id))}
                  >
                    {label}
                    <span>{count}</span>
                  </button>
                ))}
              </div>
              {tab === 'drivers' && (
                <div className="report-table">
                  <div className="report-table-toolbar">
                    <label className="report-search">
                      <Search size={16} />
                      <input
                        placeholder="ค้นหาคนรถ / ทะเบียน"
                        aria-label="ค้นหาคนรถในรายงาน"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <button className="text-btn" onClick={download}>
                      <ArrowDownToLine size={16} /> CSV
                    </button>
                  </div>
                  {filteredPeople.length ? (
                    filteredPeople.map((d) => (
                      <button className="driver-report-row" key={d.id} onClick={() => onDriver(d)}>
                        <span className="driver-report-identity">
                          <strong>{d.name}</strong>
                          <small>{d.plate}</small>
                        </span>
                        <span className="driver-report-trips">
                          <strong>{d.totals.trips}</strong>
                          <small>เที่ยว</small>
                        </span>
                        <span className="driver-report-amount">
                          <strong>฿{money(d.totals.outgoing)}</strong>
                          <small>{d.totals.entryCount} รายการเงิน</small>
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    ))
                  ) : (
                    <NoRows>ไม่มีข้อมูลคนรถที่ตรงกับช่วงวันที่หรือคำค้น</NoRows>
                  )}
                  <p className="table-footnote">
                    แตะคนรถเพื่อดูเที่ยววิ่ง เส้นทาง และรายละเอียดการเงิน
                  </p>
                </div>
              )}
              {tab === 'jobs' && <JobRows jobs={data.jobs} onJob={onJob} />}
              {tab === 'money' && (
                <>
                  <FinancialBreakdown data={data} />
                  <EntryRows entries={data.entries} onEntry={onEntry} />
                </>
              )}
              {tab === 'cancellations' && (
                <CancellationRows
                  items={data.cancellations}
                  entries={data.entries}
                  onEntry={onEntry}
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

export function DriverReport({
  driver,
  contact,
  queued,
  ...props
}: ReportProps & {
  driver: ReportDriver
  contact?: Driver
  queued?: QueueItem
}) {
  const data = forDriver(props.data, driver.id),
    t = totals(data)
  const [tab, setTab] = useState('jobs')
  const [view, setView] = useState<'list' | 'chart'>('list')
  function download() {
    exportCsv(`รายงาน-${driver.plate}-${props.period.start}-${props.period.end}.csv`, [
      ['คนรถ', driver.name, 'ทะเบียน', driver.plate],
      ['ตั้งแต่', props.period.start, 'ถึง', props.period.end],
      ['เที่ยววิ่ง (ไม่รวมยกเลิก)', t.trips, 'จบงาน', t.completed],
      ['วันที่', 'ประเภท', 'รายละเอียด', 'สถานะ', 'จำนวนเงิน (บาท)', 'ผู้รับเงิน'],
      ...data.jobs.map((j) => [
        j.date,
        'งานวิ่ง',
        j.provinces.join(' → '),
        jobStates[j.status],
        '',
        '',
      ]),
      ...data.entries.map((e) => [
        e.date,
        kinds[e.kind],
        e.description,
        entryStates[e.status],
        e.amount / 100,
        e.recipient,
      ]),
    ])
  }
  return (
    <div className="driver-report-detail">
      <div className="driver-dossier-heading">
        <div>
          <span className="dossier-plate">{driver.plate}</span>
          <h3>{driver.name}</h3>
          {contact?.truckType && <p className="dossier-truck-type">{contact.truckType}</p>}
        </div>
        <button
          className="btn secondary small"
          onClick={download}
          disabled={props.loading || !!props.error}
        >
          <ArrowDownToLine size={16} /> CSV
        </button>
      </div>
      <div className="driver-contact-bar">
        {telephoneHref(contact?.phone) ? (
          <PhoneLink phone={contact?.phone} name={driver.name} />
        ) : (
          <span className="contact-unavailable">ยังไม่ได้ระบุเบอร์โทร</span>
        )}
        {queued && <Badge state={queueStatus(queued)}>{queueStates[queueStatus(queued)]}</Badge>}
      </div>
      <PeriodPicker {...props} />
      <ReportState {...props} />
      {!props.loading && !props.error && (
        <>
          <div className="driver-trip-summary">
            <strong>
              {t.trips}
              <small>เที่ยววิ่ง</small>
            </strong>
            <span>
              จบแล้ว {t.completed}
              <br />
              {t.provinces.length} จังหวัด
            </span>
          </div>
          {t.provinces.length > 0 && (
            <p className="driver-destinations">{t.provinces.join(' · ')}</p>
          )}
          <ReportView value={view} onChange={setView} />
          {view === 'chart' ? (
            <ReportCharts data={data} individual />
          ) : (
            <>
              <FinancialBreakdown data={data} />
              <div className="report-tabs" role="tablist" aria-label="รายละเอียดคนรถ">
                <button role="tab" aria-selected={tab === 'jobs'} onClick={() => setTab('jobs')}>
                  เที่ยววิ่ง <span>{data.jobs.length}</span>
                </button>
                <button role="tab" aria-selected={tab === 'money'} onClick={() => setTab('money')}>
                  การเงิน <span>{data.entries.length}</span>
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'cancellations'}
                  onClick={() => setTab('cancellations')}
                >
                  ยกเลิก / ขึ้นแทน <span>{data.cancellations.length}</span>
                </button>
              </div>
              {tab === 'jobs' && <JobRows jobs={data.jobs} onJob={props.onJob} />}
              {tab === 'money' && <EntryRows entries={data.entries} onEntry={props.onEntry} />}
              {tab === 'cancellations' && (
                <CancellationRows
                  items={data.cancellations}
                  entries={props.data.entries}
                  onEntry={props.onEntry}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
