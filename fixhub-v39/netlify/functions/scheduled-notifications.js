const { createClient } = require('@supabase/supabase-js')
const { avisar, avisarAdmins } = require('./lib/common')
const { enviarRecordatorio, flushNovedades } = require('./lib/proveedor-wa')

// Antes la URL y la key de Supabase estaban escritas acá adentro. Ahora
// salen de variables de entorno de Netlify (ver SETUP_SEGURIDAD.md).
//
// IMPORTANTE: este cron corre solo, sin que ningún usuario haya iniciado
// sesión — no tiene un auth.uid(). Como ahora las tablas tienen RLS activado
// (ver supabase_migration_v31_seguridad.sql), necesita la SERVICE ROLE KEY
// (no la anon key) para poder leer notificaciones_programadas y fcm_tokens.
// La service role key nunca debe usarse en el navegador — solo acá, en
// código que corre en el servidor de Netlify.
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const NETLIFY_URL = process.env.URL || process.env.NETLIFY_URL


// ---------------------------------------------------------------------------
// v38 — Recordatorios al proveedor, aviso al admin y novedades pendientes por WhatsApp
// ---------------------------------------------------------------------------
const RECORD = {
  RESPUESTA_URGENTE_H: 2,     // sin respuesta a un trabajo urgente: recordatorio a las 2 h
  RESPUESTA_NORMAL_H: 12,     // resto: a las 12 h
  ADMIN_URGENTE_MIN: 60,      // si sigue sin responder: aviso al admin para reasignar (1 h después del recordatorio)
  ADMIN_NORMAL_H: 6,          // resto: 6 h después
  FIN_URGENTE_H: 8,           // en_camino sin finalizar: "marcá como finalizado" a las 8 h (urgente)
  FIN_NORMAL_H: 24,           // resto: a las 24 h
  FIN_REPETIR_H: 48,          // y se repite cada 48 h
  FIN_MAX: 3,                 // como máximo 3 recordatorios
}
const HORAS = 3600 * 1000

// Los recordatorios NO urgentes no se mandan de noche (22 a 8 h de Argentina): salen a primera hora
function silencioNocturno(ahora = new Date()) {
  const h = (ahora.getUTCHours() + 21) % 24      // UTC-3
  return h >= 22 || h < 8
}

async function recordatoriosProveedor(supabase) {
  const ahora = Date.now(), noche = silencioNocturno()
  const iso = (ms) => new Date(ms).toISOString()
  let enviados = 0

  // 1) Trabajo derivado sin respuesta -> recordatorio al proveedor
  const { data: sinResp } = await supabase.from('avisos')
    .select('id, edificio_id, proveedor_id, titulo, urgencia, derivado_at, presupuesto_pedido_at')
    .eq('fase', 'derivado').not('proveedor_id', 'is', null).is('recordatorio_resp_at', null).is('presupuesto_pedido_at', null)
    .not('derivado_at', 'is', null).lt('derivado_at', iso(ahora - RECORD.RESPUESTA_URGENTE_H * HORAS)).limit(100)
  for (const a of sinResp || []) {
    const urgente = a.urgencia === 'alta'
    const umbral = (urgente ? RECORD.RESPUESTA_URGENTE_H : RECORD.RESPUESTA_NORMAL_H) * HORAS
    if (ahora - new Date(a.derivado_at).getTime() < umbral || (noche && !urgente)) continue
    await supabase.from('avisos').update({ recordatorio_resp_at: iso(ahora) }).eq('id', a.id).is('recordatorio_resp_at', null)   // primero marcamos: así no se duplica
    await avisar(supabase, { user_id: a.proveedor_id, rol: 'proveedor' }, '⏰ Trabajo esperando tu respuesta', a.titulo, { tipo: 'recordatorio', aviso_id: a.id }).catch(() => {})
    await enviarRecordatorio(supabase, a.id, 'recordatorio_trabajo').catch(e => console.error('recordatorio:', e?.message))
    enviados++
  }

  // 2) Siguió sin responder -> aviso al admin para que reasigne
  const { data: paraAdmin } = await supabase.from('avisos')
    .select('id, edificio_id, proveedor_nombre, titulo, urgencia, recordatorio_resp_at')
    .eq('fase', 'derivado').not('proveedor_id', 'is', null).is('recordatorio_admin_at', null).is('presupuesto_pedido_at', null)
    .not('recordatorio_resp_at', 'is', null).limit(100)
  for (const a of paraAdmin || []) {
    const espera = (a.urgencia === 'alta' ? RECORD.ADMIN_URGENTE_MIN * 60000 : RECORD.ADMIN_NORMAL_H * HORAS)
    if (ahora - new Date(a.recordatorio_resp_at).getTime() < espera) continue
    await supabase.from('avisos').update({ recordatorio_admin_at: iso(ahora) }).eq('id', a.id).is('recordatorio_admin_at', null)
    await avisarAdmins(supabase, a.edificio_id, '⏰ Proveedor sin responder',
      `${a.proveedor_nombre || 'El proveedor'} no respondió "${a.titulo}". Podés cambiar de proveedor desde el reclamo.`, { tipo: 'sin_respuesta', aviso_id: a.id }).catch(() => {})
    enviados++
  }

  // 3) En camino sin finalizar -> "marcá como finalizado"
  const { data: enCamino } = await supabase.from('avisos')
    .select('id, proveedor_id, titulo, urgencia, aceptado_at, recordatorio_fin_at, recordatorio_fin_n')
    .eq('fase', 'en_camino').not('proveedor_id', 'is', null).not('aceptado_at', 'is', null).lt('recordatorio_fin_n', RECORD.FIN_MAX)
    .lt('aceptado_at', iso(ahora - RECORD.FIN_URGENTE_H * HORAS)).limit(100)
  for (const a of enCamino || []) {
    const urgente = a.urgencia === 'alta'
    const desde = a.recordatorio_fin_at ? new Date(a.recordatorio_fin_at).getTime() + RECORD.FIN_REPETIR_H * HORAS
                                        : new Date(a.aceptado_at).getTime() + (urgente ? RECORD.FIN_URGENTE_H : RECORD.FIN_NORMAL_H) * HORAS
    if (ahora < desde || (noche && !urgente)) continue
    await supabase.from('avisos').update({ recordatorio_fin_at: iso(ahora), recordatorio_fin_n: (a.recordatorio_fin_n || 0) + 1 }).eq('id', a.id).eq('recordatorio_fin_n', a.recordatorio_fin_n || 0)
    await avisar(supabase, { user_id: a.proveedor_id, rol: 'proveedor' }, '🔧 ¿Ya terminaste?', `Marcá como finalizado: ${a.titulo}`, { tipo: 'recordatorio_fin', aviso_id: a.id }).catch(() => {})
    await enviarRecordatorio(supabase, a.id, 'recordatorio_finalizar').catch(e => console.error('recordatorio fin:', e?.message))
    enviados++
  }

  // 4) Novedades (mensajes / acuerdo) que quedaron esperando por el agrupado de 10 min
  const { data: pend } = await supabase.from('enlaces_proveedor').select('id').eq('wa_pendiente', true).eq('revocado', false).limit(50)
  for (const e of pend || []) {
    const r = await flushNovedades(supabase, e.id).catch(() => null)
    if (r?.enviado) enviados++
  }

  // 5) Limpieza: contadores de intentos fallidos con más de un día
  await supabase.from('intentos_enlace').delete().lt('ventana_inicio', iso(ahora - 24 * HORAS))
  return enviados
}

exports.handler = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en las variables de entorno de Netlify')
    return { statusCode: 500, body: 'Faltan variables de entorno' }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const ahora    = new Date().toISOString()
  let totalEnviadas = 0

  const enviarPush = (payload) => fetch(`${NETLIFY_URL}/.netlify/functions/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Este secreto solo existe en variables de entorno del servidor —
      // nunca llega al navegador — así send-push sabe que este llamado es
      // legítimo aunque no venga de un usuario logueado.
      'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET || ''
    },
    body: JSON.stringify(payload)
  }).catch(err => console.error('Error llamando a send-push:', err))

  try {
    // 1) Notificaciones programadas manualmente desde INFRA
    const { data: pendientes, error: eP } = await supabase
      .from('notificaciones_programadas')
      .select('*')
      .eq('enviada', false)
      .lte('programada_para', ahora)
    if (eP) console.error('Error leyendo notificaciones_programadas:', eP)

    for (const notif of (pendientes || [])) {
      let query = supabase.from('fcm_tokens').select('token, rol, edificio_id')

      if (notif.vecino_ids?.length)    query = query.in('user_id', notif.vecino_ids)
      else {
        if (notif.edificio_ids?.length) query = query.in('edificio_id', notif.edificio_ids)
        if (notif.roles?.length)        query = query.in('rol', notif.roles)
      }

      const { data: tokenRows, error: eT } = await query
      if (eT) { console.error('Error leyendo fcm_tokens:', eT); continue }
      const tokens = (tokenRows || []).map(t => t.token)

      if (tokens.length) {
        await enviarPush({ tokens, title: notif.titulo, body: notif.cuerpo, data: { tipo: 'programada' } })
        totalEnviadas++
      }

      await supabase.from('notificaciones_programadas')
        .update({ enviada: true, enviada_at: new Date().toISOString() })
        .eq('id', notif.id)
    }

    // 2) Publicaciones del Tablón (avisos/votaciones) programadas por el admin para más adelante
    const { data: anunciosPendientes, error: eA } = await supabase
      .from('anuncios')
      .select('*')
      .eq('notificado', false)
      .lte('fecha_publicacion', ahora)
    if (eA) console.error('Error leyendo anuncios pendientes:', eA)

    for (const an of (anunciosPendientes || [])) {
      const { data: tokenRows, error: eT } = await supabase.from('fcm_tokens')
        .select('token').eq('edificio_id', an.edificio_id).eq('rol', 'vecino')
      if (eT) { console.error('Error leyendo fcm_tokens:', eT); continue }
      const tokens = (tokenRows || []).map(t => t.token)

      if (tokens.length) {
        const emoji = an.tipo === 'votacion' ? '🗳️' : an.tipo === 'anuncio' ? '🔴' : '📢'
        await enviarPush({ tokens, title: `${emoji} Nuevo en el Tablón`, body: an.titulo, data: { tipo: 'tablon' } })
        totalEnviadas++
      }

      await supabase.from('anuncios').update({ notificado: true }).eq('id', an.id)
    }

    // 3) v38: recordatorios al proveedor, avisos al admin y novedades pendientes de WhatsApp (si falla, no afecta lo anterior)
    try { totalEnviadas += await recordatoriosProveedor(supabase) }
    catch (e) { console.error('recordatorios proveedor:', e?.message || 'error') }

    return { statusCode: 200, body: `${totalEnviadas} enviadas` }
  } catch (err) {
    console.error('scheduled-notifications error:', err)
    return { statusCode: 500, body: 'Error interno' }
  }
}
