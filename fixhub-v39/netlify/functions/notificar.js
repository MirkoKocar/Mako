// ============================================================================
// notificar — único punto de salida de notificaciones y links de la app (v38: los avisos y el WhatsApp
// viven en lib/eventos.js y lib/proveedor-wa.js, compartidos con trabajo-link.js).
// El navegador dice QUÉ pasó (tipo + id del reclamo); el servidor verifica que
// la persona realmente puede ver ese reclamo, decide a QUIÉN avisar y arma el
// texto. Así nadie puede usar esto para mandar mensajes truchos a otras
// personas ni para leer tokens o teléfonos ajenos.
// ============================================================================
const E = require('./lib/common')
const { json, getUser, userClient, adminClient, avisar, tokensDe, marcarNovedad } = E

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Aviso al proveedor por un mensaje del hilo: push si tiene la app; si no (proveedor por link),
// WhatsApp con el MISMO link, solo si no tiene la página abierta y agrupado (máx. 1 cada 10 min).
async function avisarProveedorMensaje(admin, provId, avisoId, title, body, data) {
  const tokens = await tokensDe(admin, { user_id: provId, rol: 'proveedor' })
  if (tokens.length) return avisar(admin, { user_id: provId, rol: 'proveedor' }, title, body, data)
  return marcarNovedad(admin, avisoId, { tipo: 'mensaje' })
}

const unidadDe = (aviso, vec) => E.unidadDe(aviso.edificio_nombre, vec?.departamento)

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
          const r = await E.derivar(admin, a, unidad)
          await avisar(admin, adminsFiltro, '⚡ Autorizado automáticamente',
            `${unidad}: ${a.titulo}. Regla automática → ${a.proveedor_nombre}`, { tipo: 'auto', ...dataPush })
          return json(200, { ok: true, auto: true, whatsapp: r.whatsapp })
        }
        // ¿Hay proveedores cargados de este rubro? Si no (o si faltan para el mínimo), el aviso al admin lo dice
        let alerta = ''
        if (a.categoria !== 'Otro') {
          const { count } = await admin.from('proveedores').select('id', { count: 'exact', head: true }).eq('edificio_id', a.edificio_id).eq('especialidad', a.categoria).is('eliminado_at', null)
          const { data: ed } = await admin.from('edificios').select('min_proveedores_especialidad').eq('id', a.edificio_id).limit(1)
          const min = ed?.[0]?.min_proveedores_especialidad ?? 2
          if ((count || 0) === 0) alerta = ` · 🚫 No hay proveedor de ${a.categoria}: tenés que cargar uno.`
          else if ((count || 0) < min) alerta = ` · ⚠️ Hay ${count} de ${a.categoria} (mínimo ${min}): cargá más para poder derivar.`
        }
        await avisar(admin, adminsFiltro, `📋 ${unidad}`, `${a.titulo}. Urgencia: ${a.urgencia === 'alta' ? 'ALTA' : a.urgencia === 'media' ? 'Media' : 'Baja'}${alerta}`, { tipo: 'aviso_admin', ...dataPush })
        return json(200, { ok: true })
      }
      case 'derivado': {      // admin autorizó (o pidió reenviar: se manda el MISMO link, no uno nuevo)
        if (!soyAdmin || !['derivado', 'en_camino'].includes(a.fase) || !a.proveedor_id) return json(403, { error: 'No autorizado' })
        const nota = typeof body.nota === 'string' ? body.nota : null      // nota corta del admin (la ve el proveedor)
        const r = await E.derivar(admin, a, unidad, { reenviar: !!body.reenviar, nota })
        if (!body.reenviar) await avisar(admin, vecinoFiltro, '✅ Reporte autorizado', `Tu reporte "${a.titulo}" fue enviado al proveedor.`, { tipo: 'autorizado', ...dataPush })
        return json(200, { ok: true, link: r.link, telefono: r.telefono, whatsapp: r.whatsapp, whatsapp_motivo: r.motivo, whatsapp_error: r.error, reutilizado: r.reutilizado, proveedor: a.proveedor_nombre })
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
        await E.postAceptado(admin, a, unidad)
        return json(200, { ok: true })
      case 'no_puede': {
        if (!(soyProv || soyAdmin && a.fase === 'pendiente_admin')) {
          // el proveedor ya no es el asignado (se reasignó): solo lo dejamos pasar si el reclamo cambió
          if (!(p.rol === 'proveedor' && (a.proveedores_descartados || []).includes(p.persona_id))) return json(403, { error: 'No autorizado' })
        }
        await E.postNoPuede(admin, a, unidad)        // pasa al siguiente (regla automática) o vuelve al administrador
        return json(200, { ok: true })
      }
      case 'finalizado':
        if (!soyProv || a.fase !== 'finalizado_proveedor') return json(403, { error: 'No autorizado' })
        await E.postFinalizado(admin, a, unidad)
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
      case 'mensaje':
      case 'mensaje_liberado': {
        // El servidor lee el mensaje real de la base (no confía en el texto que manda el navegador) y respeta la
        // retención por datos de contacto: un mensaje retenido NO se le avisa a la otra parte.
        if (!UUID.test(body.mensajeId || '')) return json(400, { error: 'mensajeId inválido' })
        const { data: ms } = await admin.from('mensajes').select('id, contenido, imagen_url, remitente_rol, es_nota_interna, bloqueado, liberado').eq('id', body.mensajeId).eq('aviso_id', a.id).limit(1)
        const m = ms?.[0]
        if (!m) return json(404, { error: 'Mensaje no encontrado' })
        const rolCaller = soyAdmin ? 'admin' : soyProv ? 'proveedor' : soyVecinoDuenio ? 'vecino' : null
        if (!rolCaller) return json(403, { error: 'No autorizado' })
        if (tipo === 'mensaje' && m.remitente_rol !== rolCaller) return json(403, { error: 'No autorizado' })
        if (tipo === 'mensaje_liberado' && (!soyAdmin || !m.liberado)) return json(403, { error: 'No autorizado' })
        if (m.es_nota_interna) return json(200, { ok: true })
        if (m.bloqueado && !m.liberado) {
          await avisar(admin, adminsFiltro, '🛡️ Mensaje retenido', `${unidad}: contiene datos de contacto. Revisalo para liberarlo o no.`, { tipo: 'mensaje_retenido', ...dataPush })
          return json(200, { ok: true, bloqueado: true })
        }
        const texto = (m.contenido || (m.imagen_url ? '📷 Foto' : '')).slice(0, 140)
        const origen = m.remitente_rol
        const quien = origen === 'admin' ? 'Administrador' : origen === 'proveedor' ? (a.proveedor_nombre || 'Proveedor') : (a.vecinos?.nombre || 'Vecino')
        const tit = `💬 ${quien}`, dp = { tipo: 'mensaje', ...dataPush }
        if (origen === 'vecino') {
          if (provFiltro) await avisarProveedorMensaje(admin, a.proveedor_id, a.id, tit, texto, dp)
          if (tipo === 'mensaje') await avisar(admin, adminsFiltro, tit, texto, dp)
        } else if (origen === 'proveedor') {
          await avisar(admin, vecinoFiltro, tit, texto, dp)
          if (tipo === 'mensaje') await avisar(admin, adminsFiltro, tit, texto, dp)
        } else {
          await avisar(admin, vecinoFiltro, tit, texto, dp)
          if (provFiltro) await avisarProveedorMensaje(admin, a.proveedor_id, a.id, tit, texto, dp)
        }
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
