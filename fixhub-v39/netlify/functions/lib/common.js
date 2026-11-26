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

function adminClient() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en Netlify')
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

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

const baseExports = { json, adminClient, userClient, getJwt, getUser, sha256, nuevoToken, baseUrl, sendPushTokens, sendWhatsapp }
const lib = {}
const cargarTwilio = () => require('twilio')   // require "visible": así Netlify incluye el paquete twilio en la función
function def(nombre, fn) {
  const module = { exports: {} }
  fn(module, (p) => p === './common' ? baseExports : p === 'twilio' ? cargarTwilio() : (p.startsWith('./') ? lib[p.slice(2)] : require(p)))
  lib[nombre] = module.exports
}

def('telefono', (module, require) => {
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

module.exports = { normalizarTelefonoAR, aE164 }
})

def('contacto', (module, require) => {
const EMAIL = /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9.-]+\.[a-z]{2,}/
const LINK = /(https?:\/\/|www\.|wa\.me|t\.me\/|bit\.ly|(^|[^a-z0-9-])[a-z0-9-]{2,}\.(com\.ar|gob\.ar|com|net|org|io|app|link|ly)([^a-z0-9]|$))/
const TELEFONO = /\+?[0-9]([ ().-]?[0-9]){7,}/

function contieneContacto(txt) {
  const v = String(txt ?? '').toLowerCase()
  return EMAIL.test(v) || LINK.test(v) || TELEFONO.test(v)
}

function quitarContacto(txt) {
  return String(txt ?? '')
    .replace(/[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9.-]+\.[a-z]{2,}/gi, '')
    .replace(/(https?:\/\/\S+|www\.\S+|wa\.me\S*|t\.me\/\S*|bit\.ly\S*)/gi, '')
    .replace(/\+?[0-9]([ ().-]?[0-9]){7,}/g, '')
    .replace(/\s{2,}/g, ' ').trim()
}

const MENSAJE_BLOQUEO = 'Por seguridad, los datos de contacto los coordina el administrador'

module.exports = { contieneContacto, quitarContacto, MENSAJE_BLOQUEO }
})

def('tokens', (module, require) => {
const crypto = require('crypto')

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/       // 32 bytes en base64url = 43 caracteres

function nuevoTokenLink() { return crypto.randomBytes(32).toString('base64url') }
function tokenValido(t) { return typeof t === 'string' && TOKEN_RE.test(t) }
function hashToken(t) { return crypto.createHash('sha256').update(String(t)).digest('hex') }

function claveCifrado() {
  const raw = (process.env.LINK_ENC_KEY || '').trim()
  if (!raw) return null
  let buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  return buf.length === 32 ? buf : null
}

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

function hashIp(ip) {
  const sal = process.env.LINK_ENC_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'sin-sal'
  return crypto.createHmac('sha256', sal).update(String(ip || 'x')).digest('hex').slice(0, 40)
}

module.exports = { nuevoTokenLink, tokenValido, hashToken, cifrarToken, descifrarToken, hashIp, claveCifrado }
})

def('push', (module, require) => {
const { sendPushTokens } = require('./common')

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

module.exports = { tokensDe, avisar, avisarAdmins }
})

def('adjuntos', (module, require) => {
const BUCKET = 'adjuntos'
const MAX_MB = 30
const MIMES_PROVEEDOR = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']   // por link: fotos y comprobantes (sin video)
const MAX_SUBIDAS_POR_LINK = 40

const limpiarNombre = (n) => String(n || 'archivo').replace(/[^a-zA-Z0-9.]/g, '_').slice(-60) || 'archivo'
const prefijoDe = (aviso) => `${aviso.edificio_id}/${aviso.id}/`

function rutaPermitida(path, aviso) {
  const p = String(path || '').replace(/^adjuntos:/, '')
  return p.startsWith(prefijoDe(aviso)) && !p.includes('..') && p.length < 300 ? p : null
}

function validarAdjuntosProveedor(lista, aviso) {
  if (lista == null) return { lista: [] }
  if (!Array.isArray(lista) || lista.length > 10) return { error: 'Máximo 10 archivos.' }
  const out = []
  for (const it of lista) {
    const path = rutaPermitida(it?.path, aviso)
    if (!path) return { error: 'Archivo inválido.' }
    if (!MIMES_PROVEEDOR.includes(String(it?.tipo || ''))) return { error: 'Tipo de archivo no permitido.' }
    out.push({ path, tipo: it.tipo, nombre: String(it?.nombre || '').slice(0, 80), size: Math.max(0, Math.min(Number(it?.size) || 0, MAX_MB * 1048576)) })
  }
  return { lista: out }
}

async function firmar(admin, paths, segundos = 600) {
  const unicos = [...new Set(paths.filter(Boolean))].slice(0, 60)
  if (!unicos.length) return {}
  const { data } = await admin.storage.from(BUCKET).createSignedUrls(unicos, segundos)
  const out = {}
  for (const r of data || []) if (r?.signedUrl && r.path) out[r.path] = r.signedUrl
  return out
}

module.exports = { BUCKET, MAX_MB, MIMES_PROVEEDOR, MAX_SUBIDAS_POR_LINK, limpiarNombre, prefijoDe, rutaPermitida, validarAdjuntosProveedor, firmar }
})

lib['plantillas.json'] = {
  "footer": "Respondé BAJA para no recibir más avisos",
  "plantillas": {
    "trabajo_nuevo": {
      "texto": "Hola {{1}}, tenés un trabajo nuevo de {{2}} en {{3}}, depto {{4}}. Urgencia: {{5}}. Problema: {{6}}. Tocá el botón para aceptarlo, pedir presupuesto o avisar si no podés.",
      "variables": 6,
      "boton": "Ver trabajo",
      "env": "TWILIO_CONTENT_SID_TRABAJO_NUEVO"
    },
    "mensaje_nuevo": {
      "texto": "Hola {{1}}, {{2}} te escribió por el trabajo '{{3}}': {{4}}. Tocá el botón para responder.",
      "variables": 4,
      "boton": "Responder",
      "env": "TWILIO_CONTENT_SID_MENSAJE_NUEVO"
    },
    "acuerdo_novedad": {
      "texto": "Hola {{1}}, hay novedades en el acuerdo del trabajo '{{2}}': {{3}}. Entrá para verlo.",
      "variables": 3,
      "boton": "Ver acuerdo",
      "env": "TWILIO_CONTENT_SID_ACUERDO_NOVEDAD"
    },
    "recordatorio_trabajo": {
      "texto": "Hola {{1}}, el trabajo '{{2}}' sigue esperando tu respuesta. Tocá el botón para verlo.",
      "variables": 2,
      "boton": "Ver trabajo",
      "env": "TWILIO_CONTENT_SID_RECORDATORIO"
    },
    "recordatorio_finalizar": {
      "texto": "Hola {{1}}, el trabajo '{{2}}' sigue abierto. Si ya lo terminaste, tocá el botón para marcarlo como finalizado.",
      "variables": 2,
      "boton": "Ver trabajo",
      "env": "TWILIO_CONTENT_SID_RECORDATORIO_FINALIZAR"
    }
  }
}

def('plantillas', (module, require) => {
const { plantillas, footer } = require('./plantillas.json')
const { quitarContacto, contieneContacto } = require('./contacto')

const FOOTER = footer

function limpiarVar(v, max = 200) {
  let t = String(v ?? '').replace(/[\r\n\t\u2028\u2029]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  if (t.length > max) t = t.slice(0, max - 1).trimEnd() + '…'
  return t || '-'
}

const primerNombre = (n) => limpiarVar(String(n || '').trim().split(/\s+/)[0] || 'Hola', 40)

function sinContacto(txt) {
  const t = String(txt ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  if (!contieneContacto(t)) return t
  const limpio = t.split(/(?<=[.!?])\s+/).filter(f => !contieneContacto(f)).join(' ').trim()
  return limpio || quitarContacto(t)
}

function resumen(desc, max = 100) {
  const t = sinContacto(desc)
  if (!t) return ''
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}

const URGENCIA = { alta: 'Alta', media: 'Media', baja: 'Baja' }

function varsTrabajoNuevo({ proveedorNombre, categoria, edificioNombre, depto, urgencia, titulo, descripcion, nota }) {
  const res = resumen(descripcion)
  const t = sinContacto(titulo)
  let problema = res && res.toLowerCase() !== t.toLowerCase() ? `${t}: ${res}` : t
  const n = sinContacto(nota)
  if (n) problema += ` | Nota del administrador: ${n}`
  return [
    primerNombre(proveedorNombre), limpiarVar(categoria, 40), limpiarVar(edificioNombre, 60),
    limpiarVar(depto || '?', 20), URGENCIA[urgencia] || 'Media', limpiarVar(problema, 320),
  ]
}

function varsMensajeNuevo({ proveedorNombre, quien, titulo, detalle }) {
  return [primerNombre(proveedorNombre), limpiarVar(quien, 60), limpiarVar(sinContacto(titulo), 80), limpiarVar(detalle, 140)]
}

function varsAcuerdoNovedad({ proveedorNombre, titulo, novedad }) {
  return [primerNombre(proveedorNombre), limpiarVar(sinContacto(titulo), 80), limpiarVar(novedad, 160)]
}

function varsRecordatorio({ proveedorNombre, titulo }) {
  return [primerNombre(proveedorNombre), limpiarVar(sinContacto(titulo), 80)]
}

function renderTexto(nombre, variables) {
  const p = plantillas[nombre]
  if (!p) return ''
  return p.texto.replace(/\{\{(\d+)\}\}/g, (_, i) => String(variables[Number(i) - 1] ?? '-'))
}

module.exports = { plantillas, FOOTER, limpiarVar, primerNombre, sinContacto, resumen, varsTrabajoNuevo, varsMensajeNuevo, varsAcuerdoNovedad, varsRecordatorio, renderTexto }
})

def('whatsapp', (module, require) => {
const { plantillas, FOOTER, renderTexto } = require('./plantillas')
const { aE164 } = require('./telefono')
const { baseUrl } = require('./common')

const proveedorActivo = () => (process.env.WHATSAPP_PROVIDER || 'twilio').toLowerCase() === 'meta' ? 'meta' : 'twilio'
const urlDelLink = (sufijo) => `${baseUrl()}/t/${sufijo}`
const urlEstado = () => `${baseUrl()}/.netlify/functions/whatsapp-estado`

function errorCorto(e) {
  const code = e?.code ? `[${e.code}] ` : ''
  return (code + String(e?.message || e || 'error desconocido')).replace(/\s+/g, ' ').slice(0, 280)
}

const env = (k) => String(process.env[k] ?? '').trim()

const esSandbox = () => process.env.TWILIO_SANDBOX?.trim().toLowerCase() === 'true'

async function enviarTwilio({ to, plantilla, variables, sufijoBoton }) {
  const sid = env('TWILIO_ACCOUNT_SID'), auth = env('TWILIO_AUTH_TOKEN')
  const from = env('TWILIO_WHATSAPP_FROM'), servicio = env('TWILIO_MESSAGING_SERVICE_SID')
  const falla = (error) => ({ ok: false, canal: 'twilio', error })
  if (!sid || !auth || (!from && !servicio)) return falla('Twilio sin configurar (faltan variables en Netlify)')
  const cfg = plantillas[plantilla]
  if (!cfg) return falla('Plantilla desconocida')

const datos = { to: `whatsapp:${to}`, statusCallback: urlEstado() }
  const sandbox = esSandbox()
  if (servicio && !(sandbox && from)) datos.messagingServiceSid = servicio
  if (!datos.messagingServiceSid && from) datos.from = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`
  if (!datos.messagingServiceSid && !datos.from) return falla('Falta el remitente: cargá TWILIO_WHATSAPP_FROM (ej: whatsapp:+17372212163) en Netlify')

if (sandbox) {
    datos.body = `${renderTexto(plantilla, variables)}${sufijoBoton ? `\n\n${cfg.boton}: ${urlDelLink(sufijoBoton)}` : ''}\n\n${FOOTER}`
  } else {
    const contentSid = env(cfg.env)
    if (!contentSid) return falla(`Falta el SID de la plantilla ${plantilla}: cargá ${cfg.env} en Netlify (o poné TWILIO_SANDBOX=true para probar)`)
    if (!/^HX/i.test(contentSid)) return falla(`El SID de la plantilla ${plantilla} (${cfg.env}) tiene que empezar con HX`)
    const cv = {}
    variables.forEach((v, i) => { cv[String(i + 1)] = String(v) })
    if (sufijoBoton) cv[String(variables.length + 1)] = String(sufijoBoton)
    datos.contentSid = contentSid
    datos.contentVariables = JSON.stringify(cv)
  }

  const usaPlantilla = datos.contentSid !== undefined, tieneVars = datos.contentVariables !== undefined
  if (usaPlantilla !== tieneVars || (usaPlantilla && datos.body !== undefined) || (!usaPlantilla && !datos.body)) {
    return falla('Envío de WhatsApp mal armado (contentSid / contentVariables / body)')
  }

  try {
    const twilio = require('twilio')
    const msg = await twilio(sid, auth).messages.create(datos)
    return { ok: true, canal: 'twilio', sid: msg.sid }
  } catch (e) {
    const modo = `v39d modo=${sandbox ? 'sandbox' : 'plantilla'}, campos=${Object.keys(datos).join('/')}`
    return { ok: false, canal: 'twilio', error: `${errorCorto(e).slice(0, 170)} (${modo})` }
  }
}

async function enviarMeta({ to, plantilla, variables, sufijoBoton }) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID, token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneId || !token) return { ok: false, canal: 'meta', error: 'Meta WhatsApp sin configurar (faltan variables en Netlify)' }
  if (!plantillas[plantilla]) return { ok: false, canal: 'meta', error: 'Plantilla desconocida' }
  const nombre = process.env[`META_TEMPLATE_${plantilla.toUpperCase()}`] || plantilla
  const components = [{ type: 'body', parameters: variables.map(v => ({ type: 'text', text: String(v) })) }]
  if (sufijoBoton) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(sufijoBoton) }] })
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'template',
        template: { name: nombre, language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'es_AR' }, components } }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, canal: 'meta', error: errorCorto(data?.error?.message || `HTTP ${res.status}`) }
    return { ok: true, canal: 'meta', sid: data?.messages?.[0]?.id || null }
  } catch (e) { return { ok: false, canal: 'meta', error: errorCorto(e) } }
}

async function enviarPlantilla({ numero, plantilla, variables = [], sufijoBoton = null }) {
  const to = aE164(numero)
  if (!to) return { ok: false, canal: proveedorActivo(), error: 'Teléfono inválido' }
  const args = { to, plantilla, variables, sufijoBoton }
  return proveedorActivo() === 'meta' ? enviarMeta(args) : enviarTwilio(args)
}

module.exports = { enviarPlantilla, proveedorActivo, esSandbox }
})

def('enlaces', (module, require) => {
const { baseUrl } = require('./common')
const { nuevoTokenLink, hashToken, cifrarToken, descifrarToken } = require('./tokens')

const DIAS_TOPE = 60
const FASES_ACTIVAS = ['derivado', 'en_camino', 'finalizado_proveedor']
const MENSAJE_INACTIVO = 'Este link ya no está activo. Pedile uno nuevo al administrador.'
const urlDe = (token) => `${baseUrl()}/t/${token}`

async function registrarEvento(admin, enlaceId, evento, { ipHash = null, userAgent = null } = {}) {
  try {
    await admin.from('enlace_eventos').insert({ enlace_id: enlaceId, evento: String(evento).slice(0, 60), ip_hash: ipHash, user_agent: userAgent ? String(userAgent).slice(0, 200) : null })
  } catch { /* la auditoría nunca debe frenar la acción */ }
}

async function revocarEnlaces(admin, avisoId, motivo) {
  await admin.from('enlaces_proveedor').update({ revocado: true, revocado_at: new Date().toISOString(), revocado_motivo: String(motivo).slice(0, 60) })
    .eq('aviso_id', avisoId).eq('revocado', false)
}

async function crearEnlace(admin, aviso) {
  await revocarEnlaces(admin, aviso.id, 'reemplazado')
  const token = nuevoTokenLink(), hash = hashToken(token)
  const cifrado = cifrarToken(token, hash)
  if (!cifrado) console.error('LINK_ENC_KEY faltante o inválida: el link funciona, pero no se va a poder reenviar el MISMO link')
  const { data, error } = await admin.from('enlaces_proveedor').insert({
    aviso_id: aviso.id, proveedor_id: aviso.proveedor_id, token_hash: hash, token_cifrado: cifrado,
    expires_at: new Date(Date.now() + DIAS_TOPE * 86400000).toISOString(),
  }).select('id').single()
  if (error) throw error
  await admin.from('avisos').update({ enlace_enviado_at: new Date().toISOString() }).eq('id', aviso.id)
  await registrarEvento(admin, data.id, 'creado')
  return { token, url: urlDe(token), enlaceId: data.id, reutilizado: false }
}

async function enlaceActivo(admin, avisoId, proveedorId) {
  const { data } = await admin.from('enlaces_proveedor')
    .select('id, token_hash, token_cifrado, expires_at, aceptado_at, primer_acceso_at, ultimo_acceso_at, created_at')
    .eq('aviso_id', avisoId).eq('proveedor_id', proveedorId).eq('revocado', false)
    .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1)
  return data?.[0] || null
}

async function obtenerOCrearEnlace(admin, aviso) {
  const e = await enlaceActivo(admin, aviso.id, aviso.proveedor_id)
  const token = e ? descifrarToken(e.token_cifrado, e.token_hash) : null
  if (e && token) return { token, url: urlDe(token), enlaceId: e.id, reutilizado: true }
  return crearEnlace(admin, aviso)
}

module.exports = { DIAS_TOPE, FASES_ACTIVAS, MENSAJE_INACTIVO, urlDe, registrarEvento, revocarEnlaces, crearEnlace, enlaceActivo, obtenerOCrearEnlace }
})

def('proveedor-wa', (module, require) => {
const { normalizarTelefonoAR } = require('./telefono')
async function enviarPlantilla(args) {
  try { return await require('./whatsapp').enviarPlantilla(args) }
  catch (e) {
    console.error('No se pudo cargar lib/whatsapp.js:', String(e?.message || e).split('\n')[0])
    return { ok: false, canal: 'twilio', error: 'No se pudo cargar el módulo de WhatsApp (revisá netlify/functions/lib/whatsapp.js)' }
  }
}
const P = require('./plantillas')
const { crearEnlace, obtenerOCrearEnlace, enlaceActivo } = require('./enlaces')
const { descifrarToken } = require('./tokens')
const { avisarAdmins } = require('./push')

const INACTIVO_SEG = 60          // sin actividad en la página de más de 60 s = "no la tiene abierta"
const AGRUPAR_MIN = 10           // máximo un WhatsApp de novedades cada 10 min por trabajo

const MOTIVOS = {
  sin_telefono: 'el proveedor no tiene teléfono cargado',
  telefono_invalido: 'el teléfono del proveedor no es un celular argentino válido',
  sin_consentimiento: 'falta confirmar que el proveedor aceptó recibir avisos por WhatsApp',
  baja: 'el proveedor respondió BAJA y pidió no recibir más avisos',
}

function puedeRecibirWa(prov) {
  if (!prov?.telefono) return { ok: false, motivo: 'sin_telefono' }
  if (!normalizarTelefonoAR(prov.telefono)) return { ok: false, motivo: 'telefono_invalido' }
  if (!prov.whatsapp_optin_at) return { ok: false, motivo: 'sin_consentimiento' }
  if (prov.whatsapp_optout_at) return { ok: false, motivo: 'baja' }
  return { ok: true }
}

const COLS_AVISO = 'id, edificio_id, vecino_id, proveedor_id, proveedor_nombre, titulo, descripcion, categoria, urgencia, fase, autorizado_por, nota_proveedor, chat_pausado, derivado_at, aceptado_at'

async function contexto(admin, avisoId) {
  const { data: a } = await admin.from('avisos').select(COLS_AVISO).eq('id', avisoId).limit(1)
  const aviso = a?.[0]
  if (!aviso) return null
  const [{ data: e }, { data: v }, { data: p }] = await Promise.all([
    admin.from('edificios').select('id, nombre, direccion, requiere_acuerdo').eq('id', aviso.edificio_id).limit(1),
    admin.from('vecinos').select('nombre, departamento').eq('id', aviso.vecino_id).limit(1),
    aviso.proveedor_id ? admin.from('proveedores').select('id, nombre, telefono, whatsapp_optin_at, whatsapp_optout_at, eliminado_at').eq('id', aviso.proveedor_id).limit(1) : Promise.resolve({ data: [] }),
  ])
  return { aviso, edificio: e?.[0] || {}, vecino: v?.[0] || {}, prov: p?.[0] || null }
}

async function enviarAProveedor(admin, ctx, { plantilla, variables, token, enlaceId }) {
  const chk = puedeRecibirWa(ctx.prov)
  if (!chk.ok) return { sent: false, motivo: chk.motivo }
  const r = await enviarPlantilla({ numero: ctx.prov.telefono, plantilla, variables, sufijoBoton: token })
  try {
    await admin.from('notificaciones_whatsapp').insert({
      aviso_id: ctx.aviso.id, enlace_id: enlaceId || null, proveedor_id: ctx.prov.id, plantilla,
      estado: r.ok ? 'enviado' : 'fallido', sid: r.sid || null, canal: r.canal || 'twilio', error: r.ok ? null : (r.error || 'error').slice(0, 300),
    })
  } catch (e) { console.error('No se pudo registrar el envío de WhatsApp') }
  if (!r.ok) {
    await avisarAdmins(admin, ctx.aviso.edificio_id, '⚠️ No se pudo enviar el WhatsApp',
      `${ctx.prov.nombre}: ${ctx.aviso.titulo}. Enviale el link vos desde el reclamo.`, { tipo: 'wa_fallo', aviso_id: ctx.aviso.id }).catch(() => {})
  }
  return { sent: r.ok, error: r.ok ? null : r.error }
}

async function enviarTrabajoNuevo(admin, avisoId, { reenviar = false, nota = null } = {}) {
  let ctx = await contexto(admin, avisoId)
  if (!ctx?.aviso.proveedor_id || !ctx.prov) throw new Error('El reclamo no tiene proveedor')
  if (!reenviar && nota !== null) {
    const limpia = P.sinContacto(nota).slice(0, 120)
    await admin.from('avisos').update({ nota_proveedor: limpia || null }).eq('id', avisoId)
    ctx.aviso.nota_proveedor = limpia || null
  }
  const enlace = reenviar ? await obtenerOCrearEnlace(admin, ctx.aviso) : await crearEnlace(admin, ctx.aviso)
  const variables = P.varsTrabajoNuevo({
    proveedorNombre: ctx.prov.nombre, categoria: ctx.aviso.categoria, edificioNombre: ctx.edificio.nombre,
    depto: ctx.vecino.departamento, urgencia: ctx.aviso.urgencia, titulo: ctx.aviso.titulo,
    descripcion: ctx.aviso.descripcion, nota: ctx.aviso.nota_proveedor,
  })
  const env = await enviarAProveedor(admin, ctx, { plantilla: 'trabajo_nuevo', variables, token: enlace.token, enlaceId: enlace.enlaceId })
  return { link: enlace.url, reutilizado: enlace.reutilizado, telefono: ctx.prov.telefono, proveedor: ctx.prov.nombre, whatsapp: env.sent, motivo: env.motivo || null, error: env.error || null }
}

async function previewTrabajoNuevo(admin, avisoId, proveedorId, nota) {
  const ctx = await contexto(admin, avisoId)
  if (!ctx) return null
  const { data: p } = await admin.from('proveedores').select('id, nombre, telefono, whatsapp_optin_at, whatsapp_optout_at, edificio_id, eliminado_at').eq('id', proveedorId).limit(1)
  const prov = p?.[0]
  if (!prov || prov.edificio_id !== ctx.aviso.edificio_id || prov.eliminado_at) return null
  const variables = P.varsTrabajoNuevo({
    proveedorNombre: prov.nombre, categoria: ctx.aviso.categoria, edificioNombre: ctx.edificio.nombre,
    depto: ctx.vecino.departamento, urgencia: ctx.aviso.urgencia, titulo: ctx.aviso.titulo,
    descripcion: ctx.aviso.descripcion, nota: String(nota || '').slice(0, 120),
  })
  const chk = puedeRecibirWa(prov)
  return { texto: P.renderTexto('trabajo_nuevo', variables), footer: P.FOOTER, boton: P.plantillas.trabajo_nuevo.boton,
    puede_enviar: chk.ok, motivo: chk.ok ? null : MOTIVOS[chk.motivo] }
}

async function marcarNovedad(admin, avisoId, { tipo, texto = null } = {}) {
  const { data: a } = await admin.from('avisos').select('id, proveedor_id').eq('id', avisoId).limit(1)
  const av = a?.[0]
  if (!av?.proveedor_id) return { enviado: false }
  const e = await enlaceActivo(admin, av.id, av.proveedor_id)
  if (!e) return { enviado: false }
  const activo = e.ultimo_acceso_at && (Date.now() - new Date(e.ultimo_acceso_at).getTime()) < INACTIVO_SEG * 1000
  if (activo) return { enviado: false, motivo: 'pagina_abierta' }
  const upd = { wa_pendiente: true }
  if (tipo === 'acuerdo' && texto) upd.wa_acuerdo_pendiente = String(texto).slice(0, 160)
  await admin.from('enlaces_proveedor').update(upd).eq('id', e.id)
  return flushNovedades(admin, e.id)
}

async function flushNovedades(admin, enlaceId) {
  const { data: en } = await admin.from('enlaces_proveedor')
    .select('id, aviso_id, proveedor_id, token_hash, token_cifrado, revocado, expires_at, ultimo_acceso_at, wa_pendiente, wa_mensajes_hasta, wa_acuerdo_pendiente, created_at')
    .eq('id', enlaceId).limit(1)
  const e = en?.[0]
  if (!e || !e.wa_pendiente) return { enviado: false }
  const limpiar = (extra = {}) => admin.from('enlaces_proveedor').update({ wa_pendiente: false, wa_acuerdo_pendiente: null, ...extra }).eq('id', e.id)
  if (e.revocado || new Date(e.expires_at) < new Date()) { await limpiar(); return { enviado: false } }
  const ahora = new Date()
  if (e.ultimo_acceso_at && ahora - new Date(e.ultimo_acceso_at) < INACTIVO_SEG * 1000) { await limpiar({ wa_mensajes_hasta: ahora.toISOString() }); return { enviado: false, motivo: 'pagina_abierta' } }

  const desdeThrottle = new Date(ahora - AGRUPAR_MIN * 60000).toISOString()
  const { data: rec } = await admin.from('notificaciones_whatsapp').select('id').eq('aviso_id', e.aviso_id)
    .in('plantilla', ['mensaje_nuevo', 'acuerdo_novedad']).gt('created_at', desdeThrottle).limit(1)
  if (rec?.length) return { enviado: false, motivo: 'agrupado' }

  const ctx = await contexto(admin, e.aviso_id)
  if (!ctx?.prov || ctx.aviso.proveedor_id !== e.proveedor_id) { await limpiar(); return { enviado: false } }
  const token = descifrarToken(e.token_cifrado, e.token_hash)
  if (!token) { await limpiar(); return { enviado: false, motivo: 'sin_token' } }   // link viejo sin cifrar: el admin puede reenviarlo

  const desde = new Date(e.wa_mensajes_hasta || e.created_at).toISOString()
  const { data: msgs } = await admin.from('mensajes').select('contenido, imagen_url, remitente_rol, created_at')
    .eq('aviso_id', e.aviso_id).in('remitente_rol', ['vecino', 'admin']).eq('es_nota_interna', false)
    .or('bloqueado.eq.false,liberado.eq.true').or(`created_at.gt.${desde},liberado_at.gt.${desde}`)
    .order('created_at', { ascending: true }).limit(50)
  const lista = msgs || []
  const hayAcuerdo = !!e.wa_acuerdo_pendiente

  let plantilla, variables
  if (lista.length) {
    const quienes = []
    if (lista.some(m => m.remitente_rol === 'vecino')) quienes.push(P.primerNombre(ctx.vecino.nombre))
    if (lista.some(m => m.remitente_rol === 'admin')) quienes.push('el administrador')
    let detalle = lista.length === 1
      ? (P.sinContacto(lista[0].contenido).slice(0, 100) || (lista[0].imagen_url ? 'te mandó una foto' : 'te mandó un mensaje'))
      : `tenés ${lista.length} mensajes nuevos`
    if (hayAcuerdo) detalle += '. Hay novedades en el acuerdo'
    plantilla = 'mensaje_nuevo'
    variables = P.varsMensajeNuevo({ proveedorNombre: ctx.prov.nombre, quien: quienes.join(' y ') || 'El vecino', titulo: ctx.aviso.titulo, detalle })
  } else if (hayAcuerdo) {
    plantilla = 'acuerdo_novedad'
    variables = P.varsAcuerdoNovedad({ proveedorNombre: ctx.prov.nombre, titulo: ctx.aviso.titulo, novedad: e.wa_acuerdo_pendiente })
  } else { await limpiar(); return { enviado: false } }

  const r = await enviarAProveedor(admin, ctx, { plantilla, variables, token, enlaceId: e.id })
  await limpiar({ wa_mensajes_hasta: ahora.toISOString() })
  return { enviado: r.sent, plantilla }
}

async function enviarRecordatorio(admin, avisoId, plantilla) {
  const ctx = await contexto(admin, avisoId)
  if (!ctx?.prov) return { sent: false }
  if (!P.plantillas[plantilla]) return { sent: false }
  const enlace = await obtenerOCrearEnlace(admin, ctx.aviso)
  const variables = P.varsRecordatorio({ proveedorNombre: ctx.prov.nombre, titulo: ctx.aviso.titulo })
  return enviarAProveedor(admin, ctx, { plantilla, variables, token: enlace.token, enlaceId: enlace.enlaceId })
}

module.exports = { INACTIVO_SEG, AGRUPAR_MIN, MOTIVOS, puedeRecibirWa, contexto, enviarAProveedor, enviarTrabajoNuevo, previewTrabajoNuevo, marcarNovedad, flushNovedades, enviarRecordatorio }
})

def('acuerdos', (module, require) => {
const { contieneContacto, MENSAJE_BLOQUEO } = require('./contacto')
const { avisar, avisarAdmins } = require('./push')
const { marcarNovedad } = require('./proveedor-wa')
const { primerNombre } = require('./plantillas')

const COLS = 'id, propuesto_por, fecha_visita, franja, monto_presupuesto, alcance, estado, aceptado_at, decidido_at, decidido_motivo, vence_at, created_at'
const FRANJAS = ['manana', 'tarde', 'noche', 'a_coordinar']
const FASES_ACUERDO = ['derivado', 'en_camino']
const EN_CURSO = ['propuesto', 'aceptado_contraparte']

const hoyAR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)   // Argentina = UTC-3

async function vencerViejos(admin, avisoId) {
  await admin.from('acuerdos').update({ estado: 'vencido', updated_at: new Date().toISOString() })
    .eq('aviso_id', avisoId).in('estado', EN_CURSO).lt('vence_at', new Date().toISOString())
}

async function acuerdoVigente(admin, avisoId) {
  await vencerViejos(admin, avisoId)
  const { data } = await admin.from('acuerdos').select(COLS).eq('aviso_id', avisoId).order('created_at', { ascending: false }).limit(10)
  const lista = data || []
  const vigente = lista.find(a => a.estado !== 'vencido' && a.estado !== 'rechazado') || null
  const rechazado = !vigente && lista[0]?.estado === 'rechazado' ? lista[0] : null
  return { vigente, rechazado }
}

function validarPropuesta(b, { montoObligatorio = false } = {}) {
  const alcance = String(b?.alcance ?? '').replace(/\s+/g, ' ').trim()
  if (alcance.length < 3) return { error: 'Escribí qué incluye el trabajo (mínimo 3 letras).' }
  if (alcance.length > 300) return { error: 'El alcance puede tener hasta 300 caracteres.' }
  if (contieneContacto(alcance)) return { error: MENSAJE_BLOQUEO }
  let fecha = null
  if (b?.fecha_visita) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha_visita))) return { error: 'Fecha inválida.' }
    fecha = String(b.fecha_visita)
    const max = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
    if (fecha < hoyAR()) return { error: 'La fecha de visita no puede ser pasada.' }
    if (fecha > max) return { error: 'La fecha de visita es demasiado lejana (máximo 90 días).' }
    if (isNaN(new Date(fecha + 'T12:00:00Z').getTime())) return { error: 'Fecha inválida.' }
  }
  let franja = b?.franja ? String(b.franja) : null
  if (franja && !FRANJAS.includes(franja)) return { error: 'Franja inválida.' }
  if (fecha && !franja) franja = 'a_coordinar'
  let monto = null
  if (b?.monto !== undefined && b?.monto !== null && b?.monto !== '') {
    monto = Number(b.monto)
    if (!isFinite(monto) || monto <= 0 || monto >= 1e9) return { error: 'Ingresá un monto válido.' }
    monto = Math.round(monto * 100) / 100
  } else if (montoObligatorio) return { error: 'Ingresá el monto del presupuesto.' }
  return { valor: { alcance, fecha_visita: fecha, franja, monto_presupuesto: monto } }
}

const rotuloFranja = { manana: 'por la mañana', tarde: 'por la tarde', noche: 'por la noche', a_coordinar: 'a coordinar' }
const fmtFecha = (f) => { const [y, m, d] = String(f).split('-'); return `${d}/${m}/${y}` }

function resumenCorto(a) {
  const partes = []
  if (a.fecha_visita) partes.push(`visita el ${fmtFecha(a.fecha_visita)} ${rotuloFranja[a.franja] || ''}`.trim())
  if (a.monto_presupuesto != null) partes.push(`$${Number(a.monto_presupuesto).toLocaleString('es-AR')}`)
  return partes.join(', ')
}

async function proponer(admin, aviso, rol, body, opts = {}) {
  if (!['vecino', 'proveedor'].includes(rol)) return { status: 403, error: 'Solo el vecino o el proveedor pueden proponer un acuerdo.' }
  if (!FASES_ACUERDO.includes(aviso.fase)) return { status: 409, error: 'Ya no se puede proponer un acuerdo en este momento.' }
  const v = validarPropuesta(body, opts)
  if (v.error) return { status: 400, error: v.error }
  await vencerViejos(admin, aviso.id)
  await admin.from('acuerdos').update({ estado: 'vencido', updated_at: new Date().toISOString() }).eq('aviso_id', aviso.id).in('estado', EN_CURSO)
  const { data, error } = await admin.from('acuerdos').insert({ aviso_id: aviso.id, propuesto_por: rol, ...v.valor }).select(COLS).single()
  if (error) return { status: 409, error: 'No se pudo guardar el acuerdo. Probá de nuevo.' }
  return { acuerdo: data }
}

async function aceptar(admin, aviso, rol, acuerdoId) {
  if (!FASES_ACUERDO.includes(aviso.fase)) return { status: 409, error: 'Ya no se puede aceptar un acuerdo en este momento.' }
  await vencerViejos(admin, aviso.id)
  const { data: r } = await admin.from('acuerdos').select(COLS).eq('id', String(acuerdoId || '')).eq('aviso_id', aviso.id).limit(1)
  const a = r?.[0]
  if (!a || a.estado !== 'propuesto') return { status: 409, error: 'Este acuerdo ya no está esperando tu respuesta.' }
  if (a.propuesto_por === rol) return { status: 403, error: 'Tiene que aceptarlo la otra parte.' }
  const { data, error } = await admin.from('acuerdos').update({ estado: 'aceptado_contraparte', aceptado_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', a.id).eq('estado', 'propuesto').select(COLS).single()
  if (error || !data) return { status: 409, error: 'Este acuerdo ya cambió. Actualizá la pantalla.' }
  return { acuerdo: data }
}

async function decidir(admin, aviso, acuerdoId, aprobar, motivo) {
  await vencerViejos(admin, aviso.id)
  const { data: r } = await admin.from('acuerdos').select(COLS).eq('id', String(acuerdoId || '')).eq('aviso_id', aviso.id).limit(1)
  const a = r?.[0]
  if (!a || !EN_CURSO.includes(a.estado)) return { status: 409, error: 'Este acuerdo ya no está pendiente.' }
  if (aprobar && a.estado !== 'aceptado_contraparte') return { status: 409, error: 'Todavía falta que la otra parte lo acepte.' }
  const txt = String(motivo || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const ahora = new Date().toISOString()
  const { data, error } = await admin.from('acuerdos').update({ estado: aprobar ? 'aprobado_admin' : 'rechazado', decidido_at: ahora, decidido_motivo: txt || null, updated_at: ahora })
    .eq('id', a.id).in('estado', EN_CURSO).select(COLS).single()
  if (error || !data) return { status: 409, error: 'Este acuerdo ya cambió. Actualizá la pantalla.' }
  if (aprobar) await admin.from('acuerdos').update({ estado: 'vencido', updated_at: ahora }).eq('aviso_id', aviso.id).eq('estado', 'aprobado_admin').neq('id', a.id)
  return { acuerdo: data }
}

async function notificarAcuerdo(admin, aviso, { evento, por, acuerdo, vecinoNombre }) {
  const data = { tipo: 'acuerdo', aviso_id: aviso.id }
  const resumen = resumenCorto(acuerdo)
  const aVecino = (t, b) => avisar(admin, { user_id: aviso.vecino_id, rol: 'vecino' }, t, b, data).catch(() => {})
  const aAdmins = (t, b) => avisarAdmins(admin, aviso.edificio_id, t, b, data).catch(() => {})
  const aProveedor = async (t, b, texto) => {
    if (!aviso.proveedor_id) return
    await avisar(admin, { user_id: aviso.proveedor_id, rol: 'proveedor' }, t, b, data).catch(() => {})
    await marcarNovedad(admin, aviso.id, { tipo: 'acuerdo', texto }).catch(() => {})
  }
  const nombreVecino = primerNombre(vecinoNombre || 'El vecino')
  if (evento === 'propuesto') {
    if (por === 'proveedor') await aVecino('🤝 Propuesta de acuerdo', `${aviso.proveedor_nombre || 'El proveedor'} propuso un acuerdo para "${aviso.titulo}". Revisalo en el chat.`)
    else await aProveedor('🤝 Propuesta de acuerdo', `${nombreVecino} propuso un acuerdo para "${aviso.titulo}".`, `${nombreVecino} propuso un acuerdo${resumen ? ': ' + resumen : ''}`)
    await aAdmins('🤝 Nueva propuesta de acuerdo', `${aviso.titulo}${resumen ? ' · ' + resumen : ''}`)
  } else if (evento === 'aceptado') {
    await aAdmins('🤝 Acuerdo listo para aprobar', `${aviso.titulo}${resumen ? ' · ' + resumen : ''}. Falta tu aprobación.`)
    if (acuerdo.propuesto_por === 'vecino') await aProveedor('🤝 Acuerdo aceptado', `Aceptaron tu acuerdo en "${aviso.titulo}". Falta la aprobación del administrador.`, 'Aceptaron el acuerdo. Falta la aprobación del administrador')
    else await aVecino('🤝 Acuerdo aceptado', `Aceptaron el acuerdo de "${aviso.titulo}". Falta la aprobación del administrador.`)
  } else if (evento === 'aprobado') {
    await aVecino('✅ Acuerdo aprobado', `El administrador aprobó el acuerdo de "${aviso.titulo}".`)
    await aProveedor('✅ Acuerdo aprobado', `El administrador aprobó el acuerdo de "${aviso.titulo}".`, 'El administrador aprobó el acuerdo')
  } else if (evento === 'rechazado') {
    await aVecino('❌ Acuerdo rechazado', `El administrador rechazó el acuerdo de "${aviso.titulo}". Pueden proponer otro.`)
    await aProveedor('❌ Acuerdo rechazado', `El administrador rechazó el acuerdo de "${aviso.titulo}".`, 'El administrador rechazó el acuerdo. Pueden proponer otro')
  }
}

module.exports = { COLS, FRANJAS, FASES_ACUERDO, vencerViejos, acuerdoVigente, validarPropuesta, proponer, aceptar, decidir, notificarAcuerdo, resumenCorto }
})

def('eventos', (module, require) => {
const { avisar, avisarAdmins, tokensDe } = require('./push')
const { enviarTrabajoNuevo } = require('./proveedor-wa')

const unidadDe = (edificioNombre, depto) => `${edificioNombre || 'Consorcio'} - Depto ${depto || '?'}`
const dataPush = (a) => ({ aviso_id: a.id })

async function derivar(admin, a, unidad, { reenviar = false, nota = null } = {}) {
  const r = await enviarTrabajoNuevo(admin, a.id, { reenviar, nota })
  if (!reenviar) {
    await avisar(admin, { user_id: a.proveedor_id, rol: 'proveedor' }, '🔧 Nuevo trabajo asignado',
      `${unidad} · ${`${a.categoria}: ${a.titulo}`.slice(0, 120)}`, { tipo: 'trabajo', aviso_id: a.id }).catch(() => {})
  }
  return r
}

async function postAceptado(admin, a, unidad) {
  await avisarAdmins(admin, a.edificio_id, '🚗 Proveedor en camino', `${a.proveedor_nombre} aceptó: ${unidad} · ${a.titulo}`, { tipo: 'aceptado', ...dataPush(a) })
  await avisar(admin, { user_id: a.vecino_id, rol: 'vecino' }, '🚗 Tu proveedor va en camino', `${a.proveedor_nombre} aceptó tu reporte "${a.titulo}".`, { tipo: 'aceptado', ...dataPush(a) })
}

async function postNoPuede(admin, a, unidad) {
  const anterior = a.reasignado_de_nombre || 'El proveedor'
  const motivo = a.motivo_no_puede ? ` Motivo: "${String(a.motivo_no_puede).slice(0, 90)}".` : ''
  if (a.fase === 'derivado' && a.proveedor_id) {
    const r = await derivar(admin, a, unidad)
    const sinWa = r && !r.whatsapp ? ` ⚠️ No se le pudo mandar el WhatsApp: pasale el link a mano desde el reclamo.` : ''
    await avisarAdmins(admin, a.edificio_id, '🔄 Reasignado automáticamente',
      `${unidad} · ${a.titulo}: ${anterior} no pudo.${motivo} La app lo pasó a ${a.proveedor_nombre}.${sinWa}`, { tipo: 'reasignado_auto', ...dataPush(a) })
  } else {
    await avisarAdmins(admin, a.edificio_id, '⚠️ Ningún proveedor pudo',
      `${unidad} · ${a.titulo}: ${anterior} no pudo.${motivo} No hay otro disponible de ${a.categoria}: elegí uno o cargá más proveedores.`, { tipo: 'aviso_admin', ...dataPush(a) })
  }
}

async function postFinalizado(admin, a, unidad) {
  await avisarAdmins(admin, a.edificio_id, '🏁 Trabajo finalizado', `${unidad} · ${a.titulo}. Confirmá para cerrar el reclamo.`, { tipo: 'finalizado', ...dataPush(a) })
  await avisar(admin, { user_id: a.vecino_id, rol: 'vecino' }, '🏁 Trabajo finalizado', `"${a.titulo}" quedó finalizado. Confirmá que está resuelto.`, { tipo: 'finalizado', ...dataPush(a) })
}

async function postPresupuestoPedido(admin, a, unidad) {
  await avisarAdmins(admin, a.edificio_id, '💬 El proveedor quiere presupuestar', `${a.proveedor_nombre} · ${unidad} · ${a.titulo}`, { tipo: 'presupuesto', ...dataPush(a) })
  await avisar(admin, { user_id: a.vecino_id, rol: 'vecino' }, '💬 El proveedor quiere presupuestar', `Coordiná una visita con ${a.proveedor_nombre} desde el chat de "${a.titulo}".`, { tipo: 'presupuesto', ...dataPush(a) })
}

async function postMensajeProveedor(admin, a, texto) {
  const quien = a.proveedor_nombre || 'Proveedor'
  await avisar(admin, { user_id: a.vecino_id, rol: 'vecino' }, `💬 ${quien}`, texto, { tipo: 'mensaje', ...dataPush(a) })
  await avisarAdmins(admin, a.edificio_id, `💬 ${quien}`, texto, { tipo: 'mensaje', ...dataPush(a) })
}

module.exports = { unidadDe, derivar, postAceptado, postNoPuede, postFinalizado, postPresupuestoPedido, postMensajeProveedor, tokensDe }
})

def('twilio-webhook', (module, require) => {
const { baseUrl } = require('./common')

function leerParametros(event) {
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '')
  return Object.fromEntries(new URLSearchParams(raw))
}

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

module.exports = { leerParametros, firmaValida }
})

const todo = { ...baseExports }
for (const nombre of Object.keys(lib)) for (const [k, v] of Object.entries(lib[nombre])) if (!(k in todo)) todo[k] = v
module.exports = { ...todo, lib }
