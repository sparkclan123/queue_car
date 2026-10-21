import { useMemo, useState } from 'react'
import { BarChart3, ChevronRight, List } from 'lucide-react'
import { dateLabel, money } from '../lib/model'
import { reportDays, reportDrivers, totals } from '../lib/reports'
import type { ReportData } from '../lib/reports'
import type { ReportDriver } from './Reports'

type Metric = 'advance' | 'count' | 'trips' | 'outgoing'
const metrics: Record<Metric, string> = {
  advance: 'ยอดเบิกเงิน',
  count: 'จำนวนครั้งที่เบิก',
  trips: 'เที่ยววิ่ง',
  outgoing: 'เบิกและค่าใช้จ่ายรวม',
}
type Totals = ReturnType<typeof totals>
const valueOf = (t: Totals, metric: Metric) =>
  metric === 'advance'
    ? t.byKind.advance
    : metric === 'count'
      ? t.advanceCount
      : metric === 'trips'
        ? t.trips
        : t.outgoing
const formatted = (n: number, metric: Metric) =>
  metric === 'advance' || metric === 'outgoing'
    ? `฿${money(n)}`
    : `${n} ${metric === 'count' ? 'ครั้ง' : 'เที่ยว'}`

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
  individual = false,
}: {
  data: ReportData
  onDriver?: (driver: ReportDriver) => void
  individual?: boolean
}) {
  const [metric, setMetric] = useState<Metric>('advance')
  const [search, setSearch] = useState('')
  const people = useMemo(() => reportDrivers(data), [data])
  const days = useMemo(() => reportDays(data), [data])
  const t = totals(data)
  const rows = individual
    ? days.map((d) => ({
        id: d.date,
        label: dateLabel(d.date, true),
        totals: d.totals,
        driver: undefined,
      }))
    : people
        .filter((p) => `${p.name} ${p.plate}`.includes(search.trim()))
        .sort(
          (a, b) =>
            valueOf(b.totals, metric) - valueOf(a.totals, metric) ||
            a.name.localeCompare(b.name, 'th'),
        )
        .map((p) => ({ id: p.id, label: p.name, totals: p.totals, driver: p }))
  const maximum = Math.max(0, ...rows.map((r) => valueOf(r.totals, metric)))
  return (
    <section
      className="report-chart"
      aria-label={individual ? 'กราฟรายวันของคนรถ' : 'กราฟเปรียบเทียบคนรถ'}
    >
      <div className="chart-heading">
        <div>
          <h3>{individual ? 'การเบิกและงานวิ่งรายวัน' : 'เปรียบเทียบคนรถ'}</h3>
          <p>ตามช่วงวันที่ที่เลือก</p>
        </div>
        <label>
          <span>แสดงกราฟ</span>
          <select
            aria-label="ตัวชี้วัดกราฟ"
            value={metric}
            onChange={(e) => setMetric(e.target.value as Metric)}
          >
            {Object.entries(metrics).map(([key, label]) => (
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
          เบิก <strong>{t.advanceCount} ครั้ง</strong>
        </span>
        <span>
          งานวิ่ง <strong>{t.trips} เที่ยว</strong>
        </span>
      </div>
      <p className="chart-note">
        ยอดเงินรวมรอจ่ายและจ่ายแล้ว · เที่ยววิ่งรวมรอออกงาน · ไม่นับรายการยกเลิก
      </p>
      {!individual && (
        <input
          className="chart-search"
          aria-label="ค้นหาคนรถในกราฟ"
          placeholder="ค้นหาคนรถ / ทะเบียน"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div className="chart-scale">
        <span>{metrics[metric]}</span>
        <span>สูงสุด {formatted(maximum, metric)}</span>
      </div>
      <div className="chart-rows">
        {rows.map((row) => {
          const amount = valueOf(row.totals, metric)
          const contents = (
            <>
              <span className="chart-row-heading">
                <span>
                  <strong>{row.label}</strong>
                  {row.driver && <small>{row.driver.plate}</small>}
                </span>
                <b>
                  {formatted(amount, metric)}
                  {row.driver && <ChevronRight size={15} />}
                </b>
              </span>
              <span className="chart-track" aria-hidden="true">
                <span style={{ width: `${maximum ? (amount / maximum) * 100 : 0}%` }} />
              </span>
              <span className="chart-row-detail">
                เบิก ฿{money(row.totals.byKind.advance)} · {row.totals.advanceCount} ครั้ง ·{' '}
                {row.totals.trips} เที่ยว
              </span>
            </>
          )
          return row.driver && onDriver ? (
            <button
              className={`chart-row chart-${metric}`}
              key={row.id}
              onClick={() => onDriver(row.driver!)}
              aria-label={`ดูรายงาน ${row.label} เบิกเงิน ${money(row.totals.byKind.advance)} บาท ${row.totals.advanceCount} ครั้ง วิ่ง ${row.totals.trips} เที่ยว`}
            >
              {contents}
            </button>
          ) : (
            <div className={`chart-row chart-${metric}`} key={row.id}>
              {contents}
            </div>
          )
        })}
        {!rows.length && <p className="report-empty">ไม่มีข้อมูลในช่วงวันที่หรือคำค้นนี้</p>}
      </div>
      <p className="table-footnote">
        {individual
          ? 'แสดงเฉพาะวันที่มีรายการที่ไม่ถูกยกเลิก'
          : 'แตะแถบของคนรถเพื่อดูรายละเอียดเที่ยววิ่งและการเงิน'}{' '}
        · เบิกเงินนับเฉพาะประเภทเบิกเงิน
      </p>
    </section>
  )
}
