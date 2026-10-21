import { useEffect, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ListEnd,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ContactRound,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogIn,
  LogOut,
  MapPin,
  MoreHorizontal,
  Navigation,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStore } from './lib/store'
import { useReports } from './lib/useReports'
import { DriverReport, ReportPanel } from './components/Reports'
import { FinanceSummary } from './components/FinanceSummary'
import { PhoneLink } from './components/PhoneLink'
import { DateInput } from './components/DateInput'
import { MembersPanel } from './components/Members'
import { TodayActivity } from './components/TodayActivity'
import { SalesPanel } from './components/Sales'
import { telephoneHref } from './lib/phone'
import type { ReportDriver, ReportProps } from './components/Reports'
import { errorMessage, login, logout } from './lib/firebase'
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
  today,
} from './lib/model'
import type { Driver, Entry, Evidence, Job, QueueItem } from './lib/model'
import { Avatar, Badge, Empty, Hint, Logo, Modal, Route } from './components/ui'
import {
  CancelQueueForm,
  ConfirmForm,
  DriverForm,
  EntryForm,
  JobForm,
  LoginPanel,
  QueueForm,
} from './components/Forms'
type Page =
  'dashboard' | 'queue' | 'jobs' | 'finance' | 'drivers' | 'sales' | 'activity' | 'members'
type Dialog =
  | { type: 'login' | 'queue' | 'driver' | 'entry' | 'help'; driver?: Driver }
  | { type: 'job' | 'cancel-queue' | 'queue-actions'; item: QueueItem }
  | { type: 'job-detail'; job: Job }
  | { type: 'entry-detail'; entry: Entry }
  | { type: 'driver-report'; driver: ReportDriver }
  | { type: 'confirm'; title: string; text: string; label: string; action: () => Promise<void> }
const navs: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'ภาพรวม', icon: LayoutDashboard },
  { id: 'queue', label: 'คิวรถ', icon: ClipboardList },
  { id: 'jobs', label: 'งานวิ่ง', icon: MapPin },
  { id: 'finance', label: 'การเงิน', icon: Wallet },
  { id: 'drivers', label: 'คนรถ', icon: Users },
  { id: 'sales', label: 'เซลล์', icon: ContactRound },
]
export default function App() {
  const s = useStore(),
    [page, setPage] = useState<Page>('dashboard'),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [toast, setToast] = useState(''),
    [search, setSearch] = useState(''),
    [jobFilter, setJobFilter] = useState('all'),
    [entryFilter, setEntryFilter] = useState('all'),
    [entryDriver, setEntryDriver] = useState(''),
    [entryStatusFilter, setEntryStatusFilter] = useState('all'),
    [loginBusy, setLoginBusy] = useState(false),
    [loginError, setLoginError] = useState(''),
    [reportStart, setReportStart] = useState(() => today().slice(0, 7) + '-01'),
    [reportEnd, setReportEnd] = useState<string | null>(null),
    [reportRevision, setReportRevision] = useState(0)
  const currentDay = s.currentDay
  const reportPeriod = { start: reportStart, end: reportEnd || currentDay }
  const report = useReports(
    reportPeriod,
    s.data,
    page === 'dashboard' || dialog?.type === 'driver-report',
    reportRevision,
  )
  const reportProps: ReportProps = {
    ...report,
    period: reportPeriod,
    currentDay,
    onPeriod: (start, end) => {
      setReportStart(start)
      setReportEnd(end)
    },
    onRefresh: () => setReportRevision((v) => v + 1),
    onDriver: (driver) => setDialog({ type: 'driver-report', driver }),
    onJob: (job) => setDialog({ type: 'job-detail', job }),
    onEntry: (entry) => setDialog({ type: 'entry-detail', entry }),
  }
  const queue = [...s.data.queue].sort((a, b) => a.joinedAt - b.joinedAt),
    jobs = s.data.jobs.filter((j) => j.date === s.day).sort((a, b) => b.createdAt - a.createdAt),
    entries = s.data.entries
      .filter((e) => e.date.startsWith(s.month))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  const visibleJobs = jobs.filter(
      (j) =>
        (jobFilter === 'all' || j.status === jobFilter) &&
        `${j.driverName} ${j.plate} ${j.provinces.join(' ')}`.includes(search),
    ),
    visibleEntries = entries.filter(
      (e) =>
        (entryFilter === 'all' || e.kind === entryFilter) &&
        (!entryDriver || e.driverId === entryDriver) &&
        (entryStatusFilter === 'all' || e.status === entryStatusFilter) &&
        `${e.driverName} ${e.plate} ${e.description} ${e.recipient}`.includes(search),
    )
  useEffect(() => {
    if (
      !s.admin &&
      dialog &&
      dialog.type !== 'login' &&
      dialog.type !== 'job-detail' &&
      dialog.type !== 'entry-detail' &&
      dialog.type !== 'driver-report' &&
      dialog.type !== 'help'
    )
      setDialog(null)
  }, [s.admin, page, dialog])
  useEffect(() => {
    if (page === 'members' && !s.owner) setPage('dashboard')
  }, [page, s.owner])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(t)
  }, [toast])
  function navigate(p: Page, filter = 'all') {
    setPage(p)
    setSearch('')
    setJobFilter(filter)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function done() {
    setDialog(null)
    setReportRevision((v) => v + 1)
    setToast('บันทึกเรียบร้อยแล้ว')
  }
  async function signIn() {
    setLoginBusy(true)
    setLoginError('')
    try {
      await login()
      setDialog(null)
      setToast('เข้าสู่ระบบเรียบร้อย กำลังตรวจสอบสิทธิ์')
    } catch (e) {
      setLoginError(errorMessage(e))
    } finally {
      setLoginBusy(false)
    }
  }
  const newQueue = () => setDialog({ type: 'queue' }),
    newEntry = () => setDialog({ type: 'entry' })
  function moveQueueToEnd(item: QueueItem) {
    setDialog({
      type: 'confirm',
      title: 'ย้ายไปท้ายคิว',
      text: `ย้าย ${item.driverName} ทะเบียน ${item.plate} ไปต่อท้ายคิวปัจจุบัน เวลาลงคิวจะเปลี่ยนเป็นเวลาใหม่`,
      label: 'ยืนยันย้ายไปท้ายคิว',
      action: () => s.moveToEnd(item),
    })
  }
  function updateQueueStatus(item: QueueItem) {
    const status = queueStatus(item) === 'heading' ? 'waiting' : 'heading'
    setDialog({
      type: 'confirm',
      title: status === 'heading' ? 'กำลังไปขึ้นงาน' : 'กลับเป็นรอคิว',
      text: `${item.driverName} · ${item.plate} จะเปลี่ยนเป็น “${queueStates[status]}” โดยยังอยู่ในลำดับคิวเดิม และยังไม่สร้างเที่ยววิ่ง`,
      label: 'ยืนยันสถานะ',
      action: () => s.setQueueStatus(item, status),
    })
  }
  function dateControl() {
    return (
      <div className="date-control">
        <button
          className="icon-btn"
          aria-label="วันก่อนหน้า"
          onClick={() => s.setDay(shiftDate(s.day, -1))}
        >
          <ChevronLeft size={17} />
        </button>
        <DateInput
          className="date-input-inline"
          displayValue={`${s.day === today() ? 'วันนี้ · ' : ''}${dateLabel(s.day)}`}
          aria-label="เลือกวันที่งานวิ่ง"
          type="date"
          value={s.day}
          onChange={(e) => {
            if (e.target.value) s.setDay(e.target.value)
          }}
        />
        <button
          className="icon-btn"
          aria-label="วันถัดไป"
          onClick={() => s.setDay(shiftDate(s.day, 1))}
        >
          <ChevronRight size={17} />
        </button>
        {s.day !== today() && (
          <button className="today-btn" onClick={() => s.setDay(today())}>
            วันนี้
          </button>
        )}
      </div>
    )
  }
  function queueContent(compact = false) {
    const list = compact
      ? queue.slice(0, 4)
      : queue.filter((q) => `${q.driverName} ${q.plate}`.includes(search))
    return list.length ? (
      <div className={`queue-list ${compact ? 'queue-preview' : ''}`}>
        {list.map((q) => {
          const driver = s.data.drivers.find((d) => d.id === q.driverId)
          return (
            <div
              className={`queue-row queue-record ${queue.indexOf(q) === 0 ? 'first' : ''}`}
              key={q.id}
            >
              <button
                className="queue-open"
                aria-label={`ดูรายละเอียด ${q.driverName} ${q.plate}`}
                onClick={() =>
                  reportProps.onDriver({ id: q.driverId, name: q.driverName, plate: q.plate })
                }
              >
                <span className="queue-number">
                  {String(queue.indexOf(q) + 1).padStart(2, '0')}
                </span>
                <span className="queue-identity">
                  <strong>
                    {q.driverName} <ChevronRight size={14} />
                  </strong>
                  <span className="queue-meta">
                    <span className="queue-plate">{q.plate}</span>
                    <Badge state={queueStatus(q)}>{queueStates[queueStatus(q)]}</Badge>
                  </span>
                  {!compact && (
                    <small className="queue-joined">
                      ลงคิว{' '}
                      {new Intl.DateTimeFormat('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Asia/Bangkok',
                      }).format(q.joinedAt)}
                    </small>
                  )}
                </span>
              </button>
              <div className="queue-record-actions">
                <PhoneLink phone={driver?.phone} name={q.driverName} compact />
                {s.admin && (
                  <button
                    className="icon-btn queue-more"
                    aria-label={`จัดการคิว ${q.driverName}`}
                    aria-haspopup="dialog"
                    onClick={() => setDialog({ type: 'queue-actions', item: q })}
                  >
                    <MoreHorizontal size={21} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    ) : (
      <Empty
        title={search && !compact ? 'ไม่พบคิวที่ค้นหา' : 'ตอนนี้ยังไม่มีรถรอคิว'}
        detail={
          s.admin
            ? 'เพิ่มคนรถแล้วกดลงคิว เพื่อเริ่มจัดงานเที่ยวแรก'
            : 'คิวรถจะแสดงที่นี่เมื่อผู้ดูแลลงคิว'
        }
        action={
          s.admin && (
            <button className="btn primary small" onClick={newQueue}>
              <Plus size={16} />
              ลงคิวรถ
            </button>
          )
        }
      />
    )
  }
  function jobCard(j: Job, i: number) {
    return (
      <button
        className="job-card"
        key={j.id}
        onClick={() => setDialog({ type: 'job-detail', job: j })}
      >
        <div className="job-card-top">
          <span className={`job-truck tone-${i % 4}`}>
            <Truck size={21} />
          </span>
          <span className="job-person">
            <strong>{j.plate}</strong>
            <small>{j.driverName}</small>
          </span>
          <Badge state={j.status}>{jobStates[j.status]}</Badge>
        </div>
        <div className="job-route">
          <MapPin size={16} />
          <Route provinces={j.provinces} />
        </div>
        <div className="job-card-bottom">
          <span>
            {j.provinces.length > 1 ? (
              <>
                <span className="connection-dot" /> พ่วง {j.provinces.length} จังหวัด
              </>
            ) : (
              j.truckType
            )}
          </span>
          <span>
            รายละเอียด <ChevronRight size={14} />
          </span>
        </div>
      </button>
    )
  }
  const headerTitles: Record<Page, [string, string]> = {
    members: ['จัดการสมาชิก', 'แต่งตั้งหรือถอดสิทธิ์ผู้ดูแลระบบ'],
    dashboard: ['ภาพรวม', 'คิวรถปัจจุบัน และงานวิ่งตามวันที่เลือก'],
    queue: ['คิวรถปัจจุบัน', 'เรียงตามลำดับลงคิว พร้อมสำหรับงานถัดไป'],
    jobs: ['งานวิ่งประจำวัน', 'ติดตามรถและจังหวัดปลายทางในแต่ละเที่ยว'],
    finance: ['การเงินคนรถ', 'เบิกเงิน ค่าใช้จ่าย ค่าซ่อม และรายการหักเงิน'],
    drivers: ['ทะเบียนคนรถ', 'ชื่อคนรถ ทะเบียน เบอร์โทร และสถานะรับงาน'],
    sales: ['เซลล์', 'ชื่อ เบอร์โทร และรายละเอียดที่ดูแล'],
    activity: ['ประวัติกิจกรรม', 'การเปลี่ยนแปลงล่าสุดโดยผู้ดูแลระบบ'],
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand-link"
          href="/"
          onClick={(e) => {
            e.preventDefault()
            navigate('dashboard')
          }}
        >
          <Logo />
        </a>
        <div className="workspace-label">พื้นที่ทำงาน</div>
        <nav aria-label="เมนูหลัก">
          {navs.map((n) => (
            <button
              key={n.id}
              onClick={() => navigate(n.id)}
              className={`nav-item ${page === n.id ? 'active' : ''}`}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {n.id === 'queue' && <em>{queue.length}</em>}
              {n.id === 'finance' && entries.some((e) => e.status === 'pending') && <i />}
            </button>
          ))}
          {s.owner && (
            <button
              className={`nav-item ${page === 'members' ? 'active' : ''}`}
              onClick={() => navigate('members')}
            >
              <ShieldCheck size={20} />
              <span>จัดการสมาชิก</span>
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="sidebar-note-icon">
              <ShieldCheck size={20} />
            </span>
            <strong>{s.admin ? 'พื้นที่สำหรับผู้ดูแล' : 'ดูข้อมูลได้ครบ ไม่ต้องล็อกอิน'}</strong>
            <p>
              {s.admin
                ? 'จัดการข้อมูลการเดินรถและการเงินของคุณได้ครบในที่เดียว'
                : 'ดูคิว งานวิ่ง การเงินและหลักฐานได้ครบ เพิ่มหรือแก้ไขได้เฉพาะผู้ดูแล'}
            </p>
            <button onClick={() => setDialog({ type: 'help' })}>
              วิธีใช้งาน <ArrowRight size={14} />
            </button>
          </div>
          <button className="nav-item" onClick={() => setDialog({ type: 'help' })}>
            <CircleHelp size={19} />
            ช่วยเหลือ
          </button>
          <div className="version">
            <span className="live-dot" /> QUEUECAR <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <Logo />
          </div>
          <div className="breadcrumb">
            พื้นที่ทำงาน <ChevronRight size={13} /> <strong>{headerTitles[page][0]}</strong>
          </div>
          <div className="topbar-right">
            {s.owner && (
              <button
                className="member-menu-button"
                onClick={() => navigate('members')}
                aria-label="จัดการสมาชิก"
              >
                <ShieldCheck size={18} />
                <span>สมาชิก</span>
              </button>
            )}
            <span className="connection-status">
              <span className={`live-dot ${!s.online ? 'offline' : ''}`} />
              {s.demo ? 'โหมดตัวอย่าง' : s.online ? 'อัปเดตอัตโนมัติ' : 'ออฟไลน์'}
            </span>
            {s.admin ? (
              <button
                className="profile-chip"
                aria-label={s.demo ? 'ออกจากโหมดผู้ดูแล' : 'ออกจากระบบ'}
                onClick={() => {
                  if (s.demo) s.toggleDemoAdmin()
                  else void logout().catch((e) => setToast(errorMessage(e)))
                }}
                title="ออกจากระบบ"
              >
                <span className="profile-avatar">
                  {(s.email || 'ผู้ดูแล').slice(0, 1).toUpperCase()}
                </span>
                <span>
                  {s.owner ? 'ผู้ดูแลหลัก' : 'ผู้ดูแลระบบ'}
                  <small>{s.demo ? 'ออกจากโหมดผู้ดูแล' : s.email}</small>
                </span>
                <LogOut size={16} />
              </button>
            ) : (
              <button
                className="btn small login-btn"
                onClick={() => (s.demo ? s.toggleDemoAdmin() : setDialog({ type: 'login' }))}
              >
                <LogIn size={16} />
                <span>เข้าสู่ระบบผู้ดูแล</span>
              </button>
            )}
          </div>
        </header>
        <main className={`page-${page}`}>
          {s.demo && (
            <div className="demo-banner">
              <span>
                <strong>ข้อมูลตัวอย่าง</strong>
                <span className="demo-detail"> · ไม่บันทึกลงระบบจริง</span>
              </span>
              <button
                onClick={() => {
                  s.resetDemo()
                  setToast('เริ่มข้อมูลตัวอย่างใหม่แล้ว')
                }}
              >
                เริ่มใหม่
              </button>
              <a href="/">
                กลับระบบจริง <ArrowRight size={13} />
              </a>
            </div>
          )}
          {!s.configured && !s.demo && (
            <div className="notice">
              <strong>กำลังเตรียมการเชื่อมต่อระบบ</strong>
              <span>คุณสามารถดูหน้าตาและทดลองใช้งานได้ก่อน</span>
              <a className="btn secondary small" href="/?demo=1">
                เปิดโหมดตัวอย่าง <ArrowRight size={15} />
              </a>
            </div>
          )}
          {!s.online && (
            <div className="notice warning">
              <WifiOff size={18} />
              ขณะนี้ออฟไลน์ ข้อมูลที่แสดงอาจไม่ใช่ข้อมูลล่าสุด และยังบันทึกการเปลี่ยนแปลงไม่ได้
            </div>
          )}
          {s.error && (
            <div className="notice error" role="alert">
              {s.error}
              <button className="btn small secondary" onClick={() => location.reload()}>
                ลองเชื่อมต่อใหม่
              </button>
            </div>
          )}
          {s.email && !s.admin && (
            <div className="notice">
              บัญชี {s.email} เข้าใช้ในโหมดผู้ชม ไม่มีสิทธิ์จัดการข้อมูล
              <button className="text-btn" onClick={() => void logout()}>
                ออกจากระบบ
              </button>
            </div>
          )}
          {page !== 'dashboard' && (
            <div className="page-heading">
              <div>
                <div className="eyebrow">{s.admin ? 'FLEET WORKSPACE' : 'LIVE FLEET BOARD'}</div>
                <h1>{headerTitles[page][0]}</h1>
                <p>{headerTitles[page][1]}</p>
              </div>
              <div className="heading-actions">
                {page === 'jobs' && dateControl()}
                {s.admin && page !== 'members' && page !== 'sales' && (
                  <button
                    className="btn primary"
                    onClick={() =>
                      page === 'finance'
                        ? newEntry()
                        : page === 'drivers'
                          ? setDialog({ type: 'driver' })
                          : newQueue()
                    }
                  >
                    <Plus size={18} />
                    {page === 'finance'
                      ? 'เพิ่มรายการ'
                      : page === 'drivers'
                        ? 'เพิ่มคนรถ'
                        : 'ลงคิวรถ'}
                  </button>
                )}
              </div>
            </div>
          )}
          {s.loading ? (
            <div className="loading-state">
              <span className="loading-bar" />
              <p>กำลังโหลดคิวและงานวิ่ง…</p>
            </div>
          ) : (
            <>
              {page === 'members' && s.owner && <MembersPanel />}
              {page === 'sales' && <SalesPanel />}
              {page === 'dashboard' && (
                <>
                  <section className="dispatch-board" aria-label="คิวรถปัจจุบัน">
                    <div className="dispatch-heading">
                      <div>
                        <span className="section-index">01 / คิวปัจจุบัน</span>
                        <h1>
                          <strong>{queue.length}</strong>
                          <span>คันรอรับงาน</span>
                        </h1>
                        <p>
                          <span className={`live-dot ${!s.online ? 'offline' : ''}`} />
                          {s.online ? 'อัปเดตคิวอัตโนมัติ' : 'ออฟไลน์'} · {dateLabel(currentDay)}
                        </p>
                      </div>
                      {s.admin && (
                        <button className="btn primary" onClick={newQueue}>
                          <Plus size={18} /> ลงคิวรถ
                        </button>
                      )}
                    </div>
                    {queueContent(true)}
                    <div className="dispatch-footer">
                      <span>
                        {queue.length > 4 ? `แสดง 4 จาก ${queue.length} คัน` : 'เรียงตามเวลาลงคิว'}
                      </span>
                      <button className="text-btn" onClick={() => navigate('queue')}>
                        ดูคิวทั้งหมด <ArrowRight size={16} />
                      </button>
                    </div>
                  </section>
                  <TodayActivity
                    jobs={s.data.jobs}
                    day={currentDay}
                    error={s.jobsError}
                    onJob={(job) => setDialog({ type: 'job-detail', job })}
                    onAll={() => {
                      s.setDay(currentDay)
                      navigate('jobs')
                    }}
                  />
                  <ReportPanel {...reportProps} />
                </>
              )}
              {page === 'queue' && (
                <>
                  <div className="toolbar">
                    <div className="search-box">
                      <Search size={18} />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="ค้นหาชื่อคนรถ หรือทะเบียน…"
                        aria-label="ค้นหาคิวรถ"
                      />
                    </div>
                    <span className="muted">
                      รถรอคิวทั้งหมด <strong>{queue.length}</strong> คัน
                    </span>
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>
                        ลำดับคิว <span className="count">{queue.length}</span>
                      </h2>
                      <span className="live-pill">
                        <Radio size={13} /> LIVE
                      </span>
                    </div>
                    {queueContent()}
                  </section>
                  <Hint>
                    {s.admin
                      ? 'กด … เพื่อเปลี่ยนเป็น “กำลังไปขึ้นงาน” ก่อนจ่ายงาน รถยังอยู่ในคิวเดิม เมื่อจ่ายงานแล้วจะออกจากคิวอัตโนมัติ'
                      : 'รถที่กำลังไปขึ้นงานยังอยู่ในคิวเดิม เมื่อผู้ดูแลจ่ายงานแล้วจะแสดงในหน้างานวิ่ง'}
                  </Hint>
                </>
              )}
              {page === 'jobs' && (
                <>
                  <div className="toolbar">
                    <div className="search-box">
                      <Search size={18} />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="ค้นหาคนรถ ทะเบียน หรือจังหวัด…"
                        aria-label="ค้นหางานวิ่ง"
                      />
                    </div>
                    <button
                      className="btn secondary small"
                      onClick={() =>
                        exportCsv(`งานวิ่ง-${s.day}.csv`, [
                          ['วันที่', 'คนรถ', 'ทะเบียน', 'เส้นทาง', 'สถานะ'],
                          ...visibleJobs.map((j) => [
                            j.date,
                            j.driverName,
                            j.plate,
                            j.provinces.join(' → '),
                            jobStates[j.status],
                          ]),
                        ])
                      }
                    >
                      <ArrowDownToLine size={16} />
                      ส่งออก CSV
                    </button>
                  </div>
                  <div className="tabs">
                    {[['all', 'ทั้งหมด'], ...Object.entries(jobStates)].map(([id, label]) => (
                      <button
                        className={jobFilter === id ? 'active' : ''}
                        onClick={() => setJobFilter(id)}
                        key={id}
                      >
                        {label}
                        <span>
                          {id === 'all' ? jobs.length : jobs.filter((j) => j.status === id).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  {visibleJobs.length ? (
                    <div className="jobs-grid">{visibleJobs.map(jobCard)}</div>
                  ) : (
                    <div className="panel">
                      <Empty
                        title="ไม่พบงานวิ่งในวันที่เลือก"
                        detail="ลองเปลี่ยนวันที่ หรือค้นหาด้วยชื่อและทะเบียนอื่น"
                      />
                    </div>
                  )}
                </>
              )}
              {page === 'finance' && (
                <>
                  <div className="finance-top">
                    <label className="month-control">
                      <span>เดือนที่แสดง</span>
                      <DateInput
                        type="month"
                        aria-label="เดือนรายการการเงิน"
                        value={s.month}
                        onChange={(e) => {
                          if (e.target.value) s.setMonth(e.target.value)
                        }}
                      />
                    </label>
                    <button
                      className="btn secondary small"
                      onClick={() =>
                        exportCsv(`การเงิน-${s.month}.csv`, [
                          [
                            'วันที่',
                            'ประเภท',
                            'คนรถ',
                            'ทะเบียน',
                            'จำนวนเงิน (บาท)',
                            'ผู้รับเงิน',
                            'รายละเอียด',
                            'สถานะ',
                          ],
                          ...visibleEntries.map((e) => [
                            e.date,
                            kinds[e.kind],
                            e.driverName,
                            e.plate,
                            (e.amount / 100).toFixed(2),
                            e.recipient,
                            e.description,
                            entryStates[e.status],
                          ]),
                        ])
                      }
                    >
                      <ArrowDownToLine size={16} />
                      ส่งออก CSV
                    </button>
                  </div>
                  <FinanceSummary entries={entries} />
                  <div className="toolbar">
                    <div className="search-box">
                      <Search size={18} />
                      <input
                        placeholder="ค้นหาคนรถ ผู้รับ หรือรายละเอียด…"
                        aria-label="ค้นหาการเงิน"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <select
                      aria-label="กรองคนรถ"
                      value={entryDriver}
                      onChange={(e) => setEntryDriver(e.target.value)}
                    >
                      <option value="">คนรถทุกคน</option>
                      {s.data.drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="กรองสถานะรายการ"
                      value={entryStatusFilter}
                      onChange={(e) => setEntryStatusFilter(e.target.value)}
                    >
                      <option value="all">ทุกสถานะ</option>
                      {Object.entries(entryStates).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="tabs">
                    {[['all', 'ทั้งหมด'], ...Object.entries(kinds)].map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() => setEntryFilter(k)}
                        className={k === entryFilter ? 'active' : ''}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>
                        รายการการเงิน <span className="count">{visibleEntries.length}</span>
                      </h2>
                      <span className="pending-label">
                        {entries.filter((e) => e.status === 'pending').length} รอดำเนินการ
                      </span>
                    </div>
                    {visibleEntries.length ? (
                      <div className="entries-list">
                        {visibleEntries.map((e) => (
                          <button
                            key={e.id}
                            className="entry-row"
                            onClick={() => setDialog({ type: 'entry-detail', entry: e })}
                          >
                            <span className={`entry-icon ${e.kind}`}>
                              {e.kind === 'repair' ? (
                                <Wrench size={20} />
                              ) : e.kind === 'deduction' ? (
                                <ArrowDownLeft size={20} />
                              ) : (
                                <Wallet size={20} />
                              )}
                            </span>
                            <span className="entry-main">
                              <strong>{e.description}</strong>
                              <small>
                                {e.driverName} · {e.plate}
                              </small>
                              <span className="entry-meta">
                                {dateLabel(e.date)} · {kinds[e.kind]} · ให้ {e.recipient}
                                {e.evidenceCount > 0 && (
                                  <>
                                    <FileText size={12} />
                                    {e.evidenceCount}
                                  </>
                                )}
                              </span>
                            </span>
                            <span className="entry-amount">
                              <strong className={e.kind === 'deduction' ? 'deduction' : ''}>
                                ฿{money(e.amount)}
                              </strong>
                              <Badge state={e.status}>{entryStates[e.status]}</Badge>
                            </span>
                            <ChevronRight size={16} className="muted" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        title="ยังไม่มีรายการที่ตรงกับตัวกรอง"
                        detail={
                          s.admin
                            ? 'เพิ่มรายการเบิกเงิน ค่าซ่อม หรือหักเงิน พร้อมแนบหลักฐาน'
                            : 'ลองเปลี่ยนเดือนหรือตัวกรองเพื่อดูรายการอื่น'
                        }
                        action={
                          s.admin && (
                            <button className="btn primary small" onClick={newEntry}>
                              <Plus size={16} />
                              เพิ่มรายการ
                            </button>
                          )
                        }
                      />
                    )}
                  </section>
                  <Hint>
                    ยอดสรุปนับรายการที่ดำเนินการแล้ว แยกตามประเภทและเดือนที่เลือก
                    {!s.admin && ' · แตะรายการเพื่อดูรายละเอียดและหลักฐาน'}
                  </Hint>
                </>
              )}
              {page === 'drivers' && (
                <>
                  <div className="toolbar">
                    <div className="search-box">
                      <Search size={18} />
                      <input
                        aria-label="ค้นหาทะเบียนคนรถ"
                        placeholder="ค้นหาชื่อคนรถ หรือทะเบียน…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <span className="muted">
                      {s.data.drivers.filter((d) => d.active).length} คนที่เปิดใช้งาน
                    </span>
                  </div>
                  <div className="drivers-grid">
                    {s.data.drivers
                      .filter((d) => `${d.name} ${d.plate}`.includes(search))
                      .map((d, i) => {
                        const inQueue = queue.find((q) => q.id === d.id)
                        return (
                          <article className="driver-card" key={d.id}>
                            <div className="driver-card-top">
                              <Avatar name={d.name} index={i} />
                              <button
                                className="driver-card-open"
                                onClick={() =>
                                  reportProps.onDriver({ id: d.id, name: d.name, plate: d.plate })
                                }
                              >
                                <strong>
                                  {d.name} <ChevronRight size={15} />
                                </strong>
                                <small>
                                  {d.plate} · {d.truckType}
                                </small>
                              </button>
                              {s.admin && (
                                <button
                                  className="icon-btn"
                                  aria-label={`แก้ไข ${d.name}`}
                                  onClick={() => setDialog({ type: 'driver', driver: d })}
                                >
                                  <MoreHorizontal size={21} />
                                </button>
                              )}
                            </div>
                            <div className="driver-phone">
                              <PhoneLink phone={d.phone} name={d.name} />
                              {!telephoneHref(d.phone) && <span>ยังไม่มีเบอร์ที่โทรได้</span>}
                            </div>
                            <div className="driver-card-bottom">
                              <Badge
                                state={
                                  !d.active
                                    ? 'cancelled'
                                    : d.activeJobId
                                      ? 'running'
                                      : inQueue
                                        ? queueStatus(inQueue)
                                        : 'completed'
                                }
                              >
                                {!d.active
                                  ? 'ปิดใช้งาน'
                                  : d.activeJobId
                                    ? 'มีงานที่ยังไม่จบ'
                                    : inQueue
                                      ? queueStates[queueStatus(inQueue)]
                                      : 'พร้อมรับงาน'}
                              </Badge>
                              {s.admin && d.active && !d.activeJobId && !inQueue && (
                                <button
                                  className="text-btn"
                                  onClick={() =>
                                    setDialog({
                                      type: 'confirm',
                                      title: 'ลงคิวรถ',
                                      text: `ลงคิว ${d.name} ทะเบียน ${d.plate} ต่อท้ายคิวปัจจุบัน`,
                                      label: 'ยืนยันลงคิว',
                                      action: () => s.joinQueue(d.id),
                                    })
                                  }
                                >
                                  <Plus size={15} /> ลงคิว
                                </button>
                              )}
                            </div>
                          </article>
                        )
                      })}
                  </div>
                  {!s.data.drivers.length && (
                    <div className="panel">
                      <Empty
                        title={s.admin ? 'เริ่มจากเพิ่มคนรถคนแรก' : 'ยังไม่มีข้อมูลคนรถ'}
                        detail={
                          s.admin
                            ? 'ระบุชื่อ ทะเบียน และประเภทรถ เพื่อพร้อมลงคิว'
                            : 'ข้อมูลจะแสดงเมื่อผู้ดูแลเพิ่มคนรถ'
                        }
                        action={
                          s.admin && (
                            <button
                              className="btn primary"
                              onClick={() => setDialog({ type: 'driver' })}
                            >
                              <Plus size={17} />
                              เพิ่มคนรถ
                            </button>
                          )
                        }
                      />
                    </div>
                  )}
                </>
              )}
              {page === 'activity' && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>กิจกรรมล่าสุด</h2>
                    <span className="muted">สูงสุด 30 รายการ</span>
                  </div>
                  {s.data.audits.map((a) => (
                    <div className="audit-row" key={a.id}>
                      <span className="audit-dot" />
                      <div>
                        <strong>{a.action}</strong>
                        <p>{a.detail}</p>
                        <small>
                          {a.actor} ·{' '}
                          {new Intl.DateTimeFormat('th-TH', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                            timeZone: 'Asia/Bangkok',
                          }).format(a.createdAt)}
                        </small>
                      </div>
                    </div>
                  ))}
                  {!s.data.audits.length && (
                    <Empty
                      title="ยังไม่มีกิจกรรม"
                      detail="การลงคิว จ่ายงาน และการเงิน จะบันทึกไว้ที่นี่"
                    />
                  )}
                </section>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>คิวรถ / สมุดงานเดินรถ</span>
            <div>
              <button className="text-btn" onClick={() => navigate('activity')}>
                ประวัติกิจกรรม
              </button>
              <span>
                <ShieldCheck size={13} />
                {s.admin ? 'ผู้ดูแลระบบ' : 'Guest · ดูอย่างเดียว'}
              </span>
            </div>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="เมนูมือถือ">
        {navs.map((n) => (
          <button
            onClick={() => navigate(n.id)}
            key={n.id}
            className={page === n.id ? 'active' : ''}
          >
            <n.icon size={21} />
            <span>{n.label}</span>
            {n.id === 'queue' && queue.length > 0 && <i>{queue.length}</i>}
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {dialog && (
        <Modal
          wide={dialog.type === 'driver-report'}
          title={
            dialog.type === 'login'
              ? 'เข้าสู่ระบบ'
              : dialog.type === 'driver-report'
                ? 'รายงานคนรถ'
                : dialog.type === 'queue'
                  ? 'ลงคิวรถ'
                  : dialog.type === 'driver'
                    ? dialog.driver
                      ? 'แก้ไขข้อมูลคนรถ'
                      : 'เพิ่มคนรถ'
                    : dialog.type === 'queue-actions'
                      ? 'จัดการคิวรถ'
                      : dialog.type === 'job'
                        ? 'จ่ายงานวิ่ง'
                        : dialog.type === 'cancel-queue'
                          ? 'ยกเลิกคิว'
                          : dialog.type === 'entry'
                            ? 'เพิ่มรายการการเงิน'
                            : dialog.type === 'job-detail'
                              ? 'รายละเอียดงานวิ่ง'
                              : dialog.type === 'entry-detail'
                                ? 'รายละเอียดการเงิน'
                                : dialog.type === 'confirm'
                                  ? dialog.title
                                  : 'ใช้งานคิวรถ'
          }
          onClose={() => setDialog(null)}
        >
          {dialog.type === 'login' && (
            <LoginPanel onLogin={() => void signIn()} busy={loginBusy} error={loginError} />
          )}
          {dialog.type === 'driver-report' && (
            <DriverReport
              key={dialog.driver.id}
              {...reportProps}
              driver={dialog.driver}
              contact={s.data.drivers.find((d) => d.id === dialog.driver.id)}
              queued={queue.find((q) => q.driverId === dialog.driver.id)}
            />
          )}
          {dialog.type === 'queue' && s.admin && (
            <QueueForm onDone={done} onAddDriver={() => setDialog({ type: 'driver' })} />
          )}
          {dialog.type === 'driver' && s.admin && (
            <DriverForm driver={dialog.driver} onDone={done} />
          )}
          {dialog.type === 'queue-actions' && s.admin && (
            <div className="form queue-action-sheet">
              <div className="selected-person">
                <Avatar name={dialog.item.driverName} />
                <div>
                  <strong>{dialog.item.driverName}</strong>
                  <small>
                    {dialog.item.plate} · {dialog.item.truckType}
                  </small>
                </div>
              </div>
              <Badge state={queueStatus(dialog.item)}>
                {queueStates[queueStatus(dialog.item)]}
              </Badge>
              <button onClick={() => updateQueueStatus(dialog.item)}>
                <Navigation size={20} />
                <span>
                  <strong>
                    {queueStatus(dialog.item) === 'heading' ? 'กลับเป็นรอคิว' : 'กำลังไปขึ้นงาน'}
                  </strong>
                  <small>เปลี่ยนสถานะโดยคงลำดับคิวเดิม</small>
                </span>
                <ChevronRight size={17} />
              </button>
              <button onClick={() => setDialog({ type: 'job', item: dialog.item })}>
                <Truck size={20} />
                <span>
                  <strong>จ่ายงานวิ่ง</strong>
                  <small>เลือกจังหวัดและเส้นทางให้รถคันนี้</small>
                </span>
                <ChevronRight size={17} />
              </button>
              <button onClick={() => moveQueueToEnd(dialog.item)}>
                <ListEnd size={20} />
                <span>
                  <strong>ย้ายไปท้ายคิว</strong>
                  <small>ลงคิวใหม่ต่อท้ายรถคันอื่น</small>
                </span>
                <ChevronRight size={17} />
              </button>
              <button
                className="danger-text"
                onClick={() => setDialog({ type: 'cancel-queue', item: dialog.item })}
              >
                <X size={20} />
                <span>
                  <strong>ยกเลิกคิว</strong>
                  <small>ระบุคนขึ้นแทนและยอดเงินได้ หากมี</small>
                </span>
                <ChevronRight size={17} />
              </button>
            </div>
          )}
          {dialog.type === 'job' && s.admin && <JobForm item={dialog.item} onDone={done} />}
          {dialog.type === 'cancel-queue' && s.admin && (
            <CancelQueueForm item={dialog.item} onDone={done} />
          )}
          {dialog.type === 'entry' && s.admin && <EntryForm onDone={done} />}
          {dialog.type === 'confirm' && s.admin && (
            <ConfirmForm
              text={dialog.text}
              label={dialog.label}
              onConfirm={dialog.action}
              onDone={done}
            />
          )}
          {dialog.type === 'job-detail' && (
            <JobDetail
              job={s.data.jobs.find((j) => j.id === dialog.job.id) || dialog.job}
              onDriver={() =>
                reportProps.onDriver({
                  id: dialog.job.driverId,
                  name: dialog.job.driverName,
                  plate: dialog.job.plate,
                })
              }
              onAction={(status) =>
                setDialog({
                  type: 'confirm',
                  title:
                    status === 'completed'
                      ? 'ยืนยันจบงาน'
                      : status === 'cancelled'
                        ? 'ยกเลิกงานวิ่ง'
                        : 'เริ่มวิ่งงาน',
                  text: `${dialog.job.driverName} · ${dialog.job.plate} · ${dialog.job.provinces.join(' → ')}${status === 'completed' || status === 'cancelled' ? ' หลังดำเนินการสามารถนำคนรถลงคิวใหม่ได้' : ''}`,
                  label: 'ยืนยัน',
                  action: () => s.jobStatus(dialog.job, status),
                })
              }
            />
          )}
          {dialog.type === 'entry-detail' && (
            <EntryDetail
              key={dialog.entry.id}
              entry={s.data.entries.find((e) => e.id === dialog.entry.id) || dialog.entry}
              onDriver={() =>
                reportProps.onDriver({
                  id: dialog.entry.driverId,
                  name: dialog.entry.driverName,
                  plate: dialog.entry.plate,
                })
              }
              onAction={(status) =>
                setDialog({
                  type: 'confirm',
                  title: status === 'paid' ? 'ยืนยันบันทึกการจ่าย / หักเงิน' : 'ยกเลิกรายการ',
                  text:
                    status === 'paid'
                      ? `บันทึกว่าได้ดำเนินการ ${kinds[dialog.entry.kind]} ${money(dialog.entry.amount)} บาท ให้ ${dialog.entry.recipient} แล้ว (ระบบไม่มีการโอนเงินจริง)`
                      : 'รายการจะไม่ถูกนับในยอดรวม และยังคงอยู่ในประวัติ',
                  label: 'ยืนยัน',
                  action: () => s.entryStatus(dialog.entry, status),
                })
              }
            />
          )}
          {dialog.type === 'help' && (
            <div className="form help-content">
              <p>
                <strong>ผู้เข้าชม (Guest)</strong>
                <br />
                ดูคิว คนรถ เบอร์โทร งานวิ่ง การเงิน หลักฐานและประวัติรายการได้โดยไม่ต้องล็อกอิน
                แตะแถวคนรถเพื่อดูรายละเอียด หรือกดโทรเมื่อมีเบอร์ การเพิ่ม แก้ไข
                และยกเลิกใช้ได้เฉพาะผู้ดูแล
              </p>
              <p>
                <strong>ผู้ดูแลระบบ</strong>
                <br />
                เข้าสู่ระบบ Google ด้วยบัญชีที่ได้รับสิทธิ์ เริ่มจากเพิ่มคนรถ → ลงคิว → จ่ายงาน →
                จบงาน แล้วลงคิวรอบใหม่
              </p>
              <p>
                <strong>การเงินและหลักฐาน</strong>
                <br />
                เลือกประเภทและคนรถ ระบุจำนวนเงิน ผู้รับเงิน และเหตุผล แนบรูปได้สูงสุด 3 รูป
                จากนั้นกดยืนยันเมื่อจ่ายหรือหักเงินจริงแล้ว
              </p>
              <Hint>
                ระบบใช้ Firebase Spark มีโควตาฟรีจำกัด รูปหลักฐานถูกบีบอัด
                และโหลดเมื่อเปิดดูเท่านั้น
              </Hint>
              {!s.demo && (
                <a className="btn secondary" href="/?demo=1">
                  ลองใช้งานด้วยข้อมูลตัวอย่าง <ArrowRight size={16} />
                </a>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
function JobDetail({
  job,
  onAction,
  onDriver,
}: {
  job: Job
  onAction: (s: Job['status']) => void
  onDriver: () => void
}) {
  const s = useStore()
  return (
    <div className="form detail">
      <button className="text-btn" onClick={onDriver}>
        ดูรายงานรวมของคนรถคันนี้ <ArrowRight size={16} />
      </button>
      <div className="detail-top">
        <div className="selected-person">
          <Avatar name={job.driverName} />
          <div>
            <strong>{job.driverName}</strong>
            <small>
              {job.plate} · {job.truckType}
            </small>
          </div>
        </div>
        <Badge state={job.status}>{jobStates[job.status]}</Badge>
      </div>
      <PhoneLink
        phone={s.data.drivers.find((d) => d.id === job.driverId)?.phone}
        name={job.driverName}
      />
      <dl>
        <div>
          <dt>วันที่ออกงาน</dt>
          <dd>{dateLabel(job.date, true)}</dd>
        </div>
        <div>
          <dt>จุดส่ง / จังหวัดพ่วง</dt>
          <dd>{job.provinces.length} จังหวัด</dd>
        </div>
      </dl>
      <div className="route-timeline">
        {job.provinces.map((p, i) => (
          <div key={i}>
            <span>{i + 1}</span>
            <div>
              <small>
                {i === 0
                  ? 'จุดส่งแรก'
                  : i === job.provinces.length - 1
                    ? 'ปลายทางสุดท้าย'
                    : 'จุดพ่วง'}
              </small>
              <strong>{p}</strong>
            </div>
          </div>
        ))}
      </div>
      {job.note && (
        <div className="detail-note">
          <small>รายละเอียดงาน</small>
          <p>{job.note}</p>
        </div>
      )}
      {s.admin && ['running', 'scheduled'].includes(job.status) && (
        <div className="detail-actions">
          <button
            className="btn primary"
            onClick={() => onAction(job.status === 'scheduled' ? 'running' : 'completed')}
          >
            <Check size={17} />
            {job.status === 'scheduled' ? 'เริ่มวิ่งงาน' : 'จบงานเที่ยวนี้'}
          </button>
          <button className="btn secondary danger-text" onClick={() => onAction('cancelled')}>
            ยกเลิกงาน
          </button>
        </div>
      )}
    </div>
  )
}
function EntryDetail({
  entry,
  onAction,
  onDriver,
}: {
  entry: Entry
  onAction: (s: Entry['status']) => void
  onDriver: () => void
}) {
  const s = useStore(),
    [images, setImages] = useState<Evidence[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false)
  async function load() {
    setBusy(true)
    setError('')
    try {
      setImages(await s.evidence(entry.id))
      setLoaded(true)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="form detail">
      <div className="detail-top">
        <span className={`category-label ${entry.kind}`}>{kinds[entry.kind]}</span>
        <Badge state={entry.status}>{entryStates[entry.status]}</Badge>
      </div>
      <div className="detail-money">฿{money(entry.amount)}</div>
      <p className="entry-description">{entry.description}</p>
      <PhoneLink
        phone={s.data.drivers.find((d) => d.id === entry.driverId)?.phone}
        name={entry.driverName}
      />
      <dl>
        <div>
          <dt>คนรถ</dt>
          <dd>
            <button className="driver-name-link" onClick={onDriver}>
              {entry.driverName}
              <ChevronRight size={15} />
            </button>
          </dd>
        </div>
        <div>
          <dt>ทะเบียนรถ</dt>
          <dd>{entry.plate}</dd>
        </div>
        <div>
          <dt>วันที่</dt>
          <dd>{dateLabel(entry.date, true)}</dd>
        </div>
        <div>
          <dt>{entry.kind === 'deduction' ? 'หักให้ / ผู้รับเงิน' : 'ผู้รับเงิน'}</dt>
          <dd>{entry.recipient}</dd>
        </div>
      </dl>
      <div className="evidence-section">
        <h3>
          <FileText size={17} />
          หลักฐาน <span className="count">{entry.evidenceCount}</span>
        </h3>
        {entry.evidenceCount === 0 ? (
          <p className="muted">ไม่มีรูปหลักฐานแนบในรายการนี้</p>
        ) : !loaded ? (
          <button className="btn secondary" onClick={() => void load()} disabled={busy}>
            {busy ? 'กำลังโหลดรูป…' : 'เปิดดูรูปหลักฐาน'}
          </button>
        ) : (
          <div className="evidence-images">
            {images.map((i) => (
              <a key={i.id} href={i.dataUrl} download={i.name}>
                <img src={i.dataUrl} alt={i.name} />
                <span>
                  <ArrowDownToLine size={14} />
                  {i.name}
                </span>
              </a>
            ))}
            {images.length === 0 && (
              <p className="muted">รูปในโหมดตัวอย่างจะไม่ถูกเก็บหลังรีเฟรชหน้า</p>
            )}
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>
      {s.admin && entry.status !== 'void' && (
        <div className="detail-actions">
          {entry.status === 'pending' && (
            <button className="btn primary" onClick={() => onAction('paid')}>
              <Check size={17} />
              {entry.kind === 'deduction' ? 'บันทึกหักเงินแล้ว' : 'บันทึกจ่ายแล้ว'}
            </button>
          )}
          <button className="btn secondary danger-text" onClick={() => onAction('void')}>
            ยกเลิกรายการ
          </button>
        </div>
      )}
    </div>
  )
}
