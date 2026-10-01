const { createClient } = require('@supabase/supabase-js')

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

    return { statusCode: 200, body: `${totalEnviadas} enviadas` }
  } catch (err) {
    console.error('scheduled-notifications error:', err)
    return { statusCode: 500, body: 'Error interno' }
  }
}
