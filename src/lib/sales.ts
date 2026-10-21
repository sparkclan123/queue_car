import { collection, doc, runTransaction } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'

export type SalesContact = {
  id: string
  name: string
  phone: string
  details: string
  createdAt: number
  updatedAt: number
}
export type SalesContactInput = Pick<SalesContact, 'name' | 'phone' | 'details'>

export function normalizeThaiPhone(input: string) {
  let value = input.trim().replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - 3664))
  if (!/^\+?[\d\s().-]+$/.test(value)) return null
  value = value.replace(/[\s().-]/g, '')
  if (value.startsWith('+66')) value = '0' + value.slice(3)
  return /^0[1-9]\d{7,8}$/.test(value) ? value : null
}

export function formatThaiPhone(phone: string) {
  const split = phone.length === 9 ? 2 : 3
  return `${phone.slice(0, split)}-${phone.slice(split, split + 3)}-${phone.slice(split + 3)}`
}

export function validateSalesContact(input: SalesContactInput): SalesContactInput {
  const name = input.name.trim(),
    details = input.details.trim()
  if (!name || name.length > 100) throw new Error('กรุณาระบุชื่อเซลล์ ไม่เกิน 100 ตัวอักษร')
  const phone = normalizeThaiPhone(input.phone)
  if (!phone)
    throw new Error('กรุณาระบุเบอร์โทรไทย 9–10 หลัก เช่น 081-234-5678 หรือ +66 81 234 5678')
  if (details.length > 2000) throw new Error('รายละเอียดต้องไม่เกิน 2,000 ตัวอักษร')
  return { name, phone, details }
}

export async function saveSalesContact(
  db: Firestore,
  input: SalesContactInput,
  actor: string,
  id?: string,
) {
  const value = validateSalesContact(input)
  const ref = id ? doc(db, 'salesContacts', id) : doc(collection(db, 'salesContacts'))
  const auditRef = doc(collection(db, 'audits'))
  await runTransaction(db, async (tx) => {
    const current = await tx.get(ref)
    if (id && !current.exists()) throw new Error('ไม่พบข้อมูลเซลล์นี้ กรุณาเปิดรายการใหม่')
    const now = Date.now()
    tx.set(ref, { ...value, createdAt: current.data()?.createdAt ?? now, updatedAt: now })
    tx.set(auditRef, {
      action: id ? 'แก้ไขเซลล์' : 'เพิ่มเซลล์',
      detail: value.name,
      actor,
      createdAt: now,
    })
  })
  return ref.id
}
