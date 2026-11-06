// ============================================================================
// proveedor-acceso — canjea el link que recibe el proveedor por una sesión real
// (sin usuario ni contraseña). El link es un secreto de un solo reclamo:
//  - en la base se guarda solo su HASH (si se filtra la base, los links no sirven)
//  - vence a las 72 h y se revoca al reenviarlo o al reasignar el trabajo
//  - la sesión resultante es de ese proveedor y por RLS solo ve SUS trabajos
// ============================================================================
const { json, adminClient, sha256 } = require('./lib/common')

const TERMINOS_VERSION = '2026-09'
const intentos = new Map()   // freno simple por IP (por instancia de la función)

function limitar(ip) {
  const ahora = Date.now()
  const ventana = (intentos.get(ip) || []).filter(t => ahora - t < 10 * 60 * 1000)
  ventana.push(ahora); intentos.set(ip, ventana)
  return ventana.length > 30
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })
  const ip = (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'x').split(',')[0].trim()
  if (limitar(ip)) return json(429, { error: 'Demasiados intentos. Probá en unos minutos.' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'JSON inválido' }) }
  const token = String(body.token || '')
  if (token.length < 30 || token.length > 100 || !/^[A-Za-z0-9_-]+$/.test(token)) return json(400, { error: 'Link inválido' })
  if (body.aceptaTerminos !== true) return json(400, { error: 'Tenés que aceptar los Términos y la Política de Privacidad.' })

  const admin = adminClient()
  try {
    const { data: enl } = await admin.from('enlaces_proveedor').select('*').eq('token_hash', sha256(token)).limit(1)
    const e = enl?.[0]
    if (!e || e.revocado || new Date(e.expires_at) < new Date()) {
      return json(410, { error: 'Este link venció o ya no es válido. Pedile uno nuevo al administrador.' })
    }
    const { data: avs } = await admin.from('avisos').select('id, fase, proveedor_id, edificio_id').eq('id', e.aviso_id).limit(1)
    const a = avs?.[0]
    if (!a || a.proveedor_id !== e.proveedor_id || !['derivado', 'en_camino'].includes(a.fase)) {
      return json(410, { error: 'Este trabajo ya no está asignado a vos. Pedile un link nuevo al administrador.' })
    }
    const { data: provs } = await admin.from('proveedores').select('*').eq('id', e.proveedor_id).limit(1)
    const prov = provs?.[0]
    if (!prov || prov.eliminado_at) return json(410, { error: 'Proveedor no disponible.' })

    // Usuario real del proveedor (se crea la primera vez; queda vinculado)
    let email = null, userId = prov.auth_user_id
    if (userId) {
      const { data: u } = await admin.auth.admin.getUserById(userId)
      email = u?.user?.email || null
    }
    if (!email) {
      email = `proveedor-${prov.id}@acceso.fixhub.invalid`
      const { data: creado, error: eC } = await admin.auth.admin.createUser({
        email, email_confirm: true, user_metadata: { proveedor_id: prov.id },
      })
      if (eC && !/already|registered|exists/i.test(eC.message || '')) throw eC
      if (creado?.user) userId = creado.user.id
      else {
        const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        userId = lista?.users?.find(u => u.email === email)?.id
      }
      if (!userId) throw new Error('No se pudo crear el acceso del proveedor')
      await admin.from('proveedores').update({ auth_user_id: userId }).eq('id', prov.id)
    }

    await admin.auth.admin.updateUserById(userId, { user_metadata: { proveedor_id: prov.id, terminos_version: TERMINOS_VERSION, terminos_aceptados_at: new Date().toISOString() } })
    await admin.from('perfiles').upsert({
      auth_user_id: userId, rol: 'proveedor', edificio_id: prov.edificio_id, persona_id: prov.id, nombre: prov.nombre,
      terminos_version: TERMINOS_VERSION, terminos_aceptados_at: new Date().toISOString(),
    }, { onConflict: 'auth_user_id' })

    const { data: gl, error: eL } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (eL || !gl?.properties?.hashed_token) throw eL || new Error('sin link')

    await admin.from('enlaces_proveedor').update({ usos: (e.usos || 0) + 1, last_used_at: new Date().toISOString() }).eq('id', e.id)
    return json(200, { token_hash: gl.properties.hashed_token, aviso_id: a.id })
  } catch (err) {
    console.error('proveedor-acceso error:', err)
    return json(500, { error: 'No se pudo abrir el link. Probá de nuevo o pedile otro al administrador.' })
  }
}
