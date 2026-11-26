// ============================================================================
// trabajo-app — acciones con SESIÓN (vecino, administrador y proveedor registrado) sobre un trabajo:
// acuerdos y panel del administrador (estado del link y del WhatsApp). Las tablas nuevas no tienen políticas
// para usuarios, así que TODO pasa por acá: primero se verifica con la sesión de la persona (RLS) que
// puede ver el reclamo, y recién después se usa el service role con consultas acotadas.
// ============================================================================
const A = require('./lib/common')
const { json, getUser, userClient, adminClient, FASES_ACTIVAS, revocarEnlaces, registrarEvento, previewTrabajoNuevo, MOTIVOS, puedeRecibirWa, aE164 } = A

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACCIONES = ['estado', 'acuerdo_proponer', 'acuerdo_aceptar', 'acuerdo_decidir', 'estado_admin', 'preview_trabajo', 'revocar_link', 'historial_acuerdos']

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })
  const ses = await getUser(event)
  if (!ses) return json(401, { error: 'No autorizado' })
  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'JSON inválido' }) }
  const accion = String(body.accion || '')
  if (!ACCIONES.includes(accion)) return json(400, { error: 'Acción inválida' })

  let me, admin
  try {
    me = userClient(ses.jwt); admin = adminClient()
    const { data: perfil } = await me.from('perfiles').select('rol, persona_id, edificio_id').eq('auth_user_id', ses.user.id).limit(1)
    const p = perfil?.[0]
    if (!p) return json(403, { error: 'Sin perfil' })

    // Historial de acuerdos del edificio (AdminHistorial): varios reclamos a la vez
    if (accion === 'historial_acuerdos') {
      if (p.rol !== 'admin') return json(403, { error: 'No autorizado' })
      const ids = (Array.isArray(body.avisoIds) ? body.avisoIds : []).filter(i => UUID.test(i)).slice(0, 200)
      if (!ids.length) return json(200, { ok: true, acuerdos: {} })
      const { data: propios } = await me.from('avisos').select('id').in('id', ids)   // RLS: solo los de sus edificios
      const ok = (propios || []).map(x => x.id)
      if (!ok.length) return json(200, { ok: true, acuerdos: {} })
      const { data } = await admin.from('acuerdos').select(A.COLS + ', aviso_id').in('aviso_id', ok).order('created_at', { ascending: true })
      const por = {}
      for (const r of data || []) (por[r.aviso_id] ||= []).push(r)
      return json(200, { ok: true, acuerdos: por })
    }

    if (!UUID.test(body.avisoId || '')) return json(400, { error: 'avisoId inválido' })
    const { data: avs } = await me.from('avisos').select('id, edificio_id, vecino_id, proveedor_id, proveedor_nombre, titulo, categoria, fase, chat_pausado').eq('id', body.avisoId).limit(1)
    const a = avs?.[0]
    if (!a) return json(404, { error: 'Reclamo no encontrado' })

    const soyAdmin = p.rol === 'admin'
    const soyVecino = p.rol === 'vecino' && p.persona_id === a.vecino_id
    const soyProv = p.rol === 'proveedor' && p.persona_id === a.proveedor_id
    if (!soyAdmin && !soyVecino && !soyProv) return json(403, { error: 'No autorizado' })
    const rolParte = soyVecino ? 'vecino' : soyProv ? 'proveedor' : null

    const nombreVecino = async () => (await admin.from('vecinos').select('nombre').eq('id', a.vecino_id).limit(1)).data?.[0]?.nombre || ''

    switch (accion) {
      case 'estado': {
        const { vigente, rechazado } = await A.acuerdoVigente(admin, a.id)
        const { data: ed } = await admin.from('edificios').select('requiere_acuerdo').eq('id', a.edificio_id).limit(1)
        return json(200, { ok: true, acuerdo: vigente, acuerdo_rechazado: rechazado, chat_pausado: !!a.chat_pausado, fase: a.fase, requiere_acuerdo: !!ed?.[0]?.requiere_acuerdo })
      }

      case 'acuerdo_proponer': {
        if (!rolParte) return json(403, { error: 'Lo proponen el vecino o el proveedor.' })
        const r = await A.proponer(admin, a, rolParte, body)
        if (r.error) return json(r.status || 400, { error: r.error })
        await A.notificarAcuerdo(admin, a, { evento: 'propuesto', por: rolParte, acuerdo: r.acuerdo, vecinoNombre: await nombreVecino() })
        return json(200, { ok: true, acuerdo: r.acuerdo })
      }

      case 'acuerdo_aceptar': {
        if (!rolParte) return json(403, { error: 'Lo acepta el vecino o el proveedor.' })
        const r = await A.aceptar(admin, a, rolParte, body.acuerdoId)
        if (r.error) return json(r.status || 400, { error: r.error })
        await A.notificarAcuerdo(admin, a, { evento: 'aceptado', por: rolParte, acuerdo: r.acuerdo })
        return json(200, { ok: true, acuerdo: r.acuerdo })
      }

      case 'acuerdo_decidir': {
        if (!soyAdmin) return json(403, { error: 'Solo el administrador aprueba o rechaza.' })
        const aprobar = body.aprobar === true
        const r = await A.decidir(admin, a, body.acuerdoId, aprobar, body.motivo)
        if (r.error) return json(r.status || 400, { error: r.error })
        await A.notificarAcuerdo(admin, a, { evento: aprobar ? 'aprobado' : 'rechazado', por: 'admin', acuerdo: r.acuerdo })
        return json(200, { ok: true, acuerdo: r.acuerdo })
      }

      // ---- Solo administrador ----
      case 'preview_trabajo': {
        if (!soyAdmin || !UUID.test(body.proveedorId || '')) return json(403, { error: 'No autorizado' })
        const pv = await previewTrabajoNuevo(admin, a.id, body.proveedorId, body.nota)
        if (!pv) return json(404, { error: 'No se pudo armar la vista previa' })
        return json(200, { ok: true, ...pv })
      }

      case 'revocar_link': {
        if (!soyAdmin) return json(403, { error: 'No autorizado' })
        await revocarEnlaces(admin, a.id, 'admin')
        const { data: en } = await admin.from('enlaces_proveedor').select('id').eq('aviso_id', a.id).order('created_at', { ascending: false }).limit(1)
        if (en?.[0]) await registrarEvento(admin, en[0].id, 'revocado_por_admin')
        return json(200, { ok: true })
      }

      case 'estado_admin': {
        if (!soyAdmin) return json(403, { error: 'No autorizado' })
        const { vigente, rechazado } = await A.acuerdoVigente(admin, a.id)
        const [{ data: en }, { data: wa }, { data: pv }] = await Promise.all([
          admin.from('enlaces_proveedor').select('id, revocado, revocado_motivo, expires_at, aceptado_at, primer_acceso_at, ultimo_acceso_at, created_at, proveedor_id').eq('aviso_id', a.id).order('created_at', { ascending: false }).limit(1),
          admin.from('notificaciones_whatsapp').select('plantilla, estado, error, canal, created_at, updated_at').eq('aviso_id', a.id).order('created_at', { ascending: false }).limit(5),
          a.proveedor_id ? admin.from('proveedores').select('nombre, telefono, whatsapp_optin_at, whatsapp_optout_at').eq('id', a.proveedor_id).limit(1) : Promise.resolve({ data: [] }),
        ])
        const e = en?.[0] || null
        const prov = pv?.[0] || null
        const activo = !!(e && !e.revocado && new Date(e.expires_at) > new Date() && FASES_ACTIVAS.includes(a.fase) && e.proveedor_id === a.proveedor_id)
        let eventos = []
        if (e) eventos = (await admin.from('enlace_eventos').select('evento, created_at').eq('enlace_id', e.id).order('created_at', { ascending: false }).limit(8)).data || []
        const chk = prov ? puedeRecibirWa(prov) : { ok: false, motivo: 'sin_telefono' }
        return json(200, {
          ok: true,
          enlace: e && { activo, revocado: e.revocado, motivo_revocado: e.revocado_motivo, aceptado_at: e.aceptado_at, primer_acceso_at: e.primer_acceso_at, ultimo_acceso_at: e.ultimo_acceso_at, creado_at: e.created_at },
          whatsapp: { ultimo: wa?.[0] || null, historial: wa || [], baja: !!prov?.whatsapp_optout_at, puede_enviar: chk.ok, motivo_no_envio: chk.ok ? null : MOTIVOS[chk.motivo] },
          proveedor: prov && { nombre: prov.nombre, telefono: aE164(prov.telefono) || prov.telefono },
          acuerdo: vigente, acuerdo_rechazado: rechazado, chat_pausado: !!a.chat_pausado, eventos,
        })
      }
    }
    return json(400, { error: 'Acción inválida' })
  } catch (err) {
    console.error('trabajo-app error:', err?.message || 'desconocido')
    return json(500, { error: 'No se pudo completar. Probá de nuevo.' })
  }
}

