import { ArrowRight, ChevronRight, MapPin } from 'lucide-react'
import { dateLabel, jobStates } from '../lib/model'
import type { Job } from '../lib/model'
import { Badge, Route } from './ui'

export function TodayActivity({
  jobs,
  day,
  error,
  onJob,
  onAll,
}: {
  jobs: Job[]
  day: string
  error: string
  onJob: (job: Job) => void
  onAll: () => void
}) {
  const current = jobs
    .filter((job) => job.date === day && job.status !== 'cancelled')
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
  const cars = new Set(current.map((job) => job.driverId)).size
  return (
    <section className="today-activity" aria-label="ความเคลื่อนไหววันนี้">
      <div className="today-activity-heading">
        <div>
          <span className="section-index">02 / วันนี้</span>
          <h2>ความเคลื่อนไหววันนี้</h2>
          <p>{dateLabel(day, true)}</p>
        </div>
        {!error && current.length > 0 && (
          <span className="today-activity-count">
            {cars} คัน · {current.length} เที่ยว
          </span>
        )}
      </div>
      {error ? (
        <p className="today-activity-empty" role="alert">
          โหลดความเคลื่อนไหววันนี้ไม่สำเร็จ กรุณาลองเชื่อมต่อใหม่
        </p>
      ) : current.length ? (
        <>
          <div className="today-activity-list">
            {current.slice(0, 4).map((job) => (
              <button
                className="today-job"
                key={job.id}
                onClick={() => onJob(job)}
                aria-label={`ดูงานวันนี้ ${job.driverName} ${job.plate} ไป ${job.provinces.join(' แล้วไป ')} ${jobStates[job.status]}`}
              >
                <span className="today-job-content">
                  <span className="today-job-heading">
                    <span>
                      <strong>{job.driverName}</strong>
                      <small>{job.plate}</small>
                    </span>
                    <Badge state={job.status}>{jobStates[job.status]}</Badge>
                  </span>
                  <span className="today-job-route">
                    <MapPin size={15} />
                    <Route provinces={job.provinces} />
                  </span>
                </span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
          <div className="today-activity-footer">
            <span>
              {current.length > 4 ? `แสดง 4 จาก ${current.length} เที่ยว` : 'เรียงจากงานล่าสุด'}
            </span>
            <button className="text-btn" onClick={onAll}>
              ดูงานวันนี้ทั้งหมด <ArrowRight size={15} />
            </button>
          </div>
        </>
      ) : (
        <p className="today-activity-empty">ยังไม่มีข้อมูล รถดำเนินการวันนี้</p>
      )}
    </section>
  )
}
