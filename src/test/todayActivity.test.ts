import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TodayActivity } from '../components/TodayActivity'
import type { Job } from '../lib/model'

const day = '2026-10-21'
const job: Job = {
  id: 'today',
  driverId: 'd1',
  driverName: 'คนรถวันนี้',
  plate: '70-0001',
  truckType: 'รถพ่วง',
  date: day,
  provinces: ['ชลบุรี', 'ระยอง'],
  status: 'running',
  note: '',
  createdAt: 1,
  updatedAt: 1,
}
function render(jobs: Job[], error = '') {
  return renderToStaticMarkup(
    createElement(TodayActivity, {
      jobs,
      day,
      error,
      onJob: () => {},
      onAll: () => {},
    }),
  ).replaceAll('<!-- -->', '')
}

describe('today activity on the dashboard', () => {
  it('shows today with all destination stops, excluding previous, future and cancelled jobs', () => {
    const html = render([
      job,
      { ...job, id: 'old', date: '2026-10-20', driverName: 'คนรถเมื่อวาน' },
      { ...job, id: 'future', date: '2026-10-22', driverName: 'คนรถพรุ่งนี้' },
      { ...job, id: 'cancelled', status: 'cancelled', driverName: 'งานยกเลิก' },
    ])
    expect(html).toContain('คนรถวันนี้')
    expect(html).toContain('70-0001')
    expect(html).toContain('ชลบุรี')
    expect(html).toContain('ระยอง')
    expect(html).toContain('กำลังวิ่ง')
    for (const name of ['คนรถเมื่อวาน', 'คนรถพรุ่งนี้', 'งานยกเลิก'])
      expect(html).not.toContain(name)
  })
  it('counts multiple trips by the same driver separately, retaining completed and scheduled work', () => {
    const html = render([
      job,
      { ...job, id: 'done', status: 'completed', createdAt: 2 },
      { ...job, id: 'scheduled', driverId: 'd2', status: 'scheduled' },
    ])
    expect(html).toContain('2 คัน · 3 เที่ยว')
    expect(html).toContain('จบงานแล้ว')
    expect(html).toContain('รอออกงาน')
  })
  it('uses the requested empty message only when no valid job belongs to today', () => {
    for (const jobs of [
      [],
      [{ ...job, date: '2026-10-20' }],
      [{ ...job, status: 'cancelled' as const }],
    ]) {
      expect(render(jobs)).toContain('ยังไม่มีข้อมูล รถดำเนินการวันนี้')
      expect(render(jobs)).not.toContain('ดูงานวันนี้ทั้งหมด')
    }
    expect(render([], 'offline')).not.toContain('ยังไม่มีข้อมูล รถดำเนินการวันนี้')
    expect(render([], 'offline')).toContain('โหลดความเคลื่อนไหววันนี้ไม่สำเร็จ')
  })
  it('keeps the dashboard compact and discloses remaining trips', () => {
    const html = render(
      Array.from({ length: 6 }, (_, index) => ({ ...job, id: String(index), createdAt: index })),
    )
    expect(html.match(/class="today-job"/g)).toHaveLength(4)
    expect(html).toContain('แสดง 4 จาก 6 เที่ยว')
    expect(html).toContain('ดูงานวันนี้ทั้งหมด')
  })
})
