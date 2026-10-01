import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import App from './App'
import './index.css'

// Monitoreo de errores en producción. Si todavía no cargaste VITE_SENTRY_DSN
// en las variables de entorno de Netlify, esto simplemente no hace nada —
// no rompe la app, solo no manda nada a ningún lado hasta que lo configures.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  })
}

// Registrar el Service Worker de Firebase Messaging. Sin esto, las
// notificaciones push NO funcionan (ni en primer plano ni en segundo plano):
// Firebase necesita este registro activo para poder generar el token y para
// poder mostrar notificaciones cuando la app está cerrada/en background.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js')
    .catch(err => console.warn('No se pudo registrar el Service Worker:', err))
}

// El ErrorBoundary de Sentry: si algo se rompe feo en el render (un bug de
// código, no de red), en vez de dejar la pantalla en blanco muestra un
// mensaje y le manda el detalle del error a Sentry para que se pueda
// diagnosticar sin depender de que el usuario avise.
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Sentry.ErrorBoundary fallback={
      <div style={{ minHeight:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center', background:'#0A1428', color:'#F2E0C9' }}>
        <p style={{ fontSize:15, fontWeight:700, marginBottom:8 }}>Algo salió mal</p>
        <p style={{ fontSize:12, color:'rgba(242,224,201,0.6)', marginBottom:20 }}>Ya quedó registrado el error. Probá recargar la app.</p>
        <button onClick={() => window.location.reload()} style={{ padding:'12px 24px', borderRadius:999, background:'linear-gradient(135deg,#E0B05E,#C9923A)', border:'none', fontWeight:700, color:'#0A1428' }}>Recargar</button>
      </div>
    }>
      <App />
    </Sentry.ErrorBoundary>
  </BrowserRouter>
)
