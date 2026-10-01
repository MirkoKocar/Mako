import React, { useState } from 'react'
import { supabase } from '../supabase'
import { PalaceFrame } from './Palace'
import { TERMINOS_VERSION } from '../lib/validar'

// Se muestra una sola vez a las cuentas que todavía no aceptaron la versión vigente.
export default function TermsGate({ onAceptado, onSalir }) {
  const [acepta, setAcepta] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  const continuar = async () => {
    if (!acepta) { setError('Tenés que aceptar para seguir usando la app.'); return }
    setCargando(true); setError('')
    const { data, error: e } = await supabase.auth.updateUser({ data: { terminos_version: TERMINOS_VERSION, terminos_aceptados_at: new Date().toISOString() } })
    if (e) { setError('No se pudo guardar. Revisá tu conexión e intentá de nuevo.'); setCargando(false); return }
    await supabase.rpc('fh_aceptar_terminos', { p_version: TERMINOS_VERSION })   // si todavía no hay perfil, no hace nada (se copia al vincular)
    onAceptado(data.user)
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', padding: '0 26px', overflow: 'auto' }}>
      <PalaceFrame />
      <div style={{ paddingTop: 80, textAlign: 'center' }}>
        <h1 className="font-serif" style={{ fontSize: 26, color: 'var(--text-primary)' }}>Actualizamos nuestros términos</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 14, lineHeight: 1.6 }}>Para seguir usando la app necesitás aceptar los Términos y Condiciones y la Política de Privacidad. Ahí explicamos cómo se usan tus datos, cómo se gestionan los reclamos y cómo eliminar tu cuenta cuando quieras.</p>
      </div>
      <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={acepta} onChange={e => { setAcepta(e.target.checked); setError('') }} style={{ width: 20, height: 20, marginTop: 1, accentColor: '#E0B05E', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>Leí y acepto los <a href="/terminos.html" target="_blank" rel="noopener noreferrer" style={{ color: '#E0B05E' }}>Términos y Condiciones</a> y la <a href="/privacidad.html" target="_blank" rel="noopener noreferrer" style={{ color: '#E0B05E' }}>Política de Privacidad</a>.</span>
        </label>
        {error && <p style={{ color: '#f87171', fontSize: 12, textAlign: 'center', fontWeight: 600 }}>{error}</p>}
        <button onClick={continuar} disabled={cargando} style={{ width: '100%', background: 'linear-gradient(135deg,#E0B05E,#C9923A)', borderRadius: 999, padding: 16, fontSize: 15, fontWeight: 800, color: '#0A1428', opacity: cargando ? 0.6 : 1 }}>{cargando ? 'Guardando...' : 'Aceptar y continuar'}</button>
        <button onClick={onSalir} style={{ fontSize: 12, color: 'var(--text-faint)', padding: 8 }}>No acepto — cerrar sesión</button>
      </div>
    </div>
  )
}
