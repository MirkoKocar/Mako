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

    // Se registra por una función del servidor que verifica que el rol, el edificio
    // y la persona sean realmente los de la sesión (nadie puede registrar tokens a nombre de otro).
    const { error } = await supabase.rpc('fh_registrar_token', { p_token: token, p_rol: rol, p_edificio: edificioId, p_user: userId })
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

    out.guardadoDB = null   // el guardado real se hace con la sesión de cada persona (fh_registrar_token)
  } catch (e) {
    out.error = e?.message || String(e)
  }
  return out
}

// Avisar al edificio de una novedad del Tablón (solo el admin del edificio puede; el servidor decide los destinatarios)
export async function notifyNuevoAnuncioTablon({ edificioId, titulo, tipo }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    await fetch('/.netlify/functions/notificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ tipo: 'tablon', edificioId, titulo, subtipo: tipo }),
    })
  } catch (e) { console.warn('Push tablón:', e) }
}

export { messaging }
