const { json, sendPushTokens } = require('./lib/common')

// Esta función ahora es SOLO INTERNA (la llama el cron scheduled-notifications
// con el secreto compartido). Antes cualquier usuario logueado podía mandarle
// una notificación a cualquier token; ahora las notificaciones de la app salen
// por "notificar", que decide los destinatarios en el servidor.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })
  const secreto = event.headers['x-internal-secret']
  if (!secreto || !process.env.INTERNAL_FUNCTION_SECRET || secreto !== process.env.INTERNAL_FUNCTION_SECRET) {
    return json(401, { error: 'No autorizado' })
  }
  try {
    const { tokens, title, body, data } = JSON.parse(event.body || '{}')
    if (!Array.isArray(tokens) || !tokens.length) return json(400, { error: 'No tokens' })
    const r = await sendPushTokens(tokens.slice(0, 500), String(title || '').slice(0, 100), String(body || '').slice(0, 300), data || {})
    return json(200, { sent: r.sent, failed: r.failed })
  } catch (err) {
    console.error('send-push error:', err)
    return json(500, { error: 'No se pudo enviar la notificación.' })
  }
}
