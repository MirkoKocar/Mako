import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Monitoreo de errores: se carga SOLO si hay VITE_SENTRY_DSN (así no pesa en el arranque).
if (import.meta.env.VITE_SENTRY_DSN) {
  import('@sentry/react').then(Sentry => {
    Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, environment: import.meta.env.MODE, tracesSampleRate: 0.1 })
    window.__sentry = Sentry
  }).catch(() => {})
}

// Service Worker de Firebase (necesario para las notificaciones push).
// Se registra cuando la página ya terminó de cargar, para no frenar el arranque.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(err => console.warn('SW:', err))
  })
}

class ErrorBoundary extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { try { window.__sentry?.captureException(error) } catch {} }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center', background:'var(--bg)', color:'var(--text-primary)' }}>
        <p style={{ fontSize:15, fontWeight:700, marginBottom:8 }}>Algo salió mal</p>
        <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:20 }}>Probá recargar la app.</p>
        <button onClick={() => window.location.reload()} style={{ padding:'12px 24px', borderRadius:999, background:'linear-gradient(135deg,#E0B05E,#C9923A)', border:'none', fontWeight:700, color:'#0A1428' }}>Recargar</button>
      </div>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </BrowserRouter>
)
