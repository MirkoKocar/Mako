// ============================================================================
// notificar — único punto de salida de notificaciones y links de la app.
// El navegador dice QUÉ pasó (tipo + id del reclamo); el servidor verifica que
// la persona realmente puede ver ese reclamo, decide a QUIÉN avisar y arma el
// texto. Así nadie puede usar esto para mandar mensajes truchos a otras
// personas ni para leer tokens o teléfonos ajenos.
// ============================================================================
const { json, getUser, userClient, adminClient, sha256, nuevoToken, baseUrl, sendPushTokens, sendWhatsapp } = require('./lib/common')

const HORAS_LINK = 72
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function tokensDe(admin, filtro) {
  let q = admin.from('fcm_tokens').select('token')
  for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v)
  const { data } = await q.limit(50)
  return (data || []).map(t => t.token)
}

async function avisar(admin, filtro, title, body, data) {
  const tokens = await tokensDe(admin, filtro)
  if (!tokens.length) return
  const r = await sendPushTokens(tokens, title, body, data).catch(() => null)
  if (r?.dead?.length) await admin.from('fcm_tokens').delete().in('token', r.dead)
}

// Aviso al proveedor: push si tiene la app/notificaciones; si no tiene ningún dispositivo registrado, WhatsApp
// (queda inactivo hasta cargar las variables de WhatsApp en Netlify; ver SETUP.md).
async function avisarProveedor(admin, provId, title, body, data) {
  const tokens = await tokensDe(admin, { user_id: provId, rol: 'proveedor' })
  if (tokens.length) return avisar(admin, { user_id: provId, rol: 'proveedor' }, title, body, data)
  const { data: prov } = await admin.from('proveedores').select('telefono').eq('id', provId).limit(1)
  return sendWhatsapp(prov?.[0]?.telefono, null)
}

async function crearEnlace(admin, aviso) {
  await admin.from('enlaces_proveedor').update({ revocado: true }).eq('aviso_id', aviso.id)
  const token = nuevoToken()
  const { error } = await admin.from('enlaces_proveedor').insert({
    aviso_id: aviso.id, proveedor_id: aviso.proveedor_id, token_hash: sha256(token),
    expires_at: new Date(Date.now() + HORAS_LINK * 3600 * 1000).toISOString(),
  })
  if (error) throw error
  await admin.from('avisos').update({ enlace_enviado_at: new Date().toISOString() }).eq('id', aviso.id)
  return `${baseUrl()}/t/${token}`
}

// Avisa al proveedor (push + WhatsApp con link) y devuelve el link
async function derivarAProveedor(admin, aviso, unidad) {
  const link = await crearEnlace(admin, aviso)
  const { data: prov } = await admin.from('proveedores').select('telefono').eq('id', aviso.proveedor_id).limit(1)
  const titulo = `${aviso.categoria}: ${aviso.titulo}`.slice(0, 120)
  await avisar(admin, { user_id: aviso.proveedor_id, rol: 'proveedor' }, '🔧 Nuevo trabajo asignado',
    `${unidad} · ${titulo}`, { tipo: 'trabajo', aviso_id: aviso.id })
  const wa = await sendWhatsapp(prov?.[0]?.telefono, link)
  return { link, telefono: prov?.[0]?.telefono || null, whatsapp: wa.sent }
}

const unidadDe = (aviso, vec) => `${aviso.edificio_nombre || 'Consorcio'} - Depto ${vec?.departamento || '?'}`

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })
  const ses = await getUser(event)
  if (!ses) return json(401, { error: 'No autorizado' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'JSON inválido' }) }
  const tipo = String(body.tipo || '')
  const me = userClient(ses.jwt)
  const admin = adminClient()

  try {
    const { data: perfil } = await me.from('perfiles').select('rol, persona_id, edificio_id').eq('auth_user_id', ses.user.id).limit(1)
    const p = perfil?.[0]
    if (!p) return json(403, { error: 'Sin perfil' })

    // --- Tablón: solo admin del edificio ---
    if (tipo === 'tablon') {
      if (p.rol !== 'admin' || !UUID.test(body.edificioId || '')) return json(403, { error: 'No autorizado' })
      const { data: ok } = await me.from('edificios').select('id').eq('id', body.edificioId).limit(1)   // RLS: solo si es suyo
      if (!ok?.length) return json(403, { error: 'No autorizado' })
      const emoji = body.subtipo === 'votacion' ? '🗳️' : body.subtipo === 'anuncio' ? '🔴' : '📢'
      await avisar(admin, { edificio_id: body.edificioId, rol: 'vecino' }, `${emoji} Nuevo en el Tablón`, String(body.titulo || '').slice(0, 120), { tipo: 'tablon' })
      return json(200, { ok: true })
    }

    if (!UUID.test(body.avisoId || '')) return json(400, { error: 'avisoId inválido' })
    // Si la persona no puede ver este reclamo, RLS devuelve vacío => 404
    const { data: avs } = await me.from('avisos').select('*, vecinos(nombre, departamento), edificios(nombre)').eq('id', body.avisoId).limit(1)
    const a = avs?.[0]
    if (!a) return json(404, { error: 'Reclamo no encontrado' })
    a.edificio_nombre = a.edificios?.nombre
    const unidad = unidadDe(a, a.vecinos)
    const dataPush = { aviso_id: a.id }
    const adminsFiltro = { edificio_id: a.edificio_id, rol: 'admin' }
    const vecinoFiltro = { user_id: a.vecino_id, rol: 'vecino' }
    const provFiltro = a.proveedor_id ? { user_id: a.proveedor_id, rol: 'proveedor' } : null
    const soyVecinoDuenio = p.rol === 'vecino' && p.persona_id === a.vecino_id
    const soyAdmin = p.rol === 'admin'
    const soyProv = p.rol === 'proveedor' && p.persona_id === a.proveedor_id

    switch (tipo) {
      case 'nuevo_aviso': {
        if (!soyVecinoDuenio || !a.enviado_at) return json(403, { error: 'No autorizado' })
        if (a.fase === 'derivado' && a.autorizado_por === 'auto') {
          const r = await derivarAProveedor(admin, a, unidad)
          await avisar(admin, adminsFiltro, '⚡ Autorizado automáticamente',
            `${unidad}: ${a.titulo}. Regla automática → ${a.proveedor_nombre}`, { tipo: 'auto', ...dataPush })
          return json(200, { ok: true, auto: true, whatsapp: r.whatsapp })
        }
        await avisar(admin, adminsFiltro, `📋 ${unidad}`, `${a.titulo}. Urgencia: ${a.urgencia === 'alta' ? 'ALTA' : a.urgencia === 'media' ? 'Media' : 'Baja'}`, { tipo: 'aviso_admin', ...dataPush })
        return json(200, { ok: true })
      }
      case 'derivado': {      // admin autorizó (o pidió reenviar el link)
        if (!soyAdmin || !['derivado', 'en_camino'].includes(a.fase) || !a.proveedor_id) return json(403, { error: 'No autorizado' })
        const r = await derivarAProveedor(admin, a, unidad)
        if (!body.reenviar) await avisar(admin, vecinoFiltro, '✅ Reporte autorizado', `Tu reporte "${a.titulo}" fue enviado al proveedor.`, { tipo: 'autorizado', ...dataPush })
        return json(200, { ok: true, link: r.link, telefono: r.telefono, whatsapp: r.whatsapp, proveedor: a.proveedor_nombre })
      }
      case 'rechazado':
        if (!soyAdmin || a.fase !== 'rechazado') return json(403, { error: 'No autorizado' })
        await avisar(admin, vecinoFiltro, '❌ Reporte rechazado', `"${a.titulo}": ${String(a.motivo_rechazo || '').slice(0, 140)}`, { tipo: 'rechazado', ...dataPush })
        return json(200, { ok: true })
      case 'privado':
        if (!soyAdmin || a.fase !== 'privado') return json(403, { error: 'No autorizado' })
        await avisar(admin, vecinoFiltro, '📞 Te pasamos el contacto de un proveedor', `Sobre "${a.titulo}": revisá el chat con el administrador.`, { tipo: 'privado', ...dataPush })
        return json(200, { ok: true })
      case 'info':
        if (!soyAdmin || a.fase !== 'info_solicitada') return json(403, { error: 'No autorizado' })
        await avisar(admin, vecinoFiltro, '❓ El administrador necesita más información', `Sobre "${a.titulo}": ${String(a.motivo_info || '').slice(0, 140)}`, { tipo: 'info', ...dataPush })
        return json(200, { ok: true })
      case 'info_respondida':
        if (!soyVecinoDuenio || a.fase !== 'pendiente_admin') return json(403, { error: 'No autorizado' })
        await avisar(admin, adminsFiltro, `💬 ${unidad}`, `Respondió tu pedido de información: ${a.titulo}`, { tipo: 'aviso_admin', ...dataPush })
        return json(200, { ok: true })
      case 'aceptado':
        if (!soyProv || a.fase !== 'en_camino') return json(403, { error: 'No autorizado' })
        await avisar(admin, adminsFiltro, '🚗 Proveedor en camino', `${a.proveedor_nombre} aceptó: ${unidad} · ${a.titulo}`, { tipo: 'aceptado', ...dataPush })
        await avisar(admin, vecinoFiltro, '🚗 Tu proveedor va en camino', `${a.proveedor_nombre} aceptó tu reporte "${a.titulo}".`, { tipo: 'aceptado', ...dataPush })
        return json(200, { ok: true })
      case 'no_puede': {
        if (!(soyProv || soyAdmin && a.fase === 'pendiente_admin')) {
          // el proveedor ya no es el asignado (se reasignó): solo lo dejamos pasar si el reclamo cambió
          if (!(p.rol === 'proveedor' && (a.proveedores_descartados || []).includes(p.persona_id))) return json(403, { error: 'No autorizado' })
        }
        if (a.fase === 'derivado' && a.autorizado_por === 'auto' && a.proveedor_id) {
          await derivarAProveedor(admin, a, unidad)   // pasó al siguiente proveedor
          await avisar(admin, adminsFiltro, 'ℹ️ Reasignado automáticamente', `${unidad}: el proveedor anterior no pudo. Ahora: ${a.proveedor_nombre}`, { tipo: 'auto', ...dataPush })
        } else {
          await avisar(admin, adminsFiltro, '⚠️ El proveedor no puede ir', `${unidad} · ${a.titulo}. Elegí otro proveedor.`, { tipo: 'aviso_admin', ...dataPush })
        }
        return json(200, { ok: true })
      }
      case 'finalizado':
        if (!soyProv || a.fase !== 'finalizado_proveedor') return json(403, { error: 'No autorizado' })
        await avisar(admin, adminsFiltro, '🏁 Trabajo finalizado', `${unidad} · ${a.titulo}. Confirmá para cerrar el reclamo.`, { tipo: 'finalizado', ...dataPush })
        await avisar(admin, vecinoFiltro, '🏁 Trabajo finalizado', `"${a.titulo}" quedó finalizado. Confirmá que está resuelto.`, { tipo: 'finalizado', ...dataPush })
        return json(200, { ok: true })
      case 'confirmar':
        if (!soyAdmin && !soyVecinoDuenio) return json(403, { error: 'No autorizado' })
        if (a.fase === 'cerrado') {
          await avisar(admin, soyAdmin ? vecinoFiltro : adminsFiltro, '✅ Reclamo cerrado', `"${a.titulo}" fue confirmado por ambos.`, { tipo: 'cerrado', ...dataPush })
        } else if (a.fase === 'finalizado_proveedor') {
          await avisar(admin, soyAdmin ? vecinoFiltro : adminsFiltro, '✅ Falta tu confirmación',
            `${soyAdmin ? 'El administrador' : 'El vecino'} marcó como resuelto: ${a.titulo}`, { tipo: 'confirmar_resuelto', ...dataPush })
        }
        return json(200, { ok: true })
      case 'mensaje': {
        const texto = String(body.contenido || '').slice(0, 140)
        const quien = soyAdmin ? 'Administrador' : soyProv ? (a.proveedor_nombre || 'Proveedor') : (a.vecinos?.nombre || 'Vecino')
        if (soyVecinoDuenio) { if (provFiltro) await avisarProveedor(admin, a.proveedor_id, `💬 ${quien}`, texto, { tipo: 'mensaje', ...dataPush }); await avisar(admin, adminsFiltro, `💬 ${quien}`, texto, { tipo: 'mensaje', ...dataPush }) }
        else if (soyProv) { await avisar(admin, vecinoFiltro, `💬 ${quien}`, texto, { tipo: 'mensaje', ...dataPush }); await avisar(admin, adminsFiltro, `💬 ${quien}`, texto, { tipo: 'mensaje', ...dataPush }) }
        else if (soyAdmin) { await avisar(admin, vecinoFiltro, `💬 ${quien}`, texto, { tipo: 'mensaje', ...dataPush }); if (provFiltro) await avisarProveedor(admin, a.proveedor_id, `💬 ${quien}`, texto, { tipo: 'mensaje', ...dataPush }) }
        else return json(403, { error: 'No autorizado' })
        return json(200, { ok: true })
      }
      default:
        return json(400, { error: 'Tipo desconocido' })
    }
  } catch (err) {
    console.error('notificar error:', err)
    return json(500, { error: 'No se pudo completar la notificación.' })
  }
}
