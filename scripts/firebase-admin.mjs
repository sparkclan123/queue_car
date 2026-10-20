// Uses the already signed-in Firebase CLI account. Never writes credentials.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const cliAuth = require('firebase-tools/lib/auth.js')
const project = 'queue-car-sparkclan'
const account = cliAuth.getGlobalDefaultAccount()
if (!account) throw new Error('Run firebase login first')
const token = await cliAuth.getAccessToken(account.tokens.refresh_token, [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/firebase',
])
const headers = {
  Authorization: `Bearer ${token.access_token}`,
  'Content-Type': 'application/json',
  'x-goog-user-project': project,
}
async function api(url, method = 'GET', body) {
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const result = await r.json()
  if (!r.ok)
    throw new Error(`${method} ${new URL(url).pathname}: ${r.status} ${result.error?.message}`)
  return result
}
const action = process.argv[2]
if (action === 'inspect') {
  const p = await api(`https://firebase.googleapis.com/v1beta1/projects/${project}`)
  console.log({ projectId: p.projectId, projectNumber: p.projectNumber })
  for (const [name, url] of Object.entries({
    auth: `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`,
    google: `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs/google.com`,
  }))
    try {
      const r = await api(url)
      console.log(
        name,
        name === 'google'
          ? { enabled: r.enabled, hasClientId: !!r.clientId }
          : name === 'auth'
            ? { authorizedDomains: r.authorizedDomains }
            : r,
      )
    } catch (e) {
      console.log(e.message)
    }
}
if (action === 'seed-admin') {
  const r = await api(
    `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/admins/porthachapong%40gmail.com`,
    'PATCH',
    { fields: { active: { booleanValue: true }, role: { stringValue: 'owner' } } },
  )
  console.log('Admin configured:', r.name)
}
