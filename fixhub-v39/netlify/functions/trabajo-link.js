// ============================================================================
// trabajo-link — TODO lo que el proveedor puede hacer desde su link /t/<token>, sin cuenta ni sesión de Supabase.
//
// Reglas de oro:
//  - Lista cerrada de acciones (ACCIONES). Cualquier otra cosa se rechaza.
//  - El token llega por POST (nunca en la URL de la API) y NUNCA se escribe en logs.
//  - Se valida en CADA request: link existente, no revocado, no vencido (tope 60 días), reclamo en fase activa y
//    todavía asignado a este proveedor. Si algo falla, la respuesta es siempre la misma: 410 genérico.
//  - Service role solo con consultas acotadas a ESTE reclamo y con lista blanca de columnas (nunca select('*')).
//  - El proveedor nunca recibe teléfono ni apellido del vecino, ni ranking, ni otros reclamos, ni notas internas.
// ============================================================================
const A = require('./lib/common'), E = A
const { adminClient, hashToken, tokenValido, hashIp, FASES_ACTIVAS, MENSAJE_INACTIVO, registrarEvento, revocarEnlaces, contieneContacto, MENSAJE_BLOQUEO, BUCKET, MAX_MB, MIMES_PROVEEDOR, MAX_SUBIDAS_POR_LINK, limpiarNombre, prefijoDe, rutaPermitida, validarAdjuntosProveedor, firmar, avisarAdmins, sinContacto } = A

const ACCIONES = ['ver', 'aceptar', 'pedir_presupuesto', 'enviar_presupuesto', 'no_puede', 'enviar_mensaje', 'pedir_url_subida', 'proponer_acuerdo', 'aceptar_acuerdo', 'finalizar']

const MAX_FALLOS_IP = 20, VENTANA_IP_SEG = 15 * 60
const MAX_BODY = 40000

const COLS_AVISO = 'id, edificio_id, vecino_id, proveedor_id, proveedor_nombre, titulo, descripcion, categoria, urgencia, fase, adjuntos, ' +
  'chat_pausado, nota_proveedor, presupuesto_pedido_at, presupuesto, nota_cierre, cierre_adjuntos, autorizado_por, aceptado_at, finalizado_at'
const COLS_ENLACE = 'id, aviso_id, proveedor_id, revocado, expires_at, aceptado_at, primer_acceso_at, ultimo_acceso_at'

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
}
const resp = (statusCode, body) => ({ statusCode, headers: HEADERS, body: JSON.stringify(body) })
// Token inexistente, vencido o revocado: SIEMPRE la misma respuesta
const inactivo = () => resp(410, { error: MENSAJE_INACTIVO })

const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0] || ''
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : NaN }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return resp(405, { error: 'Método no permitido' })
  if ((event.body || '').length > MAX_BODY) return resp(413, { error: 'Pedido demasiado grande' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return resp(400, { error: 'JSON inválido' }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return resp(400, { error: 'Pedido inválido' })

  const h = event.headers || {}
  const ip = (h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || 'x').split(',')[0].trim()
  const ipHash = hashIp(ip)
  const userAgent = String(h['user-agent'] || '').slice(0, 200)

  let admin
  try { admin = adminClient() } catch (e) { console.error('trabajo-link: configuración incompleta'); return resp(500, { error: 'Servicio no disponible' }) }

  try {
    // Freno por IP guardado en la base: solo cuenta los tokens que no existen (intentos de adivinar)
    const { data: bloqueado } = await admin.rpc('fh_enlace_bloqueado', { p_ip_hash: ipHash, p_max: MAX_FALLOS_IP, p_ventana_seg: VENTANA_IP_SEG })
    if (bloqueado) return resp(429, { error: 'Demasiados intentos. Probá en unos minutos.' })

    const accion = String(body.accion || '')
    if (!ACCIONES.includes(accion)) return resp(400, { error: 'Acción inválida' })

    const token = body.token
    if (!tokenValido(token)) {
      await admin.rpc('fh_enlace_fallo', { p_ip_hash: ipHash, p_max: MAX_FALLOS_IP, p_ventana_seg: VENTANA_IP_SEG })
      return inactivo()
    }

    // ---- 1. Link ----
    const { data: enl } = await admin.from('enlaces_proveedor').select(COLS_ENLACE).eq('token_hash', hashToken(token)).limit(1)
    const e = enl?.[0]
    if (!e) {
      await admin.rpc('fh_enlace_fallo', { p_ip_hash: ipHash, p_max: MAX_FALLOS_IP, p_ventana_seg: VENTANA_IP_SEG })
      return inactivo()
    }
    if (e.revocado || new Date(e.expires_at) < new Date()) return inactivo()

    // ---- 2. Reclamo en fase activa y todavía de este proveedor ----
    const { data: avs } = await admin.from('avisos').select(COLS_AVISO).eq('id', e.aviso_id).limit(1)
    const a = avs?.[0]
    const { data: provs } = await admin.from('proveedores').select('id, nombre, eliminado_at').eq('id', e.proveedor_id).limit(1)
    const prov = provs?.[0]
    if (!a || !prov || prov.eliminado_at || a.proveedor_id !== e.proveedor_id || !FASES_ACTIVAS.includes(a.fase)) {
      await revocarEnlaces(admin, e.aviso_id, 'ya_no_activo')
      return inactivo()
    }

    // ---- 3. Registro de actividad (primer / último acceso) ----
    const ahora = new Date()
    const ultimo = e.ultimo_acceso_at ? new Date(e.ultimo_acceso_at) : null
    const upd = { ultimo_acceso_at: ahora.toISOString() }
    if (!e.primer_acceso_at) upd.primer_acceso_at = ahora.toISOString()
    if (accion === 'ver') { upd.wa_pendiente = false; upd.wa_acuerdo_pendiente = null; upd.wa_mensajes_hasta = ahora.toISOString() }
    await admin.from('enlaces_proveedor').update(upd).eq('id', e.id)
    if (!e.primer_acceso_at) await registrarEvento(admin, e.id, 'primer_acceso', { ipHash, userAgent })
    else if (!ultimo || ahora - ultimo > 10 * 60 * 1000) await registrarEvento(admin, e.id, 'acceso', { ipHash, userAgent })

    // ---- 4. Términos (una sola vez por link) ----
    if (!e.aceptado_at) {
      if (accion === 'ver' && body.aceptaTerminos === true) {
        await admin.from('enlaces_proveedor').update({ aceptado_at: ahora.toISOString() }).eq('id', e.id)
        await registrarEvento(admin, e.id, 'terminos', { ipHash, userAgent })
      } else if (accion === 'ver') {
        return resp(200, { ok: true, requiere_terminos: true })
      } else return resp(403, { error: 'Primero aceptá los términos.' })
    }

    const ctx = { admin, e, a, prov, ipHash, userAgent, body }
    switch (accion) {
      case 'ver':                return await ver(ctx)
      case 'aceptar':            return await aceptar(ctx)
      case 'pedir_presupuesto':  return await pedirPresupuesto(ctx)
      case 'enviar_presupuesto': return await enviarPresupuesto(ctx)
      case 'no_puede':           return await noPuede(ctx)
      case 'enviar_mensaje':     return await enviarMensaje(ctx)
      case 'pedir_url_subida':   return await pedirUrlSubida(ctx)
      case 'proponer_acuerdo':   return await proponerAcuerdo(ctx)
      case 'aceptar_acuerdo':    return await aceptarAcuerdo(ctx)
      case 'finalizar':          return await finalizar(ctx)
    }
    return resp(400, { error: 'Acción inválida' })
  } catch (err) {
    console.error('trabajo-link error:', err?.message || 'desconocido')   // sin token ni datos del pedido
    return resp(500, { error: 'No se pudo completar. Probá de nuevo en un momento.' })
  }
}

// ---------------------------------------------------------------------------
async function datosVecinoEdificio(admin, a) {
  const [{ data: ed }, { data: ve }] = await Promise.all([
    admin.from('edificios').select('nombre, direccion, requiere_acuerdo').eq('id', a.edificio_id).limit(1),
    admin.from('vecinos').select('nombre, departamento').eq('id', a.vecino_id).limit(1),
  ])
  return { ed: ed?.[0] || {}, ve: ve?.[0] || {} }
}

const chatAbierto = (a) => a.fase !== 'derivado' || !!a.presupuesto_pedido_at   // en "derivado" el chat se abre al pedir presupuesto

async function ver({ admin, a, body, e }) {
  const liviano = body.liviano === true
  const ya = new Set(Array.isArray(body.yaTengo) ? body.yaTengo.slice(0, 100).map(String) : [])

  // Mensajes del hilo (sin notas internas). Un mensaje retenido por datos de contacto solo lo ve quien lo escribió.
  let mensajes = []
  if (chatAbierto(a)) {
    const { data: ms } = await admin.from('mensajes').select('id, contenido, imagen_url, remitente_rol, created_at, bloqueado, liberado')
      .eq('aviso_id', a.id).eq('es_nota_interna', false).order('created_at', { ascending: false }).limit(100)
    mensajes = (ms || []).reverse().filter(m => !(m.bloqueado && !m.liberado && m.remitente_rol !== 'proveedor'))
  }
  const { vigente, rechazado } = await A.acuerdoVigente(admin, a.id)

  const { ed, ve } = liviano ? { ed: null, ve: null } : await datosVecinoEdificio(admin, a)

  // URLs firmadas de 10 min, solo de archivos de ESTE reclamo y solo las que el navegador todavía no tiene
  const necesarias = []
  const msgsOut = mensajes.map(m => {
    const path = m.imagen_url ? rutaPermitida(m.imagen_url, a) : null
    if (path) necesarias.push(path)
    return {
      id: m.id, de: m.remitente_rol, propio: m.remitente_rol === 'proveedor',
      nombre: m.remitente_rol === 'admin' ? 'Administrador' : m.remitente_rol === 'proveedor' ? 'Vos' : primerNombre(ve?.nombre) || 'Vecino',
      texto: m.contenido || '', imagen: path, retenido: !!(m.bloqueado && !m.liberado), creado: m.created_at,
    }
  })
  const fotos = liviano ? [] : (Array.isArray(a.adjuntos) ? a.adjuntos : []).map(x => ({ path: rutaPermitida(x?.path, a), tipo: String(x?.tipo || ''), nombre: String(x?.nombre || '').slice(0, 80) })).filter(x => x.path).slice(0, 12)
  const cierre = (a.fase === 'finalizado_proveedor' && !liviano) ? (Array.isArray(a.cierre_adjuntos) ? a.cierre_adjuntos : []).map(x => ({ path: rutaPermitida(x?.path, a), tipo: String(x?.tipo || ''), nombre: String(x?.nombre || '').slice(0, 80) })).filter(x => x.path).slice(0, 10) : []
  fotos.forEach(f => necesarias.push(f.path)); cierre.forEach(f => necesarias.push(f.path))
  const urls = await firmar(admin, necesarias.filter(p => !ya.has(p)), 600)

  const salida = {
    ok: true,
    fase: a.fase, chat_pausado: !!a.chat_pausado, chat_abierto: chatAbierto(a), presupuesto_pedido: !!a.presupuesto_pedido_at,
    mensajes: msgsOut, acuerdo: vigente, acuerdo_rechazado: rechazado, urls, url_vence_seg: 600,
    ahora: new Date().toISOString(),
  }
  if (!liviano) {
    salida.trabajo = {
      edificio: ed.nombre || '', direccion: ed.direccion || '', rubro: a.categoria, titulo: sinContacto(a.titulo), descripcion: sinContacto(a.descripcion),   // el vecino pudo escribir su teléfono en el texto libre
      urgencia: a.urgencia, depto: ve.departamento || '', vecino: primerNombre(ve.nombre), nota_admin: a.nota_proveedor || '',
      fotos, requiere_acuerdo: !!ed.requiere_acuerdo, acuerdo_aprobado: vigente?.estado === 'aprobado_admin',
      cierre: a.fase === 'finalizado_proveedor' ? { monto: a.presupuesto, nota: a.nota_cierre || '', adjuntos: cierre } : null,
    }
    salida.proveedor = { nombre: primerNombre((await nombreProveedor(admin, e.proveedor_id))) }
  }
  return resp(200, salida)
}
async function nombreProveedor(admin, id) {
  const { data } = await admin.from('proveedores').select('nombre').eq('id', id).limit(1)
  return data?.[0]?.nombre || ''
}

// Releer el reclamo con las columnas que necesitan los avisos
async function releer(admin, id) {
  const { data } = await admin.from('avisos').select('id, edificio_id, vecino_id, proveedor_id, proveedor_nombre, titulo, categoria, fase, autorizado_por, nota_proveedor, motivo_no_puede, reasignado_de_nombre').eq('id', id).limit(1)
  return data?.[0]
}
async function unidadDe(admin, a) {
  const { ed, ve } = await datosVecinoEdificio(admin, a)
  return { unidad: E.unidadDe(ed.nombre, ve.departamento), ve, ed }
}

// Mensajes de error "de negocio" de las funciones SQL (están en español y son seguras de mostrar)
function errorRpc(error) {
  const m = String(error?.message || '')
  if (/exige un acuerdo/i.test(m)) return resp(409, { error: 'Este edificio exige un acuerdo aprobado por el administrador antes de finalizar. Proponé uno desde el chat.' })
  if (/No autorizado/i.test(m)) return inactivo()
  if (/Este trabajo|Ingresá|Adjunto|Máximo/i.test(m)) return resp(409, { error: m.replace(/^.*?:\s*/, '').slice(0, 200) })
  return resp(500, { error: 'No se pudo completar. Probá de nuevo en un momento.' })
}

// ---------------------------------------------------------------------------
async function aceptar({ admin, a, e, ipHash, userAgent }) {
  if (a.fase !== 'derivado') return resp(409, { error: 'Este trabajo ya no está esperando tu respuesta.' })
  const { error } = await admin.rpc('fh_int_proveedor_aceptar', { p_aviso: a.id, p_proveedor: e.proveedor_id })
  if (error) return errorRpc(error)
  await registrarEvento(admin, e.id, 'aceptar', { ipHash, userAgent })
  const av = await releer(admin, a.id); const { unidad } = await unidadDe(admin, av)
  await E.postAceptado(admin, av, unidad)
  return resp(200, { ok: true })
}

async function pedirPresupuesto({ admin, a, e, ipHash, userAgent }) {
  if (a.fase !== 'derivado') return resp(409, { error: 'Este trabajo ya no está esperando tu respuesta.' })
  if (!a.presupuesto_pedido_at) {
    await admin.from('avisos').update({ presupuesto_pedido_at: new Date().toISOString() }).eq('id', a.id)
    if (!a.chat_pausado) {
      await admin.from('mensajes').insert({
        aviso_id: a.id, contenido: 'Quiero presupuestar este trabajo. ¿Coordinamos una visita?', remitente_rol: 'proveedor',
        remitente_id: e.proveedor_id, vecino_id: a.vecino_id, proveedor_id: e.proveedor_id, es_nota_interna: false,
      })
    }
    await registrarEvento(admin, e.id, 'pedir_presupuesto', { ipHash, userAgent })
    const av = await releer(admin, a.id); const { unidad } = await unidadDe(admin, av)
    await E.postPresupuestoPedido(admin, av, unidad)
  }
  return resp(200, { ok: true })
}

async function enviarPresupuesto({ admin, a, e, body, ipHash, userAgent }) {
  const r = await A.proponer(admin, a, 'proveedor', { alcance: body.alcance, monto: body.monto, fecha_visita: body.fecha_visita, franja: body.franja }, { montoObligatorio: true })
  if (r.error) return resp(r.status || 400, { error: r.error })
  await registrarEvento(admin, e.id, 'enviar_presupuesto', { ipHash, userAgent })
  const av = await releer(admin, a.id); const { ve } = await unidadDe(admin, av)
  await A.notificarAcuerdo(admin, av, { evento: 'propuesto', por: 'proveedor', acuerdo: r.acuerdo, vecinoNombre: ve.nombre })
  return resp(200, { ok: true, acuerdo: r.acuerdo })
}

async function proponerAcuerdo({ admin, a, e, body, ipHash, userAgent }) {
  const r = await A.proponer(admin, a, 'proveedor', body)
  if (r.error) return resp(r.status || 400, { error: r.error })
  await registrarEvento(admin, e.id, 'proponer_acuerdo', { ipHash, userAgent })
  const av = await releer(admin, a.id); const { ve } = await unidadDe(admin, av)
  await A.notificarAcuerdo(admin, av, { evento: 'propuesto', por: 'proveedor', acuerdo: r.acuerdo, vecinoNombre: ve.nombre })
  return resp(200, { ok: true, acuerdo: r.acuerdo })
}

async function aceptarAcuerdo({ admin, a, e, body, ipHash, userAgent }) {
  const r = await A.aceptar(admin, a, 'proveedor', body.acuerdo_id)
  if (r.error) return resp(r.status || 400, { error: r.error })
  await registrarEvento(admin, e.id, 'aceptar_acuerdo', { ipHash, userAgent })
  const av = await releer(admin, a.id)
  await A.notificarAcuerdo(admin, av, { evento: 'aceptado', por: 'proveedor', acuerdo: r.acuerdo })
  return resp(200, { ok: true, acuerdo: r.acuerdo })
}

async function noPuede({ admin, a, e, body, ipHash, userAgent }) {
  const motivo = String(body.motivo ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
  const { data, error } = await admin.rpc('fh_int_proveedor_no_puede', { p_aviso: a.id, p_proveedor: e.proveedor_id, p_motivo: motivo })
  if (error) return errorRpc(error)
  await registrarEvento(admin, e.id, 'no_puede', { ipHash, userAgent })
  const nuevo = await releer(admin, a.id) || data
  const { unidad } = await unidadDe(admin, nuevo)
  await E.postNoPuede(admin, nuevo, unidad)     // pasa al siguiente (regla automática) o vuelve al administrador
  return resp(200, { ok: true, cerrado: true })   // este link ya queda revocado
}

async function enviarMensaje({ admin, a, e, body, ipHash, userAgent }) {
  if (!chatAbierto(a)) return resp(409, { error: 'El chat se abre cuando aceptás el trabajo o pedís presupuesto.' })
  if (a.chat_pausado) return resp(403, { error: 'El administrador pausó este chat. Podés leer, pero no escribir por ahora.' })
  const texto = String(body.texto ?? '').replace(/\r\n/g, '\n').trim()
  if (texto.length > 1000) return resp(400, { error: 'El mensaje puede tener hasta 1000 caracteres.' })
  const imagen = body.imagen_path ? rutaPermitida(body.imagen_path, a) : null
  if (body.imagen_path && !imagen) return resp(400, { error: 'Foto inválida.' })
  if (!texto && !imagen) return resp(400, { error: 'Escribí un mensaje.' })

  // freno de ráfagas: 10 mensajes por minuto
  const hace1 = new Date(Date.now() - 60000).toISOString()
  const { data: recientes } = await admin.from('mensajes').select('id').eq('aviso_id', a.id).eq('remitente_rol', 'proveedor').gt('created_at', hace1).limit(11)
  if ((recientes?.length || 0) >= 10) return resp(429, { error: 'Estás escribiendo muy rápido. Esperá un momento.' })

  const { data: m, error } = await admin.from('mensajes').insert({
    aviso_id: a.id, contenido: texto, imagen_url: imagen ? `adjuntos:${imagen}` : null, remitente_rol: 'proveedor',
    remitente_id: e.proveedor_id, vecino_id: a.vecino_id, proveedor_id: e.proveedor_id, es_nota_interna: false,
  }).select('id, bloqueado').single()
  if (error) {
    if (/paus/i.test(error.message || '')) return resp(403, { error: 'El administrador pausó este chat.' })
    return resp(500, { error: 'No se pudo enviar el mensaje.' })
  }
  await registrarEvento(admin, e.id, 'enviar_mensaje', { ipHash, userAgent })
  const av = await releer(admin, a.id)
  if (m.bloqueado) {
    // el trigger de la base lo retuvo: no le llega al vecino; el admin decide si lo libera
    await avisarAdmins(admin, av.edificio_id, '🛡️ Mensaje retenido', `${av.proveedor_nombre || 'El proveedor'} intentó pasar datos de contacto en "${av.titulo}". Revisalo para liberarlo o no.`, { tipo: 'mensaje_retenido', aviso_id: av.id }).catch(() => {})
    return resp(200, { ok: true, bloqueado: true, mensaje: MENSAJE_BLOQUEO })
  }
  await E.postMensajeProveedor(admin, av, (texto || '📷 Foto').slice(0, 140))
  return resp(200, { ok: true, bloqueado: false })
}

async function pedirUrlSubida({ admin, a, e, body, ipHash, userAgent }) {
  const tipo = String(body.tipo || ''), size = Number(body.size) || 0
  if (!MIMES_PROVEEDOR.includes(tipo)) return resp(400, { error: 'Ese tipo de archivo no está permitido. Usá una foto o un PDF.' })
  if (size <= 0 || size > MAX_MB * 1048576) return resp(400, { error: `El archivo pesa más de ${MAX_MB} MB. Probá con uno más liviano.` })
  const { count } = await admin.from('enlace_eventos').select('id', { count: 'exact', head: true }).eq('enlace_id', e.id).eq('evento', 'subida')
  if ((count || 0) >= MAX_SUBIDAS_POR_LINK) return resp(429, { error: 'Llegaste al máximo de archivos para este trabajo.' })
  // La URL de subida solo sirve para ESTA ruta: <edificio>/<reclamo>/<archivo> dentro del bucket privado
  const path = `${prefijoDe(a)}${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${limpiarNombre(body.nombre)}`
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data?.signedUrl) return resp(500, { error: 'No se pudo preparar la subida. Probá de nuevo.' })
  await registrarEvento(admin, e.id, 'subida', { ipHash, userAgent })
  return resp(200, { ok: true, path, upload_url: data.signedUrl, tipo })
}

async function finalizar({ admin, a, e, body, ipHash, userAgent }) {
  if (a.fase !== 'en_camino') return resp(409, { error: 'Primero aceptá el trabajo.' })
  const monto = num(body.monto)
  if (!isFinite(monto) || monto <= 0 || monto >= 1e9) return resp(400, { error: 'Ingresá un monto válido.' })
  const nota = String(body.nota ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)
  if (contieneContacto(nota)) return resp(400, { error: MENSAJE_BLOQUEO })
  const v = validarAdjuntosProveedor(body.adjuntos, a)
  if (v.error) return resp(400, { error: v.error })
  const { error } = await admin.rpc('fh_int_proveedor_finalizar', { p_aviso: a.id, p_proveedor: e.proveedor_id, p_monto: Math.round(monto * 100) / 100, p_nota: nota, p_adjuntos: v.lista })
  if (error) return errorRpc(error)
  await registrarEvento(admin, e.id, 'finalizar', { ipHash, userAgent })
  const av = await releer(admin, a.id); const { unidad } = await unidadDe(admin, av)
  await E.postFinalizado(admin, av, unidad)
  return resp(200, { ok: true })
}
