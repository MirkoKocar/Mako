import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY') || ''
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const ahora = new Date().toISOString()

  // Buscar notificaciones pendientes que ya deben enviarse
  const { data: pendientes } = await supabase
    .from('notificaciones_programadas')
    .select('*')
    .eq('enviada', false)
    .lte('programada_para', ahora)

  if (!pendientes?.length) return new Response('OK - Sin pendientes', { status: 200 })

  for (const notif of pendientes) {
    // Construir query de tokens FCM según destinatarios
    let query = supabase.from('fcm_tokens').select('token, rol, edificio_id')

    if (notif.vecino_ids?.length) {
      query = query.in('user_id', notif.vecino_ids)
    } else {
      if (notif.edificio_ids?.length) query = query.in('edificio_id', notif.edificio_ids)
      if (notif.roles?.length)        query = query.in('rol', notif.roles)
    }

    const { data: tokens } = await query
    if (!tokens?.length) continue

    // Enviar vía FCM
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: { 'Authorization': `key=${FCM_SERVER_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registration_ids: tokens.map(t => t.token),
        notification: { title: notif.titulo, body: notif.cuerpo, icon: '/icon-192.png' },
        data: { tipo: 'programada', notif_id: notif.id }
      })
    })

    if (response.ok) {
      await supabase.from('notificaciones_programadas')
        .update({ enviada: true, enviada_at: new Date().toISOString() })
        .eq('id', notif.id)
    }
  }

  return new Response(`OK - ${pendientes.length} enviadas`, { status: 200 })
})
