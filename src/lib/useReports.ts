import { useEffect, useMemo, useState } from 'react'
import { db, errorMessage, isDemo } from './firebase'
import { today } from './model'
import type { Cancellation, Data, Entry, Job } from './model'
import { emptyReport, filterReport, readReportRange } from './reports'
import type { Period, ReportData } from './reports'

export function useCurrentDay() {
  const [day, setDay] = useState(today)
  useEffect(() => {
    const update = () => setDay(today())
    const interval = window.setInterval(update, 30000)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  return day
}

export function useReports(period: Period, demoData: Data, enabled: boolean, revision: number) {
  const key = `${period.start}/${period.end}`
  const [result, setResult] = useState<{ key: string; data: ReportData; loadedAt: number }>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (isDemo || !db || !enabled) return
    let disposed = false
    setLoading(true)
    setError('')
    const cancelled = () => disposed
    void Promise.all([
      readReportRange<Job>(db, 'jobs', period, cancelled),
      readReportRange<Entry>(db, 'entries', period, cancelled),
      readReportRange<Cancellation>(db, 'cancellations', period, cancelled),
    ])
      .then(([jobs, entries, cancellations]) => {
        if (!disposed)
          setResult({ key, data: { jobs, entries, cancellations }, loadedAt: Date.now() })
      })
      .catch((e) => {
        if (!disposed) {
          setResult(undefined)
          setError(errorMessage(e))
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    return () => {
      disposed = true
    }
  }, [key, enabled, revision])
  const demoReport = useMemo(
    () =>
      isDemo
        ? filterReport(
            {
              jobs: demoData.jobs,
              entries: demoData.entries,
              cancellations: demoData.cancellations,
            },
            period,
          )
        : emptyReport,
    [demoData, key],
  )
  return {
    data: isDemo ? demoReport : result?.key === key ? result.data : emptyReport,
    loading: !isDemo && (loading || (!!db && enabled && result?.key !== key && !error)),
    error: isDemo ? '' : error,
    loadedAt: result?.key === key ? result.loadedAt : 0,
  }
}
