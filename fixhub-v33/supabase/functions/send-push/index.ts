import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY') || ''

serve(async (req) => {
  const { tokens, title, body, data } = await req.json()
  if (!tokens?.length) return new Response('No tokens', { status: 400 })

  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: { 'Authorization': `key=${FCM_SERVER_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      registration_ids: tokens,
      notification: { title, body, icon: '/icon-192.png', click_action: '/' },
      data: data || {}
    })
  })

  const result = await res.json()
  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
