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

// ---------------- telefono (fusionado) ----------------
// Teléfonos argentinos -> E.164 con el 9 de los celulares: +549 + área + número (10 dígitos después del 549).
// Acepta: "11 2233-4455", "011 15 2233 4455", "+54 9 11 2233 4455", "5411...", "549 11...", "(0221) 15-555-1234", etc.
// Devuelve null si no se puede interpretar como un celular argentino.
function normalizarTelefonoAR(entrada) {
  let d = String(entrada ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('54')) {
    d = d.slice(2)
    if (d.startsWith('9')) d = d.slice(1)
  }
  if (d.startsWith('0')) d = d.slice(1)               // 0 del prefijo interurbano
  if (d.length === 12) {                              // sobra el "15" del celular: área (2 a 4 dígitos) + 15 + número
    for (const largoArea of [2, 3, 4]) {
      if (d.slice(largoArea, largoArea + 2) === '15') {
        const sin = d.slice(0, largoArea) + d.slice(largoArea + 2)
        if (sin.length === 10) { d = sin; break }
      }
    }
  }
  if (d.length !== 10 || !/^[1-3]/.test(d)) return null   // los códigos de área argentinos empiezan con 1, 2 o 3
  return '549' + d                                    // sin el "+": se guarda así en la base; el driver le agrega el "+"
}

const aE164 = (n) => { const t = normalizarTelefonoAR(n); return t ? '+' + t : null }

// ---------------- contacto (fusionado) ----------------
// ¿El texto tiene un teléfono (8+ dígitos), un email o un link?
// MISMA lógica que la función SQL fh_contiene_contacto (supabase.sql, parte 5): la base es la que decide de verdad;
// esta copia sirve para avisarle enseguida a la persona y para los textos que arma el servidor.
const EMAIL = /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9.-]+\.[a-z]{2,}/
const LINK = /(https?:\/\/|www\.|wa\.me|t\.me\/|bit\.ly|(^|[^a-z0-9-])[a-z0-9-]{2,}\.(com\.ar|gob\.ar|com|net|org|io|app|link|ly)([^a-z0-9]|$))/
const TELEFONO = /\+?[0-9]([ ().-]?[0-9]){7,}/

function contieneContacto(txt) {
  const v = String(txt ?? '').toLowerCase()
  return EMAIL.test(v) || LINK.test(v) || TELEFONO.test(v)
}

// Para textos que van a un WhatsApp: saca los datos de contacto en vez de bloquear todo el texto
function quitarContacto(txt) {
  return String(txt ?? '')
    .replace(/[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9.-]+\.[a-z]{2,}/gi, '')
    .replace(/(https?:\/\/\S+|www\.\S+|wa\.me\S*|t\.me\/\S*|bit\.ly\S*)/gi, '')
    .replace(/\+?[0-9]([ ().-]?[0-9]){7,}/g, '')
    .replace(/\s{2,}/g, ' ').trim()
}

const MENSAJE_BLOQUEO = 'Por seguridad, los datos de contacto los coordina el administrador'

// ---------------- tokens (fusionado) ----------------
// Tokens de los links del proveedor.
//  - 256 bits de azar (32 bytes) por trabajo y proveedor.
//  - En la base se guarda el HASH (SHA-256) para validar y el token CIFRADO (AES-256-GCM, clave LINK_ENC_KEY)
//    solo para poder reenviar el MISMO link en avisos posteriores.
//  - El token NUNCA se escribe en logs (ni acá ni en las funciones que lo usan).
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/       // 32 bytes en base64url = 43 caracteres

function nuevoTokenLink() { return crypto.randomBytes(32).toString('base64url') }
function tokenValido(t) { return typeof t === 'string' && TOKEN_RE.test(t) }
function hashToken(t) { return crypto.createHash('sha256').update(String(t)).digest('hex') }

// La clave puede venir en base64 o en hex (64 caracteres). Tiene que ser de 32 bytes.
function claveCifrado() {
  const raw = (process.env.LINK_ENC_KEY || '').trim()
  if (!raw) return null
  let buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  return buf.length === 32 ? buf : null
}

// Devuelve el texto a guardar, o null si no hay clave (el link igual funciona, pero no se podrá reenviar el mismo)
function cifrarToken(token, hash) {
  const key = claveCifrado()
  if (!key) return null
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(Buffer.from(hash, 'utf8'))        // atado a esta fila: no se puede copiar el cifrado a otra
  const ct = Buffer.concat([c.update(token, 'utf8'), c.final()])
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.')
}

function descifrarToken(guardado, hash) {
  try {
    const key = claveCifrado()
    if (!key || !guardado) return null
    const [v, iv, tag, ct] = String(guardado).split('.')
    if (v !== 'v1') return null
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
    d.setAAD(Buffer.from(hash, 'utf8'))
    d.setAuthTag(Buffer.from(tag, 'base64url'))
    const token = Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8')
    return tokenValido(token) && hashToken(token) === hash ? token : null
  } catch { return null }
}

// La IP nunca se guarda en claro: se guarda un HMAC con la clave del servidor
function hashIp(ip) {
  const sal = process.env.LINK_ENC_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'sin-sal'
  return crypto.createHmac('sha256', sal).update(String(ip || 'x')).digest('hex').slice(0, 40)
}

// ---------------- push (fusionado) ----------------
// Avisos push (Firebase) a usuarios registrados. Antes vivía dentro de notificar.js.
async function tokensDe(admin, filtro) {
  let q = admin.from('fcm_tokens').select('token')
  for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v)
  const { data } = await q.limit(50)
  return (data || []).map(t => t.token)
}

async function avisar(admin, filtro, title, body, data) {
  const tokens = await tokensDe(admin, filtro)
  if (!tokens.length) return
  const r = await sendPushTokens(tokens, title, body, data).catch(() => null)
  if (r?.dead?.length) await admin.from('fcm_tokens').delete().in('token', r.dead)
}

const avisarAdmins = (admin, edificioId, title, body, data = {}) => avisar(admin, { edificio_id: edificioId, rol: 'admin' }, title, body, data)

// ---------------- twilio-webhook (fusionado) ----------------
// Validación de la firma X-Twilio-Signature (con la librería oficial) y lectura del cuerpo de los webhooks de Twilio.
function leerParametros(event) {
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '')
  return Object.fromEntries(new URLSearchParams(raw))
}

// La firma se calcula con la URL EXACTA que se cargó en la consola de Twilio (SITE_URL + ruta de la función)
function firmaValida(event, params, nombreFuncion) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const firma = event.headers?.['x-twilio-signature'] || event.headers?.['X-Twilio-Signature']
  if (!authToken || !firma) return false
  const twilio = require('twilio')
  const host = event.headers?.['x-forwarded-host'] || event.headers?.host
  const candidatas = [
    `${baseUrl()}/.netlify/functions/${nombreFuncion}`,
    event.rawUrl,
    host ? `https://${host}/.netlify/functions/${nombreFuncion}` : null,
  ].filter(Boolean)
  return candidatas.some(u => { try { return twilio.validateRequest(authToken, firma, u, params) } catch { return false } })
}

module.exports = { json, adminClient, userClient, getJwt, getUser, sha256, nuevoToken, baseUrl, sendPushTokens, sendWhatsapp, normalizarTelefonoAR, aE164, contieneContacto, quitarContacto, MENSAJE_BLOQUEO, nuevoTokenLink, tokenValido, hashToken, cifrarToken, descifrarToken, hashIp, claveCifrado, tokensDe, avisar, avisarAdmins, leerParametros, firmaValida }
