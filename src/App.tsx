import { useEffect, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ListEnd,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  FileText,
  LayoutDashboard,
  LogIn,
  LogOut,
  MapPin,
  MoreHorizontal,
  Plus,
  Radio,
  ReceiptText,
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
import { errorMessage, login, logout } from './lib/firebase'
import {
  dateLabel,
  entryStates,
  exportCsv,
  jobStates,
  kinds,
  money,
  shiftDate,
  today,
} from './lib/model'
import type { Driver, Entry, Evidence, Job, QueueItem } from './lib/model'
import { Avatar, Badge, Empty, Hint, Logo, MapArt, Modal, Route } from './components/ui'
import {
  CancelQueueForm,
  ConfirmForm,
  DriverForm,
  EntryForm,
  JobForm,
  LoginPanel,
  QueueForm,
} from './components/Forms'
type Page = 'dashboard' | 'queue' | 'jobs' | 'finance' | 'drivers' | 'activity'
type Dialog =
  | { type: 'login' | 'queue' | 'driver' | 'entry' | 'help'; driver?: Driver }
  | { type: 'job' | 'cancel-queue' | 'queue-actions'; item: QueueItem }
  | { type: 'job-detail'; job: Job }
  | { type: 'entry-detail'; entry: Entry }
  | { type: 'confirm'; title: string; text: string; label: string; action: () => Promise<void> }
const navs: { id: Page; label: string; icon: LucideIcon; private?: boolean }[] = [
  { id: 'dashboard', label: 'ภาพรวม', icon: LayoutDashboard },
  { id: 'queue', label: 'คิวรถ', icon: ClipboardList },
  { id: 'jobs', label: 'งานวิ่ง', icon: MapPin },
  { id: 'finance', label: 'การเงิน', icon: Wallet, private: true },
  { id: 'drivers', label: 'คนรถ', icon: Users, private: true },
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
    [loginError, setLoginError] = useState('')
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
    if (!s.admin && ['finance', 'drivers', 'activity'].includes(page)) setPage('dashboard')
    if (
      !s.admin &&
      dialog &&
      dialog.type !== 'login' &&
      dialog.type !== 'job-detail' &&
      dialog.type !== 'help'
    )
      setDialog(null)
  }, [s.admin, page, dialog])
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
  const dayJobs = jobs.filter((j) => j.status !== 'cancelled')
  const destinationCount = new Set(dayJobs.flatMap((j) => j.provinces)).size
  const summary = [
    {
      label: 'รอคิว',
      value: queue.length,
      unit: 'คัน',
      icon: ClipboardList,
      color: 'green',
      detail: 'พร้อมรับงานถัดไป',
      page: 'queue' as const,
      filter: 'all',
    },
    {
      label: 'กำลังวิ่ง',
      value: jobs.filter((j) => j.status === 'running').length,
      unit: 'คัน',
      icon: Truck,
      color: 'blue',
      detail: `วันที่ ${dateLabel(s.day)}`,
      page: 'jobs' as const,
      filter: 'running',
    },
    {
      label: 'จบงานแล้ว',
      value: jobs.filter((j) => j.status === 'completed').length,
      unit: 'เที่ยว',
      icon: Check,
      color: 'orange',
      detail: `วันที่ ${dateLabel(s.day)}`,
      page: 'jobs' as const,
      filter: 'completed',
    },
  ]
  function moveQueueToEnd(item: QueueItem) {
    setDialog({
      type: 'confirm',
      title: 'ย้ายไปท้ายคิว',
      text: `ย้าย ${item.driverName} ทะเบียน ${item.plate} ไปต่อท้ายคิวปัจจุบัน เวลาลงคิวจะเปลี่ยนเป็นเวลาใหม่`,
      label: 'ยืนยันย้ายไปท้ายคิว',
      action: () => s.moveToEnd(item),
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
        <label>
          <CalendarDays size={16} />
          <span>
            {s.day === today() && <span className="date-today">วันนี้ · </span>}
            {dateLabel(s.day)}
          </span>
          <input
            aria-label="เลือกวันที่งานวิ่ง"
            type="date"
            value={s.day}
            onChange={(e) => {
              if (e.target.value) s.setDay(e.target.value)
            }}
          />
        </label>
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
    return (
      <>
        {list.length ? (
          <div className={`queue-list ${compact ? 'queue-preview' : ''}`}>
            {list.map((q, i) => (
              <div
                className={`queue-row ${queue.indexOf(q) === 0 ? 'first' : ''} ${s.admin ? 'managed' : ''}`}
                key={q.id}
              >
                <div className="queue-number">{String(queue.indexOf(q) + 1).padStart(2, '0')}</div>
                {!compact && <Avatar name={q.driverName} index={i} />}
                <div className="queue-person">
                  <strong>
                    {q.driverName}
                    {!compact && queue.indexOf(q) === 0 && (
                      <span className="next-label">คิวถัดไป</span>
                    )}
                  </strong>
                  <span>
                    <span className="plate">{q.plate}</span>
                    <span className="truck-type">{q.truckType}</span>
                  </span>
                </div>
                <div className="queue-time">
                  <Clock3 size={13} />
                  {new Intl.DateTimeFormat('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Bangkok',
                  }).format(q.joinedAt)}
                  <small>
                    {new Intl.DateTimeFormat('th-TH', {
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'Asia/Bangkok',
                    }).format(q.joinedAt)}
                  </small>
                </div>
                {s.admin && compact && (
                  <button
                    className="icon-btn queue-more"
                    aria-label={`จัดการคิว ${q.driverName}`}
                    aria-haspopup="dialog"
                    onClick={() => setDialog({ type: 'queue-actions', item: q })}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                )}
                {s.admin && !compact && (
                  <div className="row-actions">
                    <button
                      className="btn small primary-light"
                      onClick={() => setDialog({ type: 'job', item: q })}
                    >
                      จ่ายงาน <ArrowUpRight size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`ย้ายไปท้ายคิว ${q.driverName}`}
                      title="ย้ายไปท้ายคิว"
                      onClick={() => moveQueueToEnd(q)}
                    >
                      <ListEnd size={17} />
                    </button>
                    <button
                      className="icon-btn danger-text"
                      aria-label={`ยกเลิกคิว ${q.driverName}`}
                      onClick={() => setDialog({ type: 'cancel-queue', item: q })}
                    >
                      <X size={17} />
                    </button>
                  </div>
                )}
              </div>
            ))}
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
        )}
      </>
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
    dashboard: ['ภาพรวม', 'คิวรถปัจจุบัน และงานวิ่งตามวันที่เลือก'],
    queue: ['คิวรถปัจจุบัน', 'เรียงตามลำดับลงคิว พร้อมสำหรับงานถัดไป'],
    jobs: ['งานวิ่งประจำวัน', 'ติดตามรถและจังหวัดปลายทางในแต่ละเที่ยว'],
    finance: ['การเงินคนรถ', 'เบิกเงิน ค่าใช้จ่าย ค่าซ่อม และรายการหักเงิน'],
    drivers: ['ทะเบียนคนรถ', 'จัดการคนรถ ทะเบียน และสถานะพร้อมรับงาน'],
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
          {navs
            .filter((n) => !n.private || s.admin)
            .map((n) => (
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
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="sidebar-note-icon">
              <ShieldCheck size={20} />
            </span>
            <strong>{s.admin ? 'พื้นที่สำหรับผู้ดูแล' : 'เปิดดูได้ ไม่ต้องล็อกอิน'}</strong>
            <p>
              {s.admin
                ? 'จัดการข้อมูลการเดินรถและการเงินของคุณได้ครบในที่เดียว'
                : 'ติดตามคิวและเส้นทางประจำวันได้ทุกที่ ทุกเวลา'}
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
            <span className="connection-status">
              <span className={`live-dot ${!s.online ? 'offline' : ''}`} />
              {s.demo ? 'โหมดตัวอย่าง' : s.online ? 'อัปเดตอัตโนมัติ' : 'ออฟไลน์'}
            </span>
            {s.admin ? (
              <button
                className="profile-chip"
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
                  ผู้ดูแลระบบ<small>{s.demo ? 'ออกจากโหมดผู้ดูแล' : s.email}</small>
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
          <div className="page-heading">
            <div>
              <div className="eyebrow">{s.admin ? 'FLEET WORKSPACE' : 'LIVE FLEET BOARD'}</div>
              <h1>{headerTitles[page][0]}</h1>
              <p>{headerTitles[page][1]}</p>
            </div>
            <div className="heading-actions">
              {['dashboard', 'jobs'].includes(page) && dateControl()}
              {s.admin && page !== 'dashboard' && (
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
          {s.loading ? (
            <div className="loading-state">
              <span className="loading-bar" />
              <p>กำลังโหลดคิวและงานวิ่ง…</p>
            </div>
          ) : (
            <>
              {page === 'dashboard' && (
                <>
                  <section className="welcome-banner">
                    <div>
                      <span className="banner-kicker">
                        <span className="live-dot" /> พร้อมสำหรับทุกเส้นทาง
                      </span>
                      <h2>
                        คิวชัด งานเดิน
                        <br className="mobile-only" /> ทุกเที่ยวเป็นระบบ<span>.</span>
                      </h2>
                      <p>
                        เช็กคิวรถและเส้นทางวันนี้ได้ในพริบตา
                        <br />
                        ให้ทุกการเดินทาง เริ่มต้นอย่างราบรื่น
                      </p>
                      <button className="banner-link" onClick={() => navigate('queue')}>
                        ดูคิวรถทั้งหมด <ArrowRight size={17} />
                      </button>
                    </div>
                    <MapArt />
                  </section>
                  <div className="stats-grid overview-stats" aria-label="สรุปคิวและงานวิ่ง">
                    {summary.map((x) => (
                      <button
                        className={`stat-card stat-${x.color}`}
                        key={x.label}
                        aria-label={`${x.label} ${x.value} ${x.unit} · ${x.detail}`}
                        onClick={() => navigate(x.page, x.filter)}
                      >
                        <div className="stat-top">
                          <span>{x.label}</span>
                          <span className={`stat-icon ${x.color}`}>
                            <x.icon size={19} />
                          </span>
                        </div>
                        <div className="stat-value">
                          {x.value}
                          <span>{x.unit}</span>
                        </div>
                        <small>{x.detail}</small>
                      </button>
                    ))}
                  </div>
                  <div className="dashboard-grid">
                    <section className="panel queue-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            <ClipboardList size={19} />
                            คิวรถตอนนี้ <span className="count">{queue.length}</span>
                          </h2>
                          <p>ลำดับแรกพร้อมรับงานถัดไป</p>
                        </div>
                        {s.admin ? (
                          <button className="btn primary small queue-add" onClick={newQueue}>
                            <Plus size={16} /> ลงคิว
                          </button>
                        ) : (
                          <span className="live-pill">
                            <Radio size={13} /> อัปเดตสด
                          </span>
                        )}
                      </div>
                      {queueContent(true)}
                      <div className="panel-footer">
                        <button className="text-btn" onClick={() => navigate('queue')}>
                          {queue.length > 4
                            ? `ดูคิวทั้งหมด ${queue.length} คัน · อีก ${queue.length - 4} คัน`
                            : s.admin
                              ? 'จัดการคิวทั้งหมด'
                              : 'ดูคิวทั้งหมด'}
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    </section>
                    <section className="daily-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            {s.day === today() ? 'งานวิ่งวันนี้' : 'งานวิ่งวันที่เลือก'}
                            <span className="count">{dayJobs.length}</span>
                          </h2>
                          <p>
                            {dateLabel(s.day)} · {destinationCount} จังหวัด
                          </p>
                        </div>
                        <button
                          className="icon-btn"
                          aria-label="ดูงานวิ่งทั้งหมด"
                          onClick={() => navigate('jobs')}
                        >
                          <ArrowUpRight size={20} />
                        </button>
                      </div>
                      <div className="daily-jobs">
                        {dayJobs.slice(0, 3).map(jobCard)}
                        {!dayJobs.length && (
                          <Empty
                            title={
                              s.day === today() ? 'ยังไม่มีงานวันนี้' : 'ยังไม่มีงานในวันที่เลือก'
                            }
                            detail="งานและเส้นทางจะแสดงเมื่อมีการจ่ายงาน"
                          />
                        )}
                      </div>
                      {dayJobs.length > 0 && (
                        <button className="all-jobs" onClick={() => navigate('jobs')}>
                          ดูงานวิ่งทั้งหมด <ArrowRight size={15} />
                        </button>
                      )}
                    </section>
                  </div>
                  <section className="bottom-info">
                    <span>
                      <span className="info-icon">
                        <MapPin size={21} />
                      </span>
                      <span>
                        <strong>เที่ยวเดียว ไปได้หลายจังหวัด</strong>
                        <small>ดูจุดส่งและจังหวัดพ่วงตามลำดับเส้นทางได้ในรายละเอียดงาน</small>
                      </span>
                    </span>
                    <button className="text-btn" onClick={() => navigate('jobs')}>
                      เปิดตารางงาน <ArrowRight size={16} />
                    </button>
                  </section>
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
                    รถที่จ่ายงานแล้วจะออกจากคิวอัตโนมัติ เมื่อจบงาน ผู้ดูแลสามารถลงคิวรอบใหม่ได้
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
              {page === 'finance' && s.admin && (
                <>
                  <div className="finance-top">
                    <label className="month-control">
                      <CalendarDays size={18} />
                      เดือนที่แสดง
                      <input
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
                  <div className="stats-grid finance-stats">
                    {Object.entries(kinds).map(([k, v], i) => {
                      const amount = entries
                        .filter((e) => e.kind === k && e.status === 'paid')
                        .reduce((a, e) => a + e.amount, 0)
                      const icons = [ArrowUpRight, ReceiptText, Wrench, ArrowDownLeft]
                      const Icon = icons[i]
                      return (
                        <div className="stat-card" key={k}>
                          <div className="stat-top">
                            <span>{v}</span>
                            <span
                              className={`stat-icon ${['green', 'blue', 'orange', 'purple'][i]}`}
                            >
                              <Icon size={18} />
                            </span>
                          </div>
                          <div className="stat-value">
                            <span className="currency">฿</span>
                            {money(amount)}
                          </div>
                          <small>เฉพาะรายการที่ดำเนินการแล้ว</small>
                        </div>
                      )
                    })}
                  </div>
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
                        detail="เพิ่มรายการเบิกเงิน ค่าซ่อม หรือหักเงิน พร้อมแนบหลักฐาน"
                        action={
                          <button className="btn primary small" onClick={newEntry}>
                            <Plus size={16} />
                            เพิ่มรายการ
                          </button>
                        }
                      />
                    )}
                  </section>
                  <Hint>
                    การกด “บันทึกจ่ายแล้ว” เป็นการบันทึกบัญชี ไม่มีการโอนเงินผ่านระบบ
                    ยอดสรุปแยกตามประเภทและเดือนที่เลือก
                  </Hint>
                </>
              )}
              {page === 'drivers' && s.admin && (
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
                        const inQueue = queue.some((q) => q.id === d.id)
                        return (
                          <article className="driver-card" key={d.id}>
                            <div className="driver-card-top">
                              <Avatar name={d.name} index={i} />
                              <button
                                className="icon-btn"
                                aria-label={`แก้ไข ${d.name}`}
                                onClick={() => setDialog({ type: 'driver', driver: d })}
                              >
                                <MoreHorizontal size={21} />
                              </button>
                            </div>
                            <h3>{d.name}</h3>
                            <p>
                              <span className="plate">{d.plate}</span> {d.truckType}
                            </p>
                            <div className="driver-phone">{d.phone || 'ยังไม่ระบุเบอร์โทร'}</div>
                            <div className="driver-card-bottom">
                              <Badge
                                state={
                                  !d.active
                                    ? 'cancelled'
                                    : d.activeJobId
                                      ? 'running'
                                      : inQueue
                                        ? 'scheduled'
                                        : 'completed'
                                }
                              >
                                {!d.active
                                  ? 'ปิดใช้งาน'
                                  : d.activeJobId
                                    ? 'มีงานที่ยังไม่จบ'
                                    : inQueue
                                      ? 'อยู่ในคิว'
                                      : 'พร้อมรับงาน'}
                              </Badge>
                              {d.active && !d.activeJobId && !inQueue && (
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
                        title="เริ่มจากเพิ่มคนรถคนแรก"
                        detail="ระบุชื่อ ทะเบียน และประเภทรถ เพื่อพร้อมลงคิว"
                        action={
                          <button
                            className="btn primary"
                            onClick={() => setDialog({ type: 'driver' })}
                          >
                            <Plus size={17} />
                            เพิ่มคนรถ
                          </button>
                        }
                      />
                    </div>
                  )}
                </>
              )}
              {page === 'activity' && s.admin && (
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
            <span>คิวรถ · จัดการง่าย ไปได้ทุกเส้นทาง</span>
            <div>
              {s.admin && (
                <button className="text-btn" onClick={() => navigate('activity')}>
                  ประวัติกิจกรรม
                </button>
              )}
              <span>
                <ShieldCheck size={13} />
                {s.admin ? 'ผู้ดูแลระบบ' : 'Guest · ดูได้ทันที'}
              </span>
            </div>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="เมนูมือถือ">
        {navs
          .filter((n) => !n.private || s.admin)
          .map((n) => (
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
          title={
            dialog.type === 'login'
              ? 'เข้าสู่ระบบ'
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
          {dialog.type === 'queue' && (
            <QueueForm onDone={done} onAddDriver={() => setDialog({ type: 'driver' })} />
          )}
          {dialog.type === 'driver' && <DriverForm driver={dialog.driver} onDone={done} />}
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
                  <small>นำรถออกจากคิว พร้อมระบุเหตุผล</small>
                </span>
                <ChevronRight size={17} />
              </button>
            </div>
          )}
          {dialog.type === 'job' && <JobForm item={dialog.item} onDone={done} />}
          {dialog.type === 'cancel-queue' && <CancelQueueForm item={dialog.item} onDone={done} />}
          {dialog.type === 'entry' && <EntryForm onDone={done} />}
          {dialog.type === 'confirm' && (
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
              entry={s.data.entries.find((e) => e.id === dialog.entry.id) || dialog.entry}
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
                เปิดเว็บแล้วดูคิวปัจจุบันได้ทันที เลือกเมนูงานวิ่งเพื่อดูวันที่ เส้นทาง
                และจังหวัดพ่วง โดยไม่ต้องล็อกอิน
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
function JobDetail({ job, onAction }: { job: Job; onAction: (s: Job['status']) => void }) {
  const s = useStore()
  return (
    <div className="form detail">
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
}: {
  entry: Entry
  onAction: (s: Entry['status']) => void
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
      <dl>
        <div>
          <dt>คนรถ</dt>
          <dd>{entry.driverName}</dd>
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
      {entry.status !== 'void' && (
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
