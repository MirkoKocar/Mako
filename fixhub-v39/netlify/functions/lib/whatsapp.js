// ============================================================================
// WhatsApp — interfaz única:  enviarPlantilla({ numero, plantilla, variables, sufijoBoton })
// Driver según WHATSAPP_PROVIDER:  'twilio' (por defecto)  |  'meta' (Cloud API, el de antes)
//  - Twilio en producción: SOLO plantillas aprobadas (Content Templates con botón de URL).
//  - Twilio con TWILIO_SANDBOX=true (en cualquier mayúscula): SOLO texto libre (body), sin plantillas.
//  - Twilio en producción: SIEMPRE contentSid + contentVariables juntos (y nunca body).
// Nunca se loguean las variables, el link ni el token.
// ============================================================================
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

// Lee una variable de entorno sin espacios ni saltos de línea sobrantes (pasa seguido al pegar valores en Netlify)
const env = (k) => String(process.env[k] ?? '').trim()

// Sandbox = texto libre. Acepta "true", "True", " TRUE " (cualquier mayúscula y con espacios).
const esSandbox = () => process.env.TWILIO_SANDBOX?.trim().toLowerCase() === 'true'

async function enviarTwilio({ to, plantilla, variables, sufijoBoton }) {
  const sid = env('TWILIO_ACCOUNT_SID'), auth = env('TWILIO_AUTH_TOKEN')
  const from = env('TWILIO_WHATSAPP_FROM'), servicio = env('TWILIO_MESSAGING_SERVICE_SID')
  const falla = (error) => ({ ok: false, canal: 'twilio', error })
  if (!sid || !auth || (!from && !servicio)) return falla('Twilio sin configurar (faltan variables en Netlify)')
  const cfg = plantillas[plantilla]
  if (!cfg) return falla('Plantilla desconocida')

  const datos = { to: `whatsapp:${to}`, statusCallback: urlEstado() }
  if (servicio) datos.messagingServiceSid = servicio
  else datos.from = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`

  if (esSandbox()) {
    // SANDBOX: solo texto libre (body). NUNCA contentSid ni contentVariables.
    // (El destinatario tiene que haberse unido al sandbox desde su WhatsApp.)
    datos.body = `${renderTexto(plantilla, variables)}${sufijoBoton ? `\n\n${cfg.boton}: ${urlDelLink(sufijoBoton)}` : ''}\n\n${FOOTER}`
  } else {
    // PRODUCCIÓN: solo plantilla aprobada. contentSid y contentVariables siempre juntos, y NUNCA body.
    const contentSid = env(cfg.env)
    if (!contentSid) return falla(`Falta el SID de la plantilla ${plantilla}: cargá ${cfg.env} en Netlify (o poné TWILIO_SANDBOX=true para probar)`)
    if (!/^HX/i.test(contentSid)) return falla(`El SID de la plantilla ${plantilla} (${cfg.env}) tiene que empezar con HX`)
    // Variables del cuerpo = 1..N; la última (N+1) es el final de la URL del botón (https://<dominio>/t/{{N+1}})
    const cv = {}
    variables.forEach((v, i) => { cv[String(i + 1)] = String(v) })
    if (sufijoBoton) cv[String(variables.length + 1)] = String(sufijoBoton)
    datos.contentSid = contentSid
    datos.contentVariables = JSON.stringify(cv)
  }

  // Última red: o va solo texto (sandbox) o van plantilla + variables juntas. Nunca una mitad sola.
  const usaPlantilla = datos.contentSid !== undefined, tieneVars = datos.contentVariables !== undefined
  if (usaPlantilla !== tieneVars || (usaPlantilla && datos.body !== undefined) || (!usaPlantilla && !datos.body)) {
    return falla('Envío de WhatsApp mal armado (contentSid / contentVariables / body)')
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

// numero: cualquier formato argentino; se normaliza a E.164 (+549...)
async function enviarPlantilla({ numero, plantilla, variables = [], sufijoBoton = null }) {
  const to = aE164(numero)
  if (!to) return { ok: false, canal: proveedorActivo(), error: 'Teléfono inválido' }
  const args = { to, plantilla, variables, sufijoBoton }
  return proveedorActivo() === 'meta' ? enviarMeta(args) : enviarTwilio(args)
}

module.exports = { enviarPlantilla, proveedorActivo, esSandbox }
