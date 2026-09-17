import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'
import { supabase } from './supabase'

const firebaseConfig = {
  apiKey: "AIzaSyBi9t1TN8fAsbvtxY9wqy3ywa_Ir37D9IY",
  authDomain: "fixhub-2edf6.firebaseapp.com",
  projectId: "fixhub-2edf6",
  storageBucket: "fixhub-2edf6.firebasestorage.app",
  messagingSenderId: "303318214890",
  appId: "1:303318214890:web:f324c659ae5fbf81a1cf93",
}

const VAPID_KEY = "BPAeBVVzwdzYQOa5YKcpAWoYUHPCgDatC8_SnOhj7a3AHY5hcx94LqSy3QIz_XTGunajNKhwQmUC9SMjq095vPg"

const app       = initializeApp(firebaseConfig)
const messaging = getMessaging(app)

export async function requestNotificationPermission() {
  try {
    const permission = await Notification.requestPermission()
    return permission
  } catch { return 'denied' }
}

export async function registerFCMToken(userId, rol, edificioId) {
  const marcarResultado = (ok, detalle) => {
    try {
      localStorage.setItem('fixhub_last_fcm_attempt', JSON.stringify({ ok, detalle, cuando: new Date().toISOString() }))
    } catch { /* no-op */ }
  }
  try {
    if (Notification.permission !== 'granted') { marcarResultado(false, 'Permiso no concedido en el momento del intento.'); return null }
    if (!('serviceWorker' in navigator)) { marcarResultado(false, 'Navegador sin soporte de Service Worker.'); return null }

    // Esperar a que el Service Worker de Firebase esté realmente activo.
    // Si recién se registró (primera vez), puede tardar un instante.
    const swRegistration = await navigator.serviceWorker.ready

    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swRegistration })
    if (!token) { marcarResultado(false, 'getToken() no devolvió token.'); return null }

    const { error } = await supabase.from('fcm_tokens').upsert(
      { user_id: userId, rol, edificio_id: edificioId, token, updated_at: new Date().toISOString() },
      { onConflict: 'token' }
    )
    if (error) { marcarResultado(false, `Error de Supabase: ${error.message}`); return null }

    marcarResultado(true, `Token guardado OK (rol=${rol}, edificio=${edificioId||'—'})`)
    return token
  } catch(e) {
    marcarResultado(false, `Excepción: ${e?.message || e}`)
    console.warn('FCM token error:', e)
    return null
  }
}

export function onForegroundMessage(callback) {
  return onMessage(messaging, callback)
}

// 🔎 Diagnóstico real — usado por el panel de pruebas para mostrar exactamente
// qué está pasando, en vez de fallar en silencio como hace registerFCMToken.
export async function diagnosticoFCM() {
  const out = { permiso:null, swRegistrado:false, swEstado:null, token:null, error:null, guardadoDB:null, errorDB:null }
  try {
    out.permiso = typeof Notification !== 'undefined' ? Notification.permission : 'no-soportado'
    if (!('serviceWorker' in navigator)) { out.error = 'Este navegador no soporta Service Workers.'; return out }

    const regs = await navigator.serviceWorker.getRegistrations()
    const reg  = regs.find(r => r.active?.scriptURL?.includes('firebase-messaging-sw.js')) || regs[0]
    out.swRegistrado = !!reg
    out.swEstado = reg?.active?.state || (regs.length ? 'registrado, sin activar todavía' : 'no registrado')

    if (out.permiso !== 'granted') { out.error = 'El permiso de notificaciones todavía no está concedido en este navegador.'; return out }

    const swRegistration = await navigator.serviceWorker.ready
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swRegistration })
    out.token = token || null
    if (!token) { out.error = 'getToken() no devolvió ningún token, sin lanzar error explícito.'; return out }

    // Probamos el guardado real en Supabase con este token (marcado como 'diagnostico'
    // para poder identificarlo). Si esto falla, el error de Supabase queda expuesto acá.
    const { error: dbError } = await supabase.from('fcm_tokens').upsert(
      { user_id: null, rol: 'diagnostico', edificio_id: null, token, updated_at: new Date().toISOString() },
      { onConflict: 'token' }
    )
    out.guardadoDB = !dbError
    if (dbError) out.errorDB = dbError.message || JSON.stringify(dbError)
  } catch (e) {
    out.error = e?.message || String(e)
  }
  return out
}

// Enviar push via Netlify Function
async function sendPush(tokens, title, body, data = {}) {
  if (!tokens?.length) return
  try {
    // La función send-push ahora exige probar que quien la llama es un
    // usuario logueado de verdad (manda el token de la sesión actual de
    // Supabase) — antes cualquiera con la URL podía usarla sin identificarse.
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) { console.warn('Push: no hay sesión activa, no se envía.'); return }
    await fetch('/.netlify/functions/send-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ tokens, title, body, data })
    })
  } catch(e) { console.warn('Push error:', e) }
}

// Enviar el aviso de WhatsApp al proveedor (no el mensaje en sí, solo el aviso
// de "tenés una novedad, entrá a la app"). No hace nada si el proveedor no
// cargó su número de WhatsApp.
async function sendWhatsapp(numero) {
  if (!numero) return
  try {
    await fetch('/.netlify/functions/send-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero })
    })
  } catch(e) { console.warn('WhatsApp error:', e) }
}

async function getTokensFor(query) {
  const { data } = await query
  return (data || []).map(t => t.token)
}

export async function notifyNuevoAviso({ avisoId, titulo, edificioId, proveedorId }) {
  if (proveedorId) {
    const tokens = await getTokensFor(supabase.from('fcm_tokens').select('token').eq('user_id', proveedorId))
    await sendPush(tokens, '🔧 Nuevo aviso', titulo, { tipo:'aviso', aviso_id: avisoId })

    // Aviso también por WhatsApp, si el proveedor cargó su teléfono
    const { data: prov } = await supabase.from('proveedores').select('telefono').eq('id', proveedorId).limit(1)
    await sendWhatsapp(prov?.[0]?.telefono)
  }
  const adminTokens = await getTokensFor(supabase.from('fcm_tokens').select('token').eq('edificio_id', edificioId).eq('rol','admin'))
  await sendPush(adminTokens, '📋 Nuevo aviso en tu edificio', titulo, { tipo:'aviso_admin', aviso_id: avisoId })
}

export async function notifyNuevoMensaje({ avisoId, contenido, destinatarioId, remitente, destinatarioEsProveedor }) {
  const tokens = await getTokensFor(supabase.from('fcm_tokens').select('token').eq('user_id', destinatarioId))
  await sendPush(tokens, `💬 ${remitente}`, contenido, { tipo:'mensaje', aviso_id: avisoId })

  // Si el mensaje es PARA un proveedor, avisarle también por WhatsApp
  if (destinatarioEsProveedor) {
    const { data: prov } = await supabase.from('proveedores').select('telefono').eq('id', destinatarioId).limit(1)
    await sendWhatsapp(prov?.[0]?.telefono)
  }
}

export async function notifyNuevoAnuncioTablon({ edificioId, titulo, tipo }) {
  const emoji = tipo==='votacion'?'🗳️':tipo==='anuncio'?'🔴':'📢'
  const tokens = await getTokensFor(supabase.from('fcm_tokens').select('token').eq('edificio_id', edificioId).eq('rol','vecino'))
  await sendPush(tokens, `${emoji} Nuevo en el Tablón`, titulo, { tipo:'tablon' })
}

export async function notifyFaltaConfirmarResuelto({ avisoId, titulo, edificioId, vecinoId, paraRol }) {
  if (paraRol === 'admin') {
    const tokens = await getTokensFor(supabase.from('fcm_tokens').select('token').eq('edificio_id', edificioId).eq('rol','admin'))
    await sendPush(tokens, '✅ Falta tu confirmación', `El vecino marcó como resuelto: ${titulo}`, { tipo:'confirmar_resuelto', aviso_id: avisoId })
  } else {
    const tokens = await getTokensFor(supabase.from('fcm_tokens').select('token').eq('user_id', vecinoId))
    await sendPush(tokens, '✅ Falta tu confirmación', `El administrador marcó como resuelto: ${titulo}`, { tipo:'confirmar_resuelto', aviso_id: avisoId })
  }
}

export { messaging }
