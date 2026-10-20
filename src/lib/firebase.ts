import { initializeApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import type { FirebaseOptions } from 'firebase/app'
export const isDemo = new URLSearchParams(location.search).get('demo') === '1'
async function config(): Promise<FirebaseOptions | null> {
  if (isDemo) return null
  try {
    const r = await fetch('/__/firebase/init.json', { signal: AbortSignal.timeout(7000) })
    if (!r.ok) return null
    const c = await r.json()
    return c.projectId && c.apiKey ? c : null
  } catch {
    return null
  }
}
const options = await config()
const app = options ? initializeApp(options) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
export async function login() {
  if (!auth) throw new Error('ยังไม่ได้เชื่อมต่อ Firebase')
  // Keep the redirect flow on Firebase's first-party auth domain for mobile/Safari.
  if (options?.authDomain && location.hostname !== options.authDomain) {
    location.assign(`https://${options.authDomain}/?signin=1`)
    return
  }
  const p = new GoogleAuthProvider()
  p.setCustomParameters({ prompt: 'select_account' })
  await signInWithRedirect(auth, p)
}
let authStartup: Promise<void> | undefined
export function resumeAuth() {
  return (authStartup ??= (async () => {
    if (!auth) return
    await getRedirectResult(auth)
    await auth.authStateReady()
    if (new URLSearchParams(location.search).get('signin') === '1') {
      history.replaceState(null, '', location.pathname)
      if (!auth.currentUser) await login()
    }
  })())
}
export async function logout() {
  if (auth) await signOut(auth)
}
export function errorMessage(e: unknown) {
  const code = (e as { code?: string })?.code
  const messages: Record<string, string> = {
    'permission-denied': 'บัญชีนี้ไม่มีสิทธิ์จัดการ หรือสิทธิ์ถูกเปลี่ยนแล้ว',
    'auth/popup-closed-by-user': 'ปิดหน้าต่างเข้าสู่ระบบแล้ว',
    'auth/popup-blocked': 'กรุณาอนุญาตป๊อปอัปแล้วลองเข้าสู่ระบบอีกครั้ง',
    'auth/unauthorized-domain': 'โดเมนนี้ยังไม่ได้รับอนุญาตให้เข้าสู่ระบบ',
    'auth/operation-not-allowed': 'ยังไม่ได้เปิดใช้ Google Sign-in ใน Firebase',
    'auth/network-request-failed': 'เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต',
    unavailable: 'เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาลองใหม่',
    'resource-exhausted': 'โควตา Firebase เต็มชั่วคราว กรุณาลองใหม่ภายหลัง',
  }
  return (
    (code && messages[code]) || (e instanceof Error ? e.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่')
  )
}
