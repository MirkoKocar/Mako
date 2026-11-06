// Utilidades compartidas por las funciones de Netlify (corren en el servidor).
const crypto = require('crypto')
const { GoogleAuth } = require('google-auth-library')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) }
}

// Cliente con privilegios totales (service_role). SOLO en servidor.
function adminClient() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en Netlify')
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Cliente que actúa COMO la persona que hizo el pedido: respeta todas las
// reglas de seguridad (RLS). Si la persona no puede ver algo, acá tampoco.
function userClient(jwt) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function getJwt(event) {
  const h = event.headers['authorization'] || event.headers['Authorization'] || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

async function getUser(event) {
  const jwt = getJwt(event)
  if (!jwt || !SUPABASE_URL || !ANON_KEY) return null
  const { data, error } = await userClient(jwt).auth.getUser(jwt)
  if (error || !data?.user) return null
  return { jwt, user: data.user }
}

function sha256(txt) { return crypto.createHash('sha256').update(txt).digest('hex') }
function nuevoToken() { return crypto.randomBytes(32).toString('base64url') }

function baseUrl() {
  return (process.env.SITE_URL || process.env.URL || '').replace(/\/$/, '')
}

// ---------------- Push (Firebase) ----------------
function getServiceAccount() {
  const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_PRIVATE_KEY_ID', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_CLIENT_ID']
  const missing = required.filter(k => !process.env[k])
  if (missing.length) throw new Error(`Faltan variables de entorno en Netlify: ${missing.join(', ')}`)
  return {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    token_uri: 'https://oauth2.googleapis.com/token',
  }
}

async function getFCMAccessToken() {
  const auth = new GoogleAuth({ credentials: getServiceAccount(), scopes: ['https://www.googleapis.com/auth/firebase.messaging'] })
  const client = await auth.getClient()
  return (await client.getAccessToken()).token
}

async function sendPushTokens(tokens, title, body, data = {}, link = '/') {
  if (!tokens?.length) return { sent: 0, failed: 0 }
  const accessToken = await getFCMAccessToken()
  const results = await Promise.allSettled(tokens.map(async (t) => {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: {
        token: t, notification: { title, body },
        webpush: { notification: { title, body, icon: '/icon-192.png', badge: '/icon-192.png' }, fcm_options: { link } },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      } }),
    })
    if (!res.ok && (res.status === 404 || res.status === 400)) return 'dead'   // token vencido
    return res.ok
  }))
  const dead = tokens.filter((_, i) => results[i].status === 'fulfilled' && results[i].value === 'dead')
  const ok = results.filter(r => r.status === 'fulfilled' && r.value === true).length
  return { sent: ok, failed: results.length - ok, dead }
}

// ---------------- WhatsApp (Meta Cloud API) ----------------
// Plantilla con 1 variable {{1}} = link (WHATSAPP_TEMPLATE_LINK_NAME).
// Sin link, se usa la plantilla simple de "tenés una novedad" (WHATSAPP_TEMPLATE_NAME).
async function sendWhatsapp(numero, link) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID, token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneId || !token || !numero) return { sent: false, motivo: 'whatsapp sin configurar o sin número' }
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'es_AR'
  const conLink = link && process.env.WHATSAPP_TEMPLATE_LINK_NAME
  const template = conLink
    ? { name: process.env.WHATSAPP_TEMPLATE_LINK_NAME, language: { code: lang },
        components: [{ type: 'body', parameters: [{ type: 'text', text: link }] }] }
    : { name: process.env.WHATSAPP_TEMPLATE_NAME || 'aviso_fixhub', language: { code: lang } }
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: String(numero).replace(/\D/g, ''), type: 'template', template }),
    })
    return { sent: res.ok }
  } catch (e) { return { sent: false } }
}

module.exports = { json, adminClient, userClient, getJwt, getUser, sha256, nuevoToken, baseUrl, sendPushTokens, sendWhatsapp }
