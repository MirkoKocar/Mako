import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { emailValido, validarClave, TERMINOS_VERSION } from '../lib/validar'

const inputStyle = {
  width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
  borderRadius: 999, padding: '13px 20px', color: 'var(--text-primary)',
  fontSize: 14, fontFamily: "'DM Sans',sans-serif", fontWeight: 500
}

// Detecta si llegamos acá desde el link de "recuperar contraseña" que manda
// Supabase por mail (agrega #access_token=...&type=recovery a la URL).
function esLinkDeRecuperacion() {
  if (typeof window === 'undefined') return false
  return window.location.hash.includes('type=recovery')
}

// Redes sociales: cuando tengas los enlaces, pegalos en "url" (ej: 'https://instagram.com/tu_cuenta').
// Mientras estén vacíos se muestran como "próximamente" y no se pueden tocar.
const REDES = [
  { id: 'instagram', nombre: 'Instagram', url: '', icono: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.6" r="0.9" fill="currentColor" stroke="none"/></svg> },
  { id: 'facebook', nombre: 'Facebook', url: '', icono: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7.5h2.6l.5-3.2h-3.1V8.4c0-.9.4-1.7 1.8-1.7h1.4V3.9S15.4 3.7 14.3 3.7c-2.4 0-3.9 1.4-3.9 4v2.6H7.8v3.2h2.6V21h3.1Z"/></svg> },
]

export default function Auth({ onAuthed }) {
  const [modo, setModo]         = useState('login') // 'login' | 'registro' | 'verificarCodigo' | 'recuperar' | 'nuevaClave'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [codigo, setCodigo]     = useState('')
  const [error, setError]       = useState('')
  const [aviso, setAviso]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [acepta, setAcepta]     = useState(false)
  const [espera, setEspera]     = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    if (esLinkDeRecuperacion()) setModo('nuevaClave')
  }, [])

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80) }, [modo])
  useEffect(() => { if (espera <= 0) return; const t = setTimeout(() => setEspera(e => e - 1), 1000); return () => clearTimeout(t) }, [espera])

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError('Completá email y contraseña.'); return }
    if (!emailValido(email)) { setError('Ese email no parece válido — revisá que tenga @ y un dominio (ej: nombre@gmail.com).'); return }
    setLoading(true); setError('')
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (err) { setError(err.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : err.message); setLoading(false); return }
      onAuthed(data.user)
    } catch (err) {
      setError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.')
    }
    setLoading(false)
  }


  const handleRegistro = async () => {
    if (!email.trim() || !password) { setError('Completá email y contraseña.'); return }
    if (!emailValido(email)) { setError('Ese email no parece válido — revisá que tenga @ y un dominio (ej: nombre@gmail.com).'); return }
    const errClave = validarClave(password)
    if (errClave) { setError(errClave); return }
    if (!acepta) { setError('Tenés que aceptar los Términos y Condiciones y la Política de Privacidad para crear tu cuenta.'); return }
    setLoading(true); setError('')
    try {
      // El nombre y apellido NO se piden acá — se piden una sola vez, más
      // adelante, al vincular el código del edificio (evita pedirlo 2 veces).
      const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { terminos_version: TERMINOS_VERSION, terminos_aceptados_at: new Date().toISOString() } } })
      if (err) { setError(err.message === 'User already registered' ? 'Ese email ya tiene una cuenta. Iniciá sesión.' : err.message); setLoading(false); return }
      if (data.user && !data.session) {
        // Le pedimos el código de 6 dígitos que le llega por mail, en vez
        // de mandarlo a un link (que además dependía de la configuración
        // del dominio y podía romperse).
        setAviso('')
        setEspera(45)
        setModo('verificarCodigo')
        setLoading(false)
        return
      }
      onAuthed(data.user)
    } catch (err) {
      setError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.')
    }
    setLoading(false)
  }

  const handleVerificarCodigo = async () => {
    if (codigo.trim().length < 6) { setError('Ingresá el código de 6 dígitos que te mandamos por mail.'); return }
    setLoading(true); setError('')
    try {
      const { data, error: err } = await supabase.auth.verifyOtp({
        email: email.trim(), token: codigo.trim(), type: 'signup',
      })
      if (err) { setError('Código incorrecto o vencido. Revisá el mail o pedí uno nuevo.'); setLoading(false); return }
      onAuthed(data.user || data.session?.user)
    } catch (err) {
      setError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.')
    }
    setLoading(false)
  }

  const handleReenviarCodigo = async () => {
    if (espera > 0) return
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
      if (err) { setError(err.message); setLoading(false); return }
      setAviso('Te mandamos un código nuevo por mail.'); setEspera(45)
    } catch (err) {
      setError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.')
    }
    setLoading(false)
  }

  const handleRecuperar = async () => {
    if (!email.trim()) { setError('Ingresá tu email.'); return }
    if (!emailValido(email)) { setError('Ese email no parece válido.'); return }
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
      if (err) { setError(err.message); setLoading(false); return }
      setAviso('Te mandamos un mail con el link para elegir una contraseña nueva.')
    } catch (err) {
      setError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.')
    }
    setLoading(false)
  }

  const handleNuevaClave = async () => {
    const errClave2 = validarClave(password)
    if (errClave2) { setError(errClave2); return }
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) { setError(err.message); setLoading(false); return }
      window.location.hash = ''
      setAviso('Contraseña actualizada. Iniciá sesión de nuevo.')
      setModo('login')
      setPassword('')
    } catch (err) {
      setError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 24px', overflowY: 'auto', position: 'relative' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: 'clamp(20px, 5vh, 56px) 0 calc(24px + env(safe-area-inset-bottom, 0px))' }}>
      <div style={{ position: 'absolute', top: '5%', right: '-15%', width: '60%', height: '30%', background: 'radial-gradient(circle,rgba(224,176,94,0.06) 0%,transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }}/>

      <div style={{ textAlign: 'center', flexShrink: 0 }} className="fade-up">
        <p style={{ fontSize: 9, letterSpacing: '0.45em', color: 'rgba(224,176,94,0.45)', marginBottom: 10, fontWeight: 600 }}>✦ &nbsp; ✦ &nbsp; ✦</p>
        <h1 className="font-serif" style={{ fontSize: 'clamp(26px, 4.2vh + 10px, 34px)', color: 'var(--text-primary)', lineHeight: 1.0, marginBottom: 6 }}>
          {modo === 'registro' ? <>Creá tu<br/><em style={{ color: 'rgba(224,176,94,0.65)', fontStyle: 'italic' }}>cuenta.</em></>
           : modo === 'recuperar' ? <>Recuperar<br/><em style={{ color: 'rgba(224,176,94,0.65)', fontStyle: 'italic' }}>acceso.</em></>
           : modo === 'nuevaClave' ? <>Nueva<br/><em style={{ color: 'rgba(224,176,94,0.65)', fontStyle: 'italic' }}>contraseña.</em></>
           : <>Bienvenido<br/><em style={{ color: 'rgba(224,176,94,0.65)', fontStyle: 'italic' }}>de nuevo.</em></>}
        </h1>
        <p style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.14em', fontStyle: 'italic' }}>Tu espacio. Tu tranquilidad.</p>
        <div style={{ margin: '16px 0', display: 'flex', alignItems: 'center', gap: 10, opacity: 0.13 }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right,transparent,rgba(224,176,94,0.7))' }}/>
          {[0,1,2].map(i => <div key={i} style={{ width: 4, height: 4, border: '1px solid rgba(224,176,94,0.9)', transform: 'rotate(45deg)' }}/>)}
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left,transparent,rgba(224,176,94,0.7))' }}/>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }} className="fade-up-2">

        <div aria-hidden="true" style={{ width: 76, height: 76, margin: '0 auto 22px', borderRadius: 24, background: 'linear-gradient(145deg,#F0C77A 0%,#E0B05E 45%,#B98230 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 30px rgba(224,176,94,0.28), inset 0 1px 0 rgba(255,255,255,0.45)' }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path d="M6 18 20 6l14 12v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V18Z" fill="#0A1428"/>
            <path d="m14.5 24 4 4 7.5-8.5" stroke="#E0B05E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {aviso && (
          <div style={{ padding: '12px 16px', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 14, marginBottom: 14 }}>
            <p style={{ fontSize: 12, color: '#34d399', fontWeight: 600, textAlign: 'center' }}>{aviso}</p>
          </div>
        )}

        {modo === 'login' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="scale-in">
            <input ref={inputRef} type="email" autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="Email" style={inputStyle} />
            <input type="password" autoComplete="current-password" value={password} onChange={e => { setPassword(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="Contraseña" style={inputStyle} />
            {error && <p style={{ color: '#f87171', fontSize: 11, textAlign: 'center', fontWeight: 500 }}>{error}</p>}
            <button onClick={handleLogin} disabled={loading} style={{ width: '100%', background: 'linear-gradient(135deg,#E0B05E,#C9923A)', border: 'none', borderRadius: 999, padding: '14px', fontSize: 15, fontWeight: 700, color: '#0A1428', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Ingresando...' : 'Iniciar sesión'}
            </button>
            <button onClick={() => { setModo('recuperar'); setError(''); setAviso('') }} style={{ color: 'var(--text-faint)', fontSize: 11, padding: '4px', textAlign: 'center', fontWeight: 500 }}>¿Olvidaste tu contraseña?</button>

            <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }}/>
            <button onClick={() => { setModo('registro'); setError(''); setAviso('') }} style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 999, padding: '13px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Crear una cuenta nueva
            </button>
          </div>
        )}

        {modo === 'registro' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="scale-in">
            <input ref={inputRef} type="email" autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }} placeholder="Email" style={inputStyle} />
            <input type="password" autoComplete="new-password" value={password} onChange={e => { setPassword(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && handleRegistro()} placeholder="Contraseña (mín. 8, con letras y números)" style={inputStyle} />
            <p style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: 'center', marginTop: -2 }}>Tu nombre te lo vamos a pedir en el próximo paso, junto con el código de tu edificio.</p>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '2px 4px' }}>
              <input type="checkbox" checked={acepta} onChange={e => { setAcepta(e.target.checked); setError('') }} style={{ width: 19, height: 19, marginTop: 1, accentColor: '#E0B05E', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>Leí y acepto los <a href="/terminos.html" target="_blank" rel="noopener noreferrer" style={{ color: '#E0B05E' }}>Términos y Condiciones</a> y la <a href="/privacidad.html" target="_blank" rel="noopener noreferrer" style={{ color: '#E0B05E' }}>Política de Privacidad</a>.</span>
            </label>
            {error && <p style={{ color: '#f87171', fontSize: 11, textAlign: 'center', fontWeight: 500 }}>{error}</p>}
            <button onClick={handleRegistro} disabled={loading} style={{ width: '100%', background: 'linear-gradient(135deg,#E0B05E,#C9923A)', border: 'none', borderRadius: 999, padding: '14px', fontSize: 15, fontWeight: 700, color: '#0A1428', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Creando cuenta...' : 'Registrarme'}
            </button>

            <button onClick={() => { setModo('login'); setError(''); setAviso('') }} style={{ color: 'var(--text-faint)', fontSize: 11, padding: '6px', textAlign: 'center', fontWeight: 500 }}>Ya tengo cuenta — Iniciar sesión</button>
          </div>
        )}

        {modo === 'verificarCodigo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="scale-in">
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 4 }}>Te mandamos un código de 6 dígitos a <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>. Escribilo acá para confirmar tu cuenta.</p>
            <input ref={inputRef} value={codigo} onChange={e => { setCodigo(e.target.value.replace(/[^0-9]/g,'').slice(0,6)); setError('') }} onKeyDown={e => e.key === 'Enter' && handleVerificarCodigo()} placeholder="Código de 6 dígitos" inputMode="numeric" style={{ ...inputStyle, textAlign: 'center', letterSpacing: '0.4em', fontSize: 18, fontWeight: 700 }} />
            {error && <p style={{ color: '#f87171', fontSize: 11, textAlign: 'center', fontWeight: 500 }}>{error}</p>}
            {aviso && <p style={{ color: '#34d399', fontSize: 11, textAlign: 'center', fontWeight: 500 }}>{aviso}</p>}
            <button onClick={handleVerificarCodigo} disabled={loading} style={{ width: '100%', background: 'linear-gradient(135deg,#E0B05E,#C9923A)', border: 'none', borderRadius: 999, padding: '14px', fontSize: 15, fontWeight: 700, color: '#0A1428', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Verificando...' : 'Confirmar cuenta'}
            </button>
            <button onClick={handleReenviarCodigo} disabled={loading} style={{ color: 'var(--text-faint)', fontSize: 11, padding: '6px', textAlign: 'center', fontWeight: 500, opacity: espera > 0 ? 0.5 : 1 }}>{espera > 0 ? `Reenviar código (${espera}s)` : 'Reenviar código'}</button>
            <button onClick={() => { setModo('login'); setError(''); setAviso('') }} style={{ color: 'var(--text-faint)', fontSize: 10, padding: '6px', letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center', fontWeight: 600 }}>← Volver</button>
          </div>
        )}

        {modo === 'recuperar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="scale-in">
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 4 }}>Te mandamos un link a tu email para elegir una contraseña nueva.</p>
            <input ref={inputRef} type="email" autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && handleRecuperar()} placeholder="Email" style={inputStyle} />
            {error && <p style={{ color: '#f87171', fontSize: 11, textAlign: 'center', fontWeight: 500 }}>{error}</p>}
            <button onClick={handleRecuperar} disabled={loading} style={{ width: '100%', background: 'linear-gradient(135deg,#E0B05E,#C9923A)', border: 'none', borderRadius: 999, padding: '14px', fontSize: 15, fontWeight: 700, color: '#0A1428', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Enviando...' : 'Mandar link'}
            </button>
            <button onClick={() => { setModo('login'); setError(''); setAviso('') }} style={{ color: 'var(--text-faint)', fontSize: 10, padding: '6px', letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center', fontWeight: 600 }}>← Volver</button>
          </div>
        )}

        {modo === 'nuevaClave' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="scale-in">
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 4 }}>Elegí tu nueva contraseña.</p>
            <input ref={inputRef} type="password" autoComplete="new-password" value={password} onChange={e => { setPassword(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && handleNuevaClave()} placeholder="Contraseña nueva (mín. 8, con letras y números)" style={inputStyle} />
            {error && <p style={{ color: '#f87171', fontSize: 11, textAlign: 'center', fontWeight: 500 }}>{error}</p>}
            <button onClick={handleNuevaClave} disabled={loading} style={{ width: '100%', background: 'linear-gradient(135deg,#E0B05E,#C9923A)', border: 'none', borderRadius: 999, padding: '14px', fontSize: 15, fontWeight: 700, color: '#0A1428', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 20 }}/>

      <div style={{ paddingBottom: 22, textAlign: 'center', flexShrink: 0 }} className="fade-up-3">
        <p style={{ fontSize: 7.5, letterSpacing: '0.38em', textTransform: 'uppercase', color: 'rgba(224,176,94,0.12)', fontWeight: 600 }}>— MAKO · 2026 —</p>

        <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', opacity: 0.5 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
            <span style={{ fontSize: 9, color: 'var(--text-faint)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Seguinos</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            {REDES.map(r => {
              const caja = { width: 44, height: 44, borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', opacity: r.url ? 1 : 0.55 }
              return r.url
                ? <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" aria-label={r.nombre} style={caja}>{r.icono}</a>
                : <span key={r.id} aria-label={`${r.nombre} (próximamente)`} title="Próximamente" style={caja}>{r.icono}</span>
            })}
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.6 }}>
            Al usar MAKO aceptás los <a href="/terminos.html" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(224,176,94,0.85)' }}>Términos y Condiciones</a><br/>y la <a href="/privacidad.html" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(224,176,94,0.85)' }}>Política de Privacidad</a>.
          </p>
        </div>
      </div>
      </div>
    </div>
  )
}
