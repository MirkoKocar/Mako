// ============================================================================
// whatsapp-entrante — webhook de MENSAJES ENTRANTES de Twilio ("When a message comes in").
// URL para cargar en Twilio:  <SITE_URL>/.netlify/functions/whatsapp-entrante
//  · BAJA / STOP  -> el proveedor deja de recibir avisos (whatsapp_optout_at) y se le avisa al administrador.
//  · ALTA         -> se reactiva.
// Valida X-Twilio-Signature con la librería de Twilio.
// ============================================================================
const { adminClient } = require('./lib/common')
const { leerParametros, firmaValida } = require('./lib/common')
const { avisarAdmins } = require('./lib/common')
const { normalizarTelefonoAR } = require('./lib/common')

const xml = (texto) => ({
  statusCode: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' },
  body: `<?xml version="1.0" encoding="UTF-8"?><Response>${texto ? `<Message>${String(texto).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</Message>` : ''}</Response>`,
})

const limpiar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
const BAJA = ['baja', 'stop', 'stopall', 'unsubscribe', 'cancelar', 'parar']
const ALTA = ['alta', 'start', 'unstop', 'reactivar']

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }
  const params = leerParametros(event)
  if (!firmaValida(event, params, 'whatsapp-entrante')) return { statusCode: 403, body: 'Firma inválida' }

  const e164 = normalizarTelefonoAR(String(params.From || '').replace(/^whatsapp:/, ''))
  if (!e164) return xml('')
  const palabra = limpiar(params.Body)
  const admin = adminClient()

  try {
    // El mismo proveedor puede estar cargado en varios edificios: se ven todas las filas con ese número
    const { data: cand } = await admin.from('proveedores').select('id, nombre, telefono, edificio_id, whatsapp_optin_at, whatsapp_optout_at').is('eliminado_at', null).not('telefono', 'is', null).limit(5000)   // los teléfonos viejos pueden tener espacios o guiones: se comparan ya normalizados
    const filas = (cand || []).filter(p => normalizarTelefonoAR(p.telefono) === e164)
    if (!filas.length) return xml('')

    if (BAJA.includes(palabra)) {
      const ahora = new Date().toISOString()
      await admin.from('proveedores').update({ whatsapp_optout_at: ahora }).in('id', filas.map(f => f.id))
      for (const f of filas) {
        await avisarAdmins(admin, f.edificio_id, '🔕 Proveedor dado de baja de WhatsApp',
          `${f.nombre} respondió BAJA y ya no recibe avisos por WhatsApp. Coordiná con él por otro medio o pedile que responda ALTA.`, { tipo: 'wa_baja' }).catch(() => {})
      }
      return xml('Listo, no vas a recibir más avisos de trabajo por WhatsApp. Si querés volver a recibirlos, respondé ALTA.')
    }
    if (ALTA.includes(palabra)) {
      for (const f of filas) {
        // Responder ALTA es consentimiento propio: si el admin nunca lo había registrado, queda registrado ahora
        await admin.from('proveedores').update({ whatsapp_optout_at: null, whatsapp_optin_at: f.whatsapp_optin_at || new Date().toISOString() }).eq('id', f.id)
        await avisarAdmins(admin, f.edificio_id, '🔔 Proveedor reactivado en WhatsApp', `${f.nombre} respondió ALTA y vuelve a recibir avisos.`, { tipo: 'wa_alta' }).catch(() => {})
      }
      return xml('Listo, vas a volver a recibir avisos de trabajo por WhatsApp.')
    }
    return xml('Para responder un trabajo usá el botón del mensaje con el link. Respondé BAJA para no recibir más avisos.')
  } catch (err) {
    console.error('whatsapp-entrante error:', err?.message || 'desconocido')
    return { statusCode: 500, body: 'Error' }
  }
}
