import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import type { Timestamp } from 'firebase/firestore'
import { Check, Search, ShieldCheck, UserPlus } from 'lucide-react'
import { db, errorMessage } from '../lib/firebase'
import { changeMemberRole, memberEmail, OWNER_EMAIL } from '../lib/members'
import type { Member } from '../lib/members'
import { useStore } from '../lib/store'
import { Modal } from './ui'

type RoleAudit = { id: string; email: string; active: boolean; createdAt?: Timestamp }
const demoMembers: Member[] = [
  { email: OWNER_EMAIL, name: 'ผู้ดูแลหลัก', active: true, joined: true },
  { email: 'office@example.com', name: 'ฝ่ายจัดรถ (ตัวอย่าง)', active: true, joined: true },
  { email: 'viewer@example.com', name: 'สมาชิก (ตัวอย่าง)', active: false, joined: true },
]

export function MembersPanel() {
  const s = useStore()
  const [profiles, setProfiles] = useState<{ email: string; name: string }[]>([])
  const [roles, setRoles] = useState<{ email: string; active: boolean }[]>([])
  const [demoRows, setDemoRows] = useState(demoMembers)
  const [audits, setAudits] = useState<RoleAudit[]>([])
  const [loading, setLoading] = useState(!s.demo)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState<{ email: string; active: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')
  useEffect(() => {
    if (!s.owner || s.demo || !db) return
    const ready = new Set<string>()
    const loaded = (key: string) => {
      ready.add(key)
      if (ready.size === 2) setLoading(false)
    }
    const fail = (e: unknown) => {
      setLoadError(errorMessage(e))
      setLoading(false)
    }
    const stop = [
      onSnapshot(
        collection(db, 'members'),
        (snapshot) => {
          setProfiles(snapshot.docs.map((d) => d.data() as { email: string; name: string }))
          loaded('members')
        },
        fail,
      ),
      onSnapshot(
        collection(db, 'admins'),
        (snapshot) => {
          setRoles(snapshot.docs.map((d) => ({ email: d.id, active: d.data().active === true })))
          loaded('roles')
        },
        fail,
      ),
      onSnapshot(
        query(collection(db, 'memberAudits'), orderBy('createdAt', 'desc'), limit(20)),
        (snapshot) => {
          setAudits(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as RoleAudit))
        },
        fail,
      ),
    ]
    return () => stop.forEach((unsubscribe) => unsubscribe())
  }, [s.owner, s.demo])
  const members = useMemo(() => {
    if (s.demo) return demoRows
    const rows = new Map<string, Member>()
    for (const p of profiles) rows.set(p.email, { ...p, active: false, joined: true })
    for (const r of roles)
      rows.set(r.email, {
        email: r.email,
        name: '',
        joined: false,
        ...rows.get(r.email),
        active: r.active,
      })
    rows.set(OWNER_EMAIL, { email: OWNER_EMAIL, name: 'ผู้ดูแลหลัก', active: true, joined: true })
    return [...rows.values()].sort(
      (a, b) =>
        Number(b.email === OWNER_EMAIL) - Number(a.email === OWNER_EMAIL) ||
        Number(b.active) - Number(a.active) ||
        a.email.localeCompare(b.email),
    )
  }, [s.demo, demoRows, profiles, roles])
  const filtered = members.filter((m) =>
    `${m.name} ${m.email}`.toLowerCase().includes(search.trim().toLowerCase()),
  )
  if (!s.owner) return null
  function propose(value: string, active: boolean) {
    setError('')
    setSaved('')
    try {
      const normalized = memberEmail(value)
      if (normalized === OWNER_EMAIL) throw new Error('เปลี่ยนสิทธิ์ของผู้ดูแลหลักไม่ได้')
      if (active && members.some((m) => m.email === normalized && m.active))
        throw new Error('บัญชีนี้เป็นผู้ดูแลอยู่แล้ว')
      setPending({ email: normalized, active })
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  async function save() {
    if (!pending || busy) return
    setBusy(true)
    setError('')
    try {
      if (!s.online && !s.demo) throw new Error('กรุณาเชื่อมต่ออินเทอร์เน็ตก่อนเปลี่ยนสิทธิ์')
      if (s.demo) {
        setDemoRows((rows) =>
          rows.some((r) => r.email === pending.email)
            ? rows.map((r) => (r.email === pending.email ? { ...r, active: pending.active } : r))
            : [...rows, { ...pending, name: '', joined: false }],
        )
      } else {
        await changeMemberRole(db!, pending.email, pending.active, s.email)
      }
      setSaved(
        `${pending.active ? 'แต่งตั้งผู้ดูแลแล้ว' : 'ถอดสิทธิ์ผู้ดูแลแล้ว'} · ${pending.email}`,
      )
      setPending(null)
      setEmail('')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="members-panel">
      <div className="member-owner-note">
        <ShieldCheck size={19} />
        <p>
          <strong>เฉพาะผู้ดูแลหลักจัดการสิทธิ์ได้</strong>
          <span>ผู้ดูแลจัดการคิว งานวิ่ง และการเงินได้ สมาชิกทั่วไปดูข้อมูลได้อย่างเดียว</span>
        </p>
      </div>
      <form
        className="member-invite"
        onSubmit={(e) => {
          e.preventDefault()
          propose(email, true)
        }}
      >
        <label>
          เพิ่มผู้ดูแลด้วยอีเมล Google
          <input
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            required
            maxLength={254}
            placeholder="name@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button className="btn primary" type="submit" disabled={busy || loading || !!loadError}>
          <UserPlus size={17} />
          เพิ่มผู้ดูแล
        </button>
        <p>เพิ่มอีเมลไว้ก่อนได้ ผู้ใช้จะได้รับสิทธิ์เมื่อเข้าสู่ระบบด้วยอีเมลนี้</p>
      </form>
      {error && !pending && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="member-success" role="status">
          <Check size={17} />
          {saved}
        </p>
      )}
      <div className="member-list-heading">
        <h2>
          สมาชิก <span>{members.length}</span>
        </h2>
        <span>ผู้ดูแล {members.filter((m) => m.active).length} คน</span>
      </div>
      <label className="report-search member-search">
        <Search size={16} />
        <input
          aria-label="ค้นหาสมาชิก"
          placeholder="ค้นหาชื่อ / อีเมล"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {loading ? (
        <p className="report-state" role="status">
          กำลังโหลดสมาชิก…
        </p>
      ) : loadError ? (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      ) : (
        <div className="member-list">
          {filtered.map((m) => (
            <article className="member-row" key={m.email}>
              <div className="member-identity">
                <strong>{m.name || 'บัญชี Google'}</strong>
                <span>{m.email}</span>
                <small>
                  {m.email === OWNER_EMAIL
                    ? 'ผู้ดูแลหลัก · เปลี่ยนสิทธิ์ไม่ได้'
                    : m.active
                      ? 'ผู้ดูแลระบบ'
                      : 'สมาชิก · ดูอย่างเดียว'}
                  {!m.joined && ' · รอเข้าใช้ครั้งแรก'}
                </small>
              </div>
              {m.email !== OWNER_EMAIL && (
                <button
                  className={`btn small ${m.active ? 'secondary' : 'primary'}`}
                  onClick={() => propose(m.email, !m.active)}
                  disabled={busy}
                >
                  {m.active ? 'ถอดสิทธิ์' : 'ตั้งเป็นผู้ดูแล'}
                </button>
              )}
            </article>
          ))}
          {!filtered.length && <p className="report-empty">ไม่พบสมาชิกที่ตรงกับคำค้น</p>}
        </div>
      )}
      <p className="table-footnote">
        สมาชิกที่เข้าสู่ระบบ Google จะแสดงที่นี่อัตโนมัติ ผู้ชมที่ไม่ได้ล็อกอินไม่มีรายชื่อสมาชิก
      </p>
      {!!audits.length && (
        <details className="member-history">
          <summary>ประวัติเปลี่ยนสิทธิ์ล่าสุด</summary>
          {audits.map((a) => (
            <p key={a.id}>
              <strong>{a.active ? 'แต่งตั้งผู้ดูแล' : 'ถอดสิทธิ์ผู้ดูแล'}</strong>
              <span>{a.email}</span>
              <small>
                {a.createdAt?.toDate &&
                  new Intl.DateTimeFormat('th-TH', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'Asia/Bangkok',
                  }).format(a.createdAt.toDate())}
              </small>
            </p>
          ))}
        </details>
      )}
      {pending && (
        <Modal
          title={pending.active ? 'แต่งตั้งผู้ดูแล' : 'ถอดสิทธิ์ผู้ดูแล'}
          onClose={() => {
            if (!busy) {
              setPending(null)
              setError('')
            }
          }}
        >
          <div className="form member-confirm">
            <strong>{pending.email}</strong>
            <p>
              {pending.active
                ? 'บัญชีนี้จะเพิ่มและแก้ไขคิว คนรถ งานวิ่ง และการเงินได้ แต่จัดการสิทธิ์สมาชิกไม่ได้'
                : 'บัญชีนี้จะเหลือสิทธิ์ดูข้อมูล การเพิ่มและแก้ไขจะถูกปิดทันทีเมื่อบันทึก'}
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary" disabled={busy} onClick={() => void save()}>
              {busy ? 'กำลังบันทึก…' : 'ยืนยันเปลี่ยนสิทธิ์'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
