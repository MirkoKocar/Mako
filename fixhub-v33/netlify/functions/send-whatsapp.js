// ============================================================================
// send-whatsapp — manda un WhatsApp automático al proveedor avisándole que
// tiene una novedad en MAKO (no reenvía el contenido del mensaje, solo avisa).
//
// ⚠️ PENDIENTE DE TU LADO (esto no lo puedo completar yo, son datos tuyos):
//   1. Crear una cuenta de Meta Business (business.facebook.com) — gratis.
//   2. Dentro de esa cuenta, activar "WhatsApp" en Meta for Developers
//      (developers.facebook.com) y agregar/verificar un número de teléfono.
//   3. Ahí Meta te va a dar dos datos: un "Phone Number ID" y un "Access Token".
//      Pegalos abajo, reemplazando los placeholders.
//   4. Crear una plantilla de mensaje (categoría "Utility") con un texto como:
//      "Tenés una novedad en MAKO. Ingresá a la app para verla." — Meta la
//      tiene que aprobar (suele tardar de minutos a un par de días). El nombre
//      exacto que le pongas a la plantilla va en WHATSAPP_TEMPLATE_NAME.
// ============================================================================

// Igual que con Firebase: estos datos ahora se leen de variables de entorno
// de Netlify en vez de estar escritos en el código (así no quedan en el
// historial de GitHub). Cargalos en Netlify cuando tengas la cuenta de Meta
// lista — ver SETUP_SEGURIDAD.md.
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || ''
const WHATSAPP_ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN || ''
const WHATSAPP_TEMPLATE_NAME   = process.env.WHATSAPP_TEMPLATE_NAME || 'aviso_fixhub'
const WHATSAPP_TEMPLATE_LANG   = process.env.WHATSAPP_TEMPLATE_LANG || 'es_AR'

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    console.warn('send-whatsapp: faltan las variables de entorno WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN en Netlify')
    return { statusCode: 200, body: JSON.stringify({ sent: false, motivo: 'Credenciales de Meta sin configurar todavía.' }) }
  }

  try {
    const { numero } = JSON.parse(event.body)
    if (!numero) return { statusCode: 400, body: 'Falta el número de WhatsApp del proveedor.' }

    // El número tiene que ir en formato internacional sin '+' ni espacios (ej: 5491122334455)
    const numeroLimpio = String(numero).replace(/\D/g, '')

    const res = await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numeroLimpio,
        type: 'template',
        template: {
          name: WHATSAPP_TEMPLATE_NAME,
          language: { code: WHATSAPP_TEMPLATE_LANG },
        },
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('send-whatsapp error de Meta:', data)
      return { statusCode: 200, body: JSON.stringify({ sent: false, error: data?.error?.message || 'Error desconocido de Meta' }) }
    }

    return { statusCode: 200, body: JSON.stringify({ sent: true }) }
  } catch (err) {
    console.error('send-whatsapp error:', err)
    return { statusCode: 500, body: err.message }
  }
}
