const { json } = require('./lib/common')
// Reemplazada por la lógica del servidor en "notificar" (los números de
// teléfono ya no viajan desde el navegador). Se deja cerrada a propósito.
exports.handler = async () => json(410, { error: 'Endpoint retirado. Las notificaciones salen por /.netlify/functions/notificar' })
