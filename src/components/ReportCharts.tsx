import { useMemo, useState } from 'react'
import { BarChart3, ChevronRight, List } from 'lucide-react'
import { dateLabel, jobStates, money } from '../lib/model'
import { reportDays, reportDestinations, reportDrivers, totals } from '../lib/reports'
import type { ReportData } from '../lib/reports'
import type { ReportProps } from './Reports'
import { Badge, Route } from './ui'

type Totals = ReturnType<typeof totals>
const baht = (amount: number) => `฿${money(amount)}`
const trips = (count: number) => `${count} เที่ยว`
const metrics = {
  advance: { label: 'ยอดเบิกเงิน', value: (t: Totals) => t.byKind.advance, format: baht },
  count: {
    label: 'จำนวนครั้งที่เบิก',
    value: (t: Totals) => t.advanceCount,
    format: (n: number) => `${n} ครั้ง`,
  },
  trips: { label: 'เที่ยววิ่ง', value: (t: Totals) => t.trips, format: trips },
  paidDeduction: { label: 'ยอดหักแล้ว', value: (t: Totals) => t.paidDeduction, format: baht },
  deduction: { label: 'ยอดหักรวมรอดำเนินการ', value: (t: Totals) => t.deductions, format: baht },
  expense: { label: 'ค่าใช้จ่าย', value: (t: Totals) => t.byKind.expense, format: baht },
  repair: { label: 'ค่าซ่อมรถ', value: (t: Totals) => t.byKind.repair, format: baht },
  replacement: { label: 'ค่าขึ้นงานแทน', value: (t: Totals) => t.byKind.replacement, format: baht },
  outgoing: { label: 'เบิกและค่าใช้จ่ายรวม', value: (t: Totals) => t.outgoing, format: baht },
  destinations: { label: 'จังหวัดปลายทาง' },
}
type Metric = keyof typeof metrics

function ChartBar({ value, maximum }: { value: number; maximum: number }) {
  return (
    <span className="chart-track" aria-hidden="true">
      <span style={{ width: `${(value / maximum) * 100}%` }} />
    </span>
  )
}

export function ReportView({
  value,
  onChange,
}: {
  value: 'list' | 'chart'
  onChange: (value: 'list' | 'chart') => void
}) {
  return (
    <div className="report-view" role="group" aria-label="รูปแบบรายงาน">
      <button type="button" aria-pressed={value === 'list'} onClick={() => onChange('list')}>
        <List size={17} />
        รายการ
      </button>
      <button type="button" aria-pressed={value === 'chart'} onClick={() => onChange('chart')}>
        <BarChart3 size={17} />
        กราฟ
      </button>
    </div>
  )
}

export function ReportCharts({
  data,
  onDriver,
  onJob,
  individual = false,
}: {
  data: ReportData
  onDriver?: ReportProps['onDriver']
  onJob: ReportProps['onJob']
  individual?: boolean
}) {
  const [metric, setMetric] = useState<Metric>('advance')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState('')
  const [tripLimit, setTripLimit] = useState(25)
  const people = useMemo(() => reportDrivers(data), [data])
  const days = useMemo(() => reportDays(data), [data])
  const destinations = useMemo(() => reportDestinations(data.jobs), [data.jobs])
  const t = totals(data)
  const measure = metric === 'destinations' ? undefined : metrics[metric]
  const focus = metric === 'count' ? 'advance' : metric
  const rows = (
    individual
      ? days.map((d) => ({
          id: d.date,
          label: dateLabel(d.date, true),
          totals: d.totals,
          driver: undefined,
        }))
      : people
          .filter((p) => `${p.name} ${p.plate}`.includes(search.trim()))
          .map((p) => ({ id: p.id, label: p.name, totals: p.totals, driver: p }))
  )
    .map((row) => ({ ...row, value: measure?.value(row.totals) ?? 0 }))
    .filter((row) => row.value > 0)
  if (!individual) rows.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'th'))
  const maximum = Math.max(0, ...rows.map((row) => row.value))
  return (
    <section
      className="report-chart"
      aria-label={individual ? 'กราฟรายวันของคนรถ' : 'กราฟเปรียบเทียบคนรถ'}
    >
      <div className="chart-heading">
        <div>
          <h3>
            {metric === 'destinations'
              ? 'เที่ยววิ่งตามจังหวัด'
              : individual
                ? 'การเงินและเที่ยววิ่งรายวัน'
                : 'เปรียบเทียบคนรถ'}
          </h3>
        </div>
        <label>
          <span>แสดงกราฟ</span>
          <select
            aria-label="ตัวชี้วัดกราฟ"
            value={metric}
            onChange={(e) => setMetric(e.target.value as Metric)}
          >
            {Object.entries(metrics).map(([key, { label }]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="chart-summary">
        <span>
          เบิกเงิน <strong>฿{money(t.byKind.advance)}</strong>
        </span>
        <span>
          หักแล้ว <strong>{baht(t.paidDeduction)}</strong>
        </span>
        <span>
          งานวิ่ง <strong>{t.trips} เที่ยว</strong>
        </span>
      </div>
      <p className="chart-note">
        {metric === 'paidDeduction'
          ? 'นับเฉพาะยอดที่บันทึกว่าหักแล้ว'
          : metric === 'deduction'
            ? 'รวมยอดหักแล้วและรอหัก'
            : metric === 'trips' || metric === 'destinations'
              ? 'รวมเที่ยวรอออกงาน · ไม่นับงานยกเลิก'
              : 'รวมรายการรอจ่ายและจ่ายแล้ว · ไม่นับรายการยกเลิก'}
      </p>
      {!individual && measure && (
        <input
          className="chart-search"
          aria-label="ค้นหาคนรถในกราฟ"
          placeholder="ค้นหาคนรถ / ทะเบียน"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {measure ? (
        <>
          <div className="chart-scale">
            <span>{measure.label}</span>
            <span>สูงสุด {measure.format(maximum)}</span>
          </div>
          <div className="chart-rows">
            {rows.map((row) => {
              const contents = (
                <>
                  <span className="chart-row-heading">
                    <span>
                      <strong>{row.label}</strong>
                      {row.driver && <small>{row.driver.plate}</small>}
                    </span>
                    <b>
                      {measure.format(row.value)}
                      {row.driver && <ChevronRight size={15} />}
                    </b>
                  </span>
                  <ChartBar value={row.value} maximum={maximum} />
                  <span className="chart-row-detail">
                    เบิก {baht(row.totals.byKind.advance)} · หักแล้ว{' '}
                    {baht(row.totals.paidDeduction)} · {trips(row.totals.trips)}
                  </span>
                </>
              )
              return row.driver && onDriver && focus !== 'destinations' ? (
                <button
                  className={`chart-row chart-${metric}`}
                  key={row.id}
                  onClick={() => onDriver(row.driver!, focus)}
                  aria-label={`ดูรายงาน ${row.label} ${measure.label} ${measure.format(row.value)}`}
                >
                  {contents}
                </button>
              ) : (
                <div className={`chart-row chart-${metric}`} key={row.id}>
                  {contents}
                </div>
              )
            })}
            {!rows.length && <p className="report-empty">ไม่มีรายการตามตัวชี้วัดหรือคำค้นนี้</p>}
          </div>
        </>
      ) : (
        <>
          <div className="chart-scale">
            <span>เที่ยวต่อจังหวัด</span>
            <span>สูงสุด {trips(destinations[0]?.jobs.length ?? 0)}</span>
          </div>
          <div className="chart-rows">
            {destinations.map(({ province, jobs }) => (
              <div className="chart-destination" key={province}>
                <button
                  className="chart-row chart-trips"
                  type="button"
                  aria-expanded={province === expanded}
                  onClick={() => {
                    setExpanded(province === expanded ? '' : province)
                    setTripLimit(25)
                  }}
                >
                  <span className="chart-row-heading">
                    <strong>{province}</strong>
                    <b>
                      {trips(jobs.length)} <ChevronRight size={15} />
                    </b>
                  </span>
                  <ChartBar value={jobs.length} maximum={destinations[0].jobs.length} />
                  <span className="chart-row-detail">
                    {new Set(jobs.map((job) => job.driverId)).size} คนรถ
                  </span>
                </button>
                {province === expanded && (
                  <div className="chart-destination-trips">
                    {jobs.slice(0, tripLimit).map((job) => (
                      <button
                        className="chart-destination-job"
                        key={job.id}
                        onClick={() => onJob(job)}
                      >
                        <span>
                          <strong>
                            {job.driverName} · {job.plate}
                          </strong>
                          <small>{dateLabel(job.date)}</small>
                          <Route provinces={job.provinces} />
                        </span>
                        <Badge state={job.status}>{jobStates[job.status]}</Badge>
                      </button>
                    ))}
                    {jobs.length > tripLimit && (
                      <button
                        className="text-btn chart-more"
                        onClick={() => setTripLimit((n) => n + 25)}
                      >
                        แสดงเที่ยวเพิ่ม ({jobs.length - tripLimit} เที่ยว)
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!destinations.length && <p className="report-empty">ไม่มีเที่ยววิ่งในช่วงวันที่นี้</p>}
          </div>
          <p className="table-footnote">
            แตะจังหวัดเพื่อดูคนรถและเส้นทาง · หนึ่งเที่ยวนับได้ในทุกจังหวัดที่แวะ
          </p>
        </>
      )}
    </section>
  )
}
