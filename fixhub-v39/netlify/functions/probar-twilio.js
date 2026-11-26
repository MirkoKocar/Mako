// ============================================================================
// probar-twilio — PRUEBA TEMPORAL. BORRAR este archivo y las variables PRUEBA_* cuando termines.
//
// Sirve para saber si el problema es de Twilio o del código de la app, sin pasar por Supabase
// ni por el flujo de reportes. Se abre desde el navegador:
//
//   https://TU-SITIO/.netlify/functions/probar-twilio?clave=TU_CLAVE&paso=0   -> revisa la configuración
//   https://TU-SITIO/.netlify/functions/probar-twilio?clave=TU_CLAVE&paso=1   -> manda un texto DIRECTO por Twilio
//   https://TU-SITIO/.netlify/functions/probar-twilio?clave=TU_CLAVE&paso=2   -> manda por el MISMO código que usa la app
//   https://TU-SITIO/.netlify/functions/probar-twilio?clave=TU_CLAVE&paso=3   -> manda una PLANTILLA PRE-APROBADA del sandbox
//        (no depende de la ventana de 24 h; opcional: &sid=HX... para probar otra plantilla pre-aprobada)
//
// Variables de Netlify que necesita (además de las de Twilio que ya tenés):
//   PRUEBA_TWILIO_CLAVE  = una palabra cualquiera, larga (es la "contraseña" de esta prueba)
//   PRUEBA_TWILIO_TO     = tu celular unido al sandbox, con código de país, ej: +5491133694162
//
// Solo le manda mensajes a PRUEBA_TWILIO_TO. Nunca muestra claves ni tokens.
// ============================================================================
const crypto = require('crypto')

const limpiar = (v) => String(v ?? '').trim().replace(/^["']+|["']+$/g, '').trim()
const ultimos4 = (v) => { const s = String(v || ''); return s ? `…${s.slice(-4)}` : '(vacío)' }

function claveValida(dada) {
  const clave = process.env.PRUEBA_TWILIO_CLAVE
  if (!clave || !dada) return false
  const a = Buffer.from(String(dada)), b = Buffer.from(String(clave))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function versionTwilio() {
  try { return require('twilio/package.json').version } catch (_) { /* sigue */ }
  try { return require('twilio').version || 'instalada (versión no legible)' } catch (e) { return `NO SE PUDO CARGAR: ${e.message}` }
}

function respuesta(obj) {
  return { statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj, null, 2) }
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {}
  if (!claveValida(q.clave)) return { statusCode: 404, body: 'Not found' }

  const paso = String(q.paso ?? '0')
  const sid = limpiar(process.env.TWILIO_ACCOUNT_SID), auth = limpiar(process.env.TWILIO_AUTH_TOKEN)
  const fromCrudo = limpiar(process.env.TWILIO_WHATSAPP_FROM)
  const servicio = limpiar(process.env.TWILIO_MESSAGING_SERVICE_SID)
  const destino = limpiar(process.env.PRUEBA_TWILIO_TO).replace(/^whatsapp:/i, '').replace(/\s+/g, '')
  const from = fromCrudo ? (fromCrudo.startsWith('whatsapp:') ? fromCrudo : `whatsapp:${fromCrudo}`) : ''

  // ---- Paso 0: revisión de la configuración (sin mostrar secretos)
  if (paso === '0') {
    const sids = {}
    for (const k of Object.keys(process.env).filter(k => k.startsWith('TWILIO_CONTENT_SID_'))) {
      const v = limpiar(process.env[k])
      sids[k] = v ? `${v.length} caracteres, ${/^HX[0-9a-fA-F]{32}$/.test(v) ? 'formato OK' : 'FORMATO RARO (tiene que empezar con HX y tener 34)'}` : 'vacía'
    }
    return respuesta({
      paso: 0,
      libreria_twilio: versionTwilio(),
      node: process.version,
      TWILIO_SANDBOX_valor_exacto: process.env.TWILIO_SANDBOX ?? null,
      WHATSAPP_PROVIDER: process.env.WHATSAPP_PROVIDER ?? '(no definida: usa twilio)',
      account_sid: sid ? `${sid.slice(0, 2)}… (${sid.length} caracteres)` : '(vacío)',
      auth_token: auth ? `cargado (${auth.length} caracteres)` : '(vacío)',
      from_configurado: from ? `whatsapp:+…${from.slice(-4)}` : '(vacío)',
      messaging_service: servicio ? `cargado (${servicio.length} caracteres)` : '(vacío)',
      destino_de_la_prueba: destino ? `+…${destino.slice(-4)}` : '(falta PRUEBA_TWILIO_TO)',
      SITE_URL: process.env.SITE_URL ? 'cargada' : '(vacía)',
      plantillas: sids,
      siguiente: 'Probá ?paso=1',
    })
  }

  if (!sid || !auth || (!from && !servicio)) return respuesta({ paso, ok: false, problema: 'Faltan variables de Twilio (SID, token o número FROM).' })
  if (!destino || !/^\+\d{8,15}$/.test(destino)) return respuesta({ paso, ok: false, problema: 'PRUEBA_TWILIO_TO tiene que ser tu celular con + y código de país, sin espacios. Ej: +5491133694162' })

  // ---- Paso 1: envío DIRECTO por Twilio, con lo mínimo (sin nada de la app)
  if (paso === '1') {
    const datos = { to: `whatsapp:${destino}`, body: 'Prueba 1 de la app: si ves esto, Twilio y tus claves andan bien.' }
    if (servicio) datos.messagingServiceSid = servicio; else datos.from = from
    try {
      const msg = await require('twilio')(sid, auth).messages.create(datos)
      return respuesta({ paso: 1, ok: true, estado: msg.status, mensaje_sid: msg.sid, envio_con: Object.keys(datos),
        lectura: 'Twilio ACEPTÓ el mensaje. Mirá tu WhatsApp. Si no llega en 1 minuto, mirá Monitor > Logs > Messaging en Twilio.', siguiente: 'Probá ?paso=2' })
    } catch (e) {
      return respuesta({ paso: 1, ok: false, codigo_twilio: e.code ?? null, mensaje: String(e.message || e), mas_info: e.moreInfo ?? null, envio_con: Object.keys(datos),
        lectura: 'Twilio RECHAZÓ el envío directo. El código de arriba dice por qué (buscalo en twilio.com/docs/api/errors/<código>).' })
    }
  }

  // ---- Paso 2: envío por el MISMO código que usa la app al derivar un reporte
  if (paso === '2') {
    try {
      const { enviarPlantilla } = require('./lib/whatsapp')
      const r = await enviarPlantilla({
        numero: destino, plantilla: 'trabajo_nuevo',
        variables: ['Prueba', 'plomería', 'Edificio de prueba', '1A', 'normal', 'Esto es una prueba del sistema'],
        sufijoBoton: 'prueba-no-es-un-link-real',
      })
      return respuesta({ paso: 2, resultado: r,
        lectura: r.ok
          ? 'El código de la app FUNCIONA. Si el paso 1 también anduvo, el problema está antes: la app no llega a pedir el envío (consentimiento, teléfono, o no entra a esta parte).'
          : 'El código de la app FALLA donde el envío directo (paso 1) funciona, así que el problema está en el código publicado. Copiá el "error" completo.' })
    } catch (e) {
      return respuesta({ paso: 2, ok: false, error_inesperado: String(e.message || e) })
    }
  }

  // ---- Paso 3: plantilla PRE-APROBADA del sandbox (Appointment Reminder). No depende de la ventana de 24 h.
  if (paso === '3') {
    const sidPlantilla = /^HX[0-9a-fA-F]{32}$/.test(String(q.sid || '')) ? String(q.sid) : 'HXb5b62575e6e4ff6129ad7c8efe1f983e'
    const datos = { to: `whatsapp:${destino}`, contentSid: sidPlantilla, contentVariables: JSON.stringify({ 1: '26 de noviembre', 2: '20:00' }) }
    if (servicio) datos.messagingServiceSid = servicio; else datos.from = from
    try {
      const msg = await require('twilio')(sid, auth).messages.create(datos)
      return respuesta({ paso: 3, ok: true, estado: msg.status, mensaje_sid: msg.sid, plantilla: sidPlantilla, envio_con: Object.keys(datos),
        lectura: 'Twilio ACEPTÓ la plantilla pre-aprobada. Si te llega a WhatsApp, tu número, tus claves y el destino están bien: lo único que falla es el texto libre (ventana de 24 h).' })
    } catch (e) {
      return respuesta({ paso: 3, ok: false, codigo_twilio: e.code ?? null, mensaje: String(e.message || e), mas_info: e.moreInfo ?? null, plantilla: sidPlantilla, envio_con: Object.keys(datos),
        lectura: 'Twilio RECHAZÓ hasta la plantilla pre-aprobada. Entonces el problema es del remitente (FROM), del destino o de la cuenta, no de la ventana de 24 h.' })
    }
  }

  return respuesta({ problema: 'Paso desconocido. Usá paso=0, 1, 2 o 3.' })
}
