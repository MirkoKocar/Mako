// ============================================================================
// whatsapp-estado — webhook de ESTADO de Twilio (statusCallback): enviado / entregado / leído / fallido.
// URL para cargar en Twilio:  <SITE_URL>/.netlify/functions/whatsapp-estado
// Valida X-Twilio-Signature con la librería de Twilio. Guarda el estado en notificaciones_whatsapp y,
// si falla, le avisa al administrador para que lo mande a mano (wa.me).
// ============================================================================
const { adminClient } = require('./lib/common')
const { leerParametros, firmaValida } = require('./lib/common')
const { avisarAdmins } = require('./lib/common')

const MAPA = { queued: 'enviado', accepted: 'enviado', scheduled: 'enviado', sending: 'enviado', sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido', undelivered: 'fallido' }
const RANGO = { enviado: 1, entregado: 2, leido: 3, fallido: 0 }

const ok = { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: '' }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }
  const params = leerParametros(event)
  if (!firmaValida(event, params, 'whatsapp-estado')) return { statusCode: 403, body: 'Firma inválida' }

  const sid = String(params.MessageSid || params.SmsSid || '')
  const nuevo = MAPA[String(params.MessageStatus || params.SmsStatus || '').toLowerCase()]
  if (!sid || !nuevo) return ok

  const admin = adminClient()
  try {
    const { data } = await admin.from('notificaciones_whatsapp').select('id, aviso_id, proveedor_id, plantilla, estado').eq('sid', sid).limit(1)
    const fila = data?.[0]
    if (!fila) return ok                                  // no es un mensaje nuestro (o ya se borró)

    // Los avisos de Twilio pueden llegar desordenados: un estado "más avanzado" no se pisa con uno anterior
    if (nuevo === 'fallido' ? fila.estado !== 'enviado' : RANGO[nuevo] <= RANGO[fila.estado]) return ok

    const error = nuevo === 'fallido'
      ? `Twilio ${params.ErrorCode || ''} ${String(params.ErrorMessage || '').slice(0, 200)}`.replace(/\s+/g, ' ').trim()
      : null
    await admin.from('notificaciones_whatsapp').update({ estado: nuevo, error, updated_at: new Date().toISOString() }).eq('id', fila.id)

    if (nuevo === 'fallido') {
      const [{ data: av }, { data: pv }] = await Promise.all([
        admin.from('avisos').select('id, edificio_id, titulo').eq('id', fila.aviso_id).limit(1),
        fila.proveedor_id ? admin.from('proveedores').select('nombre').eq('id', fila.proveedor_id).limit(1) : Promise.resolve({ data: [] }),
      ])
      if (av?.[0]) {
        await avisarAdmins(admin, av[0].edificio_id, '⚠️ WhatsApp no entregado',
          `${pv?.[0]?.nombre || 'El proveedor'} no recibió el aviso de "${av[0].titulo}". Enviáselo a mano desde el reclamo.`, { tipo: 'wa_fallo', aviso_id: av[0].id }).catch(() => {})
      }
    }
  } catch (err) {
    console.error('whatsapp-estado error:', err?.message || 'desconocido')
    return { statusCode: 500, body: 'Error' }     // Twilio reintenta
  }
  return ok
}
