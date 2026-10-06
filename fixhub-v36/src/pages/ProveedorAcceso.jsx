import React, { useState } from 'react'
import { supabase } from '../supabase'
import { PalaceFrame } from '../components/Palace'
import { TERMINOS_VERSION } from '../lib/validar'

// Pantalla a la que llega el proveedor desde el link que le manda el administrador.
// Sin usuario ni contraseña: un toque y entra directo al trabajo.
export default function ProveedorAcceso({ token }) {
  const [acepta, setAcepta] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  const entrar = async () => {
    if (!acepta) { setError('Tenés que aceptar los Términos y la Política de Privacidad para continuar.'); return }
    setCargando(true); setError('')
    try {
      const res = await fetch('/.netlify/functions/proveedor-acceso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, aceptaTerminos: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo abrir el link.'); setCargando(false); return }
      const { error: e } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' })
      if (e) { setError('No se pudo iniciar la sesión. Pedile un link nuevo al administrador.'); setCargando(false); return }
      try {
        localStorage.setItem('mako_welcome_visto', 'true')
        localStorage.removeItem('fixhub_session_v9')
        localStorage.setItem('fixhub_open_aviso', data.aviso_id)
      } catch { /* no-op */ }
      window.location.replace('/')      // sale de /t/<token>: el link no queda en la barra ni en el historial
    } catch (err) {
      setError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.')
      setCargando(false)
    }
  }

  return (
    <div className="pantalla-centrada">
      <PalaceFrame />
      <div style={{ paddingTop: 'clamp(16px, 4vh, 48px)', textAlign: 'center' }}>
        <p style={{ fontSize: 9, letterSpacing: '0.45em', color: 'rgba(224,176,94,0.45)', marginBottom: 10, fontWeight: 600 }}>✦ &nbsp; ✦ &nbsp; ✦</p>
        <h1 className="font-serif" style={{ fontSize: 30, color: 'var(--text-primary)', lineHeight: 1.05 }}>Tenés un trabajo<br /><em style={{ color: 'rgba(224,176,94,0.65)', fontStyle: 'italic' }}>nuevo.</em></h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 16, lineHeight: 1.6 }}>Un administrador te asignó un trabajo. Entrá para ver la dirección, el problema y las fotos, y confirmar si podés ir.</p>
      </div>

      <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={acepta} onChange={e => { setAcepta(e.target.checked); setError('') }} style={{ width: 20, height: 20, marginTop: 1, accentColor: '#E0B05E', flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>Acepto los <a href="/terminos.html" target="_blank" rel="noopener noreferrer" style={{ color: '#E0B05E' }}>Términos y Condiciones</a> y la <a href="/privacidad.html" target="_blank" rel="noopener noreferrer" style={{ color: '#E0B05E' }}>Política de Privacidad</a> (versión {TERMINOS_VERSION}).</span>
        </label>
        {error && <p style={{ color: '#f87171', fontSize: 12, textAlign: 'center', fontWeight: 600, lineHeight: 1.45 }}>{error}</p>}
        <button onClick={entrar} disabled={cargando} style={{ width: '100%', background: 'linear-gradient(135deg,#E0B05E,#C9923A)', borderRadius: 999, padding: '17px', fontSize: 16, fontWeight: 800, color: '#0A1428', opacity: cargando ? 0.6 : 1 }}>
          {cargando ? 'Entrando...' : 'Ver el trabajo'}
        </button>
        <p style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.5 }}>No hace falta crear una cuenta ni usar contraseña. Este link es solo para vos: no lo compartas.</p>
      </div>
    </div>
  )
}
