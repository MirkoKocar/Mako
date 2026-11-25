// ============================================================================
// WhatsApp — interfaz única:  enviarPlantilla({ numero, plantilla, variables, sufijoBoton })
// Driver según WHATSAPP_PROVIDER:  'twilio' (por defecto)  |  'meta' (Cloud API, el de antes)
//  - Twilio en producción: SOLO plantillas aprobadas (Content Templates con botón de URL).
//  - Twilio con TWILIO_SANDBOX=true: texto libre, para probar el flujo sin plantillas aprobadas.
// Nunca se loguean las variables, el link ni el token.
// ============================================================================
const { plantillas, FOOTER, renderTexto } = require('./plantillas')
const { aE164 } = require('./common')
const { baseUrl } = require('./common')

const proveedorActivo = () => (process.env.WHATSAPP_PROVIDER || 'twilio').toLowerCase() === 'meta' ? 'meta' : 'twilio'
const urlDelLink = (sufijo) => `${baseUrl()}/t/${sufijo}`
const urlEstado = () => `${baseUrl()}/.netlify/functions/whatsapp-estado`

function aE164WhatsApp(numero) {
  const base = aE164(numero)
  if (!base) return null
  if (/^\+54(?!9)\d{10}$/.test(base)) return `+549${base.slice(3)}`
  return base
}

function errorCorto(e) {
  const code = e?.code ? `[${e.code}] ` : ''
  return (code + String(e?.message || e || 'error desconocido')).replace(/\s+/g, ' ').slice(0, 280)
}

async function enviarTwilio({ to, plantilla, variables, sufijoBoton }) {
  const sid = process.env.TWILIO_ACCOUNT_SID, auth = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM, servicio = process.env.TWILIO_MESSAGING_SERVICE_SID
  if (!sid || !auth || (!from && !servicio)) return { ok: false, canal: 'twilio', error: 'Twilio sin configurar (faltan variables en Netlify)' }
  const cfg = plantillas[plantilla]
  if (!cfg) return { ok: false, canal: 'twilio', error: 'Plantilla desconocida' }

  const datos = { to: `whatsapp:${to}`, statusCallback: urlEstado() }
  if (servicio) datos.messagingServiceSid = servicio
  else datos.from = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`

  if (process.env.TWILIO_SANDBOX === 'true') {
    const textoLibre = `${renderTexto(plantilla, variables)}${sufijoBoton ? `\n\n${cfg.boton}: ${urlDelLink(sufijoBoton)}` : ''}\n\n${FOOTER}`
    if (process.env.TWILIO_CONTENT_SID) {
      datos.contentSid = process.env.TWILIO_CONTENT_SID
      datos.contentVariables = JSON.stringify({ '1': textoLibre.replace(/\s*\n+\s*/g, ' · ').slice(0, 900) })
    } else {
      datos.body = textoLibre
    }
  } else {
    const contentSid = process.env[cfg.env]
    if (!contentSid) return { ok: false, canal: 'twilio', error: `Falta ${cfg.env} (SID de la plantilla aprobada)` }
    const cv = {}
    variables.forEach((v, i) => { cv[String(i + 1)] = String(v) })
    if (sufijoBoton) cv[String(variables.length + 1)] = String(sufijoBoton)
    datos.contentSid = contentSid
    datos.contentVariables = JSON.stringify(cv)
  }

  try {
    const twilio = require('twilio')
    const msg = await twilio(sid, auth).messages.create(datos)
    return { ok: true, canal: 'twilio', sid: msg.sid }
  } catch (e) {
    return { ok: false, canal: 'twilio', error: errorCorto(e) }
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
  const to = aE164WhatsApp(numero)
  if (!to) return { ok: false, canal: proveedorActivo(), error: 'Teléfono inválido' }
  const args = { to, plantilla, variables, sufijoBoton }
  return proveedorActivo() === 'meta' ? enviarMeta(args) : enviarTwilio(args)
}

module.exports = { enviarPlantilla, proveedorActivo }
