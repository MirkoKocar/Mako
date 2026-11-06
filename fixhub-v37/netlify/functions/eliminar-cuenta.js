// Elimina la cuenta de quien la pide: primero borra/anonimiza sus datos
// (función fh_eliminar_mis_datos, bajo las reglas de seguridad) y después
// borra el usuario de autenticación. Exige escribir la palabra ELIMINAR.
const { json, getUser, userClient, adminClient } = require('./lib/common')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })
  const ses = await getUser(event)
  if (!ses) return json(401, { error: 'No autorizado' })
  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'JSON inválido' }) }
  if (body.confirmacion !== 'ELIMINAR') return json(400, { error: 'Falta la confirmación.' })
  try {
    const { error: e1 } = await userClient(ses.jwt).rpc('fh_eliminar_mis_datos')
    if (e1) return json(400, { error: e1.message })
    const { error: e2 } = await adminClient().auth.admin.deleteUser(ses.user.id)
    if (e2) throw e2
    return json(200, { ok: true })
  } catch (err) {
    console.error('eliminar-cuenta error:', err)
    return json(500, { error: 'No se pudo eliminar la cuenta. Escribinos al email de contacto y lo hacemos a mano.' })
  }
}
