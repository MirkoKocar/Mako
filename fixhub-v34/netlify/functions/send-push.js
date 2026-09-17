const { GoogleAuth } = require('google-auth-library')
const { createClient } = require('@supabase/supabase-js')

// ----------------------------------------------------------------------------
// Las credenciales de Firebase YA NO están escritas acá. Antes estaban
// hardcodeadas en este archivo y se subían tal cual a GitHub con cada
// versión — cualquiera con acceso al repo (o si en algún momento se hace
// público) podía usarlas para mandar notificaciones a nombre de MAKO.
// Ahora se leen de variables de entorno configuradas en Netlify
// (Site settings → Environment variables). Ver SETUP_SEGURIDAD.md para los
// valores exactos que hay que cargar.
// ----------------------------------------------------------------------------
function getServiceAccount() {
  const required = [
    'FIREBASE_PROJECT_ID', 'FIREBASE_PRIVATE_KEY_ID', 'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL', 'FIREBASE_CLIENT_ID'
  ]
  const missing = required.filter(k => !process.env[k])
  if (missing.length) {
    throw new Error(`Faltan variables de entorno en Netlify: ${missing.join(', ')}`)
  }
  return {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    // Netlify guarda los saltos de línea como \n literal — hay que
    // convertirlos de vuelta a saltos de línea reales.
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    token_uri: 'https://oauth2.googleapis.com/token'
  }
}

async function getFCMToken() {
  const auth = new GoogleAuth({
    credentials: getServiceAccount(),
    scopes: ['https://www.googleapis.com/auth/firebase.messaging']
  })
  const client = await auth.getClient()
  const token  = await client.getAccessToken()
  return token.token
}

async function sendToToken(accessToken, fcmToken, title, body, data = {}) {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title, body },
          webpush: {
            notification: { title, body, icon: '/icon-192.png', badge: '/icon-192.png' },
            fcm_options: { link: '/' }
          },
          data: Object.fromEntries(Object.entries(data).map(([k,v]) => [k, String(v)]))
        }
      })
    }
  )
  return res.ok
}

// ----------------------------------------------------------------------------
// Antes esta función no verificaba quién la llamaba: cualquiera que
// encontrara la URL podía mandar notificaciones arbitrarias usando el
// proyecto de Firebase de MAKO. Ahora se acepta la llamada solo si viene:
//   (a) de un usuario real logueado en la app (manda su token de sesión de
//       Supabase en el header Authorization), o
//   (b) del cron interno de scheduled-notifications.js (manda un secreto
//       compartido que solo vive en variables de entorno del servidor,
//       nunca en el código que llega al navegador).
// ----------------------------------------------------------------------------
async function llamadaAutorizada(event) {
  const secretoInterno = event.headers['x-internal-secret']
  if (secretoInterno && process.env.INTERNAL_FUNCTION_SECRET && secretoInterno === process.env.INTERNAL_FUNCTION_SECRET) {
    return true
  }
  const authHeader = event.headers['authorization'] || event.headers['Authorization']
  const jwt = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!jwt || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return false

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data, error } = await supabase.auth.getUser(jwt)
  return !error && !!data?.user
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  const autorizado = await llamadaAutorizada(event)
  if (!autorizado) {
    return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado' }) }
  }

  try {
    const { tokens, title, body, data } = JSON.parse(event.body)
    if (!tokens?.length) return { statusCode: 400, body: 'No tokens' }

    const accessToken = await getFCMToken()
    const results = await Promise.allSettled(
      tokens.map(t => sendToToken(accessToken, t, title, body, data || {}))
    )
    const ok      = results.filter(r => r.status === 'fulfilled' && r.value).length
    const failed  = results.length - ok

    return {
      statusCode: 200,
      body: JSON.stringify({ sent: ok, failed })
    }
  } catch (err) {
    console.error('send-push error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'No se pudo enviar la notificación.' }) }
  }
}
