import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'

export const OWNER_EMAIL = 'porthachapong@gmail.com'
export type Member = { email: string; name: string; active: boolean; joined: boolean }

export function memberEmail(value: string) {
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email))
    throw new Error('กรุณาระบุอีเมล Google ให้ถูกต้อง')
  return email
}

export async function changeMemberRole(
  db: Firestore,
  input: string,
  active: boolean,
  actor: string,
) {
  const email = memberEmail(input)
  if (actor.toLowerCase() !== OWNER_EMAIL) throw new Error('เฉพาะผู้ดูแลหลักเท่านั้น')
  if (email === OWNER_EMAIL) throw new Error('เปลี่ยนสิทธิ์ของผู้ดูแลหลักไม่ได้')
  const batch = writeBatch(db)
  batch.set(doc(db, 'admins', email), {
    active,
    updatedBy: OWNER_EMAIL,
    updatedAt: serverTimestamp(),
  })
  batch.set(doc(collection(db, 'memberAudits')), {
    email,
    active,
    actor: OWNER_EMAIL,
    createdAt: serverTimestamp(),
  })
  await batch.commit()
}
