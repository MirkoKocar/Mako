import React, { useEffect, useState } from 'react'
import { BellOff, Settings } from 'lucide-react'

const NOTIF_SUPPORTED = typeof window !== 'undefined' && 'Notification' in window

// ⚠️ Completar esto con el nombre de paquete real una vez armado el build de
// PWABuilder para Google Play (ej: "com.fixhub.app"). Sin esto, el botón
// "Abrir configuración" en Android cae directo al mensaje de texto de respaldo.
const ANDROID_PACKAGE_NAME = '' // TODO: completar antes de publicar en Play Store

const esAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

// ============================================================================
// 🧪 MODO PRUEBA — pensado para ver cómo se ve cada estado sin tener que
// cambiar los permisos reales del celular. Se activa agregando a la URL:
//   ?probarNotif=default     → como si nunca hubiese respondido
//   ?probarNotif=denied      → como si hubiese tocado "No permitir"
//   ?probarNotif=granted     → como si ya lo hubiese permitido (no se ve banner)
//   ?probarNotif=unsupported → como si el navegador no lo soportara
// No afecta nada real: es solo visual. Para sacarlo del todo antes de la
// versión oficial final, borrar este bloque y el "|| previewOverride" de abajo.
// ============================================================================
const previewOverride = (() => {
  if (typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('probarNotif')
  return ['default', 'denied', 'granted', 'unsupported'].includes(v) ? v : null
})()

// Banner liviano (NO pantalla completa, NO bloquea la app). Se muestra en todas
// las pantallas mientras el permiso de notificaciones no esté concedido.
// El cartel NATIVO del sistema/navegador (el gris, como en cualquier app) ya se
// dispara solo una vez desde App.jsx apenas hay sesión — acá solo avisamos si
// el usuario lo rechazó o todavía no respondió.
export default function NotifBanner() {
  const [perm, setPerm] = useState(() => previewOverride || (NOTIF_SUPPORTED ? Notification.permission : 'unsupported'))

  useEffect(() => {
    if (previewOverride || !NOTIF_SUPPORTED) return
    const check = () => setPerm(Notification.permission)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  if (perm === 'granted') return null
  if (!NOTIF_SUPPORTED && !previewOverride) return null

  const reintentar = async () => {
    if (previewOverride) return // en modo prueba no dispara permisos reales
    if (perm === 'denied') { abrirConfiguracion(); return }
    const result = await Notification.requestPermission()
    setPerm(result)
  }

  // Intenta abrir directamente la pantalla de notificaciones de la app en
  // Android (funciona una vez empaquetada como TWA con PWABuilder). Si falla
  // o no estamos en Android/no hay package name cargado, no pasa nada — el
  // texto de abajo ya explica el camino manual como respaldo.
  const abrirConfiguracion = () => {
    if (!esAndroid || !ANDROID_PACKAGE_NAME) return
    try {
      window.location.href = `intent://#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;S.android.provider.extra.APP_PACKAGE=${ANDROID_PACKAGE_NAME};end`
    } catch { /* silencioso, queda el texto de respaldo */ }
  }

  return (
    <div>
      {previewOverride && (
        <p style={{ margin:'0 20px 8px', fontSize:9, color:'#fbbf24', fontWeight:700, letterSpacing:'0.05em' }}>
          🧪 MODO PRUEBA — estado simulado: "{perm}" (no es real, se ve así por el ?probarNotif de la URL)
        </p>
      )}
      <div onClick={reintentar} style={{
        display:'flex', alignItems:'center', gap:10, cursor:'pointer',
        margin:'0 20px 14px', padding:'11px 14px',
        background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.2)',
        borderRadius:14,
      }}>
        <BellOff size={15} color="#f87171" strokeWidth={1.8} style={{ flexShrink:0 }}/>
        <p style={{ fontSize:11.5, color:'rgba(242,224,201,0.75)', lineHeight:1.5, fontWeight:500, flex:1 }}>
          {perm === 'denied'
            ? <>Es importante que tengas las notificaciones activadas, sino no te vas a enterar de nada. <span style={{ color:'#E0B05E', fontWeight:700 }}>Tocá acá para ir a Configuración</span>.</>
            : <>Es importante que tengas las notificaciones activadas, sino no te vas a enterar de nada. <span style={{ color:'#E0B05E', fontWeight:700 }}>Tocá acá para activarlas</span>.</>
          }
        </p>
        {perm === 'denied' && <Settings size={14} color="rgba(248,113,113,0.5)" style={{ flexShrink:0 }}/>}
      </div>
    </div>
  )
}
