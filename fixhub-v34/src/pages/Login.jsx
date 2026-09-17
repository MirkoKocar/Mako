import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabase'

function parseInput(raw) {
  const upper = raw.trim().toUpperCase()
  if (upper === 'INFRA') return { rol: 'infra', codigo: '' }
  if (upper.startsWith('VEC-')) return { rol: 'vecino', codigo: upper.slice(4) }
  if (upper.startsWith('ADM-')) return { rol: 'admin', codigo: upper.slice(4) }
  if (upper.startsWith('PRO-')) return { rol: 'proveedor', codigo: upper.slice(4) }
  return null
}

const rolColors = { vecino: '#34d399', admin: '#fbbf24', proveedor: '#60a5fa' }
const rolLabels = { vecino: 'Vecino', admin: 'Administrador', proveedor: 'Proveedor' }

const inputStyle = {
  width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
  borderRadius: 999, padding: '13px 20px', color: 'var(--text-primary)',
  fontSize: 14, fontFamily: "'DM Sans',sans-serif", fontWeight: 500
}

export default function Login({ onLogin, authUserId }) {
  const [step, setStep]       = useState(1)
  const [input, setInput]     = useState('')
  const [pin, setPin]         = useState('')
  const [nombre, setNombre]   = useState('')
  const [tipoUnidad, setTipoUnidad] = useState('depto') // 'depto' | 'lote' | 'otro'
  const [piso, setPiso]       = useState('')
  const [letraUnidad, setLetraUnidad] = useState('')
  const [lote, setLote]       = useState('')
  const [otroUnidad, setOtroUnidad] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed]   = useState(null)
  const [edificio, setEdificio] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80) }, [step])

  // STEP 1: validar código de acceso
  const handleCode = async () => {
    const p = parseInput(input)
    if (!p) { setError('Usá VEC-, ADM-, PRO- o el código especial'); return }

    if (p.rol === 'infra') {
      setLoading(true); setError('')
      try {
        const { data: esInfra, error: e } = await supabase.rpc('fh_es_infra')
        if (e) { setError('No se pudo verificar el acceso. Probá de nuevo.'); setLoading(false); return }
        if (!esInfra) { setError('Esta cuenta no tiene acceso al panel INFRA.'); setLoading(false); return }
        onLogin({ _infra: true })
      } catch (err) {
        setError('No se pudo verificar el acceso. Revisá tu conexión.')
      }
      setLoading(false)
      return
    }

    setLoading(true); setError('')
    try {
      // Ya no se hace SELECT * a edificios (ahí vivía el PIN expuesto):
      // se usa una función del servidor que solo devuelve nombre/dirección.
      const { data, error: e } = await supabase.rpc('fh_buscar_edificio', { p_codigo: p.codigo })
      if (e) { setError('No se pudo verificar el código. Probá de nuevo.'); setLoading(false); return }
      if (!data?.length) { setError('Código no encontrado.'); setLoading(false); return }
      if (data[0].estado_pago === 'moroso') {
        setError('El acceso de este edificio está suspendido temporalmente. Pedile al administrador que se contacte con MAKO para regularizarlo.')
        setLoading(false); return
      }
      setParsed(p); setEdificio(data[0])
      setStep(p.rol === 'admin' ? 'pin' : 2)
    } catch (err) {
      setError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.')
    }
    setLoading(false)
  }

  // STEP pin: validar PIN del admin y buscar todos sus edificios
  const handlePin = async () => {
    // IMPORTANTE: esto tiene que ser lo primero que se ejecuta en el handler
    // del click, sin ningún "await" antes. Así el navegador lo reconoce como
    // originado por un toque real del usuario y sí muestra el cartel nativo.
    // Si se dispara después de una espera (ej: después de consultar Supabase),
    // muchos Chrome lo ignoran en silencio y el cartel nunca aparece.
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    if (pin.length !== 6) { setError('El PIN debe tener 6 dígitos.'); return }
    setLoading(true); setError('')
    try {
      // El PIN ahora se verifica en el servidor (fh_verificar_pin): el
      // cliente nunca ve el pin_admin real, ni el correcto ni el ingresado
      // se comparan en el navegador.
      const { data: misEdificios, error: e } = await supabase.rpc('fh_verificar_pin', {
        p_edificio_id: edificio.id, p_pin: pin
      })
      if (e) { setError('No se pudo verificar el PIN. Probá de nuevo.'); setLoading(false); return }
      if (!misEdificios?.length) { setError('PIN incorrecto.'); setLoading(false); return }

      const activos = misEdificios.filter(ed => ed.estado_pago !== 'moroso')
      if (activos.length === 0) {
        setError('El acceso de tus edificios está suspendido temporalmente. Contactate con MAKO para regularizarlo.')
        setLoading(false); return
      }

      if (authUserId) {
        const { error: ePerfil } = await supabase.from('perfiles').upsert(
          { auth_user_id: authUserId, rol:'admin', pin, edificio_id: activos[0].id, nombre:'Administrador' },
          { onConflict: 'auth_user_id' }
        )
        if (ePerfil) { setError('No se pudo guardar tu sesión. Probá de nuevo.'); setLoading(false); return }
      }

      // Pasar directo al panel multi-edificio
      onLogin({ rol: 'admin', pin, edificios: activos, edificio: activos[0], nombre: 'Administrador', id: edificio.id })
    } catch (err) {
      setError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.')
    }
    setLoading(false)
  }

  // Arma y valida el valor final de "unidad" según el tipo elegido, para
  // evitar que alguien cargue cualquier cosa en vez de su depto real
  // (control anti-trampa: si es depto, exige número + letra; si es lote,
  // exige un número de lote; si es "otro", queda libre).
  const construirUnidad = () => {
    if (tipoUnidad === 'depto') {
      const p = piso.trim()
      const l = letraUnidad.trim().toUpperCase()
      if (!p || !/^\d{1,3}$/.test(p)) return { error: 'Ingresá el piso, solo números (ej: 4).' }
      if (!l || !/^[A-Za-z]{1,2}$/.test(l)) return { error: 'Ingresá la unidad, solo letras (ej: B).' }
      return { valor: `${p}${l}` }
    }
    if (tipoUnidad === 'lote') {
      const n = lote.trim()
      if (!n || !/^\d{1,4}$/.test(n)) return { error: 'Ingresá el número de lote, solo números (ej: 12).' }
      return { valor: `LOTE ${n}` }
    }
    const o = otroUnidad.trim()
    if (!o) return { error: 'Ingresá tu unidad o identificación dentro del edificio.' }
    return { valor: o }
  }

  // STEP 2: nombre/depto para vecino y proveedor
  const handleEnter = async () => {
    // Ídem: disparado ANTES de cualquier await, pegado al toque real.
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    if (!nombre.trim()) { setError('Ingresá tu nombre.'); return }
    let deptoNorm = ''
    if (parsed.rol === 'vecino') {
      const resultado = construirUnidad()
      if (resultado.error) { setError(resultado.error); return }
      deptoNorm = resultado.valor
    }
    setLoading(true); setError('')

    try {
      if (parsed.rol === 'vecino') {
        const { data: v, error: eBuscar } = await supabase.rpc('fh_buscar_vecino', {
          p_edificio_id: edificio.id, p_departamento: deptoNorm
        })
        if (eBuscar) { setError('No se pudo verificar el departamento. Probá de nuevo.'); setLoading(false); return }
        let vecino = v?.[0]
        if (!vecino) {
          const { data: nuevo, error: e } = await supabase.rpc('fh_crear_vecino', {
            p_edificio_id: edificio.id, p_departamento: deptoNorm, p_nombre: nombre.trim()
          })
          if (e || !nuevo?.[0]) { setError('No se pudo completar el registro. Probá de nuevo.'); setLoading(false); return }
          vecino = nuevo[0]
        }
        if (authUserId) {
          const { error: ePerfil } = await supabase.from('perfiles').upsert(
            { auth_user_id: authUserId, rol:'vecino', edificio_id: edificio.id, persona_id: vecino.id, nombre: vecino.nombre },
            { onConflict: 'auth_user_id' }
          )
          if (ePerfil) { setError('No se pudo guardar tu sesión. Probá de nuevo.'); setLoading(false); return }
        }
        onLogin({ ...vecino, edificio, rol: 'vecino' })
      } else {
        const { data: prov, error: eBuscar } = await supabase.rpc('fh_buscar_proveedor', {
          p_edificio_id: edificio.id, p_nombre: nombre.trim()
        })
        if (eBuscar) { setError('No se pudo verificar el proveedor. Probá de nuevo.'); setLoading(false); return }
        if (!prov?.[0]) { setError('Proveedor no encontrado en este edificio. Revisá que el nombre sea exactamente igual al que cargó el admin.'); setLoading(false); return }
        if (authUserId) {
          const { error: ePerfil } = await supabase.from('perfiles').upsert(
            { auth_user_id: authUserId, rol:'proveedor', edificio_id: edificio.id, persona_id: prov[0].id, nombre: prov[0].nombre },
            { onConflict: 'auth_user_id' }
          )
          if (ePerfil) { setError('No se pudo guardar tu sesión. Probá de nuevo.'); setLoading(false); return }
        }
        onLogin({ ...prov[0], edificio, rol: 'proveedor' })
      }
    } catch (err) {
      setError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.')
    }
    setLoading(false)
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', padding: '0 26px', overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '5%', right: '-15%', width: '60%', height: '30%', background: 'radial-gradient(circle,rgba(224,176,94,0.06) 0%,transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }}/>

      {/* Header */}
      <div style={{ paddingTop: 44, textAlign: 'center', flexShrink: 0 }} className="fade-up">
        <p style={{ fontSize: 9, letterSpacing: '0.45em', color: 'rgba(224,176,94,0.45)', marginBottom: 10, fontWeight: 600 }}>✦ &nbsp; ✦ &nbsp; ✦</p>
        <h1 className="font-logo" style={{ fontSize: 34, color: 'var(--text-primary)', lineHeight: 1.0, marginBottom: 8, letterSpacing: '0.06em', fontWeight: 700 }}>
          MAKO
        </h1>
        <p style={{ fontSize: 10, color: 'rgba(224,176,94,0.7)', letterSpacing: '0.45em', textTransform: 'uppercase', fontWeight: 600, paddingLeft: '0.45em' }}>Consorcios</p>
        <div style={{ margin: '16px 0', display: 'flex', alignItems: 'center', gap: 10, opacity: 0.13 }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right,transparent,rgba(224,176,94,0.7))' }}/>
          {[0,1,2].map(i => <div key={i} style={{ width: 4, height: 4, border: '1px solid rgba(224,176,94,0.9)', transform: 'rotate(45deg)' }}/>)}
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left,transparent,rgba(224,176,94,0.7))' }}/>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 22 }} className="fade-up-2">

        <div style={{ width: 64, height: 64, margin: '0 auto 20px', borderRadius: 20, background: 'var(--bg-card)', border: '1px solid var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E0B05E" strokeWidth="1.6"><path d="M6 22V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v18M6 22h14M13 22V9a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v13M9 7h.01M9 11h.01M9 15h.01" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>

        {/* STEP 1: Código */}
        {step === 1 && (
          <div>
            <p style={{ fontSize: 9, letterSpacing: '0.22em', color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: 14, textAlign: 'center', fontWeight: 600 }}>
              VEC · ADM · PRO — código del edificio
            </p>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input ref={inputRef} value={input}
                onChange={e => { setInput(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleCode()}
                placeholder="VEC-EDIFICIO1"
                style={{ ...inputStyle, padding: '12px 50px 12px 20px', fontSize: 17, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', caretColor: '#E0B05E' }}
              />
              <button onClick={handleCode} disabled={loading} style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, borderRadius: '50%', background: input.trim() ? 'linear-gradient(135deg,#E0B05E,#C9923A)' : 'var(--bg-card)', border: 'none', color: input.trim() ? '#0A1428' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {loading ? <span style={{ fontSize: 9 }}>···</span> : <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>}
              </button>
            </div>
            {error && <p style={{ color: '#f87171', fontSize: 11, textAlign: 'center', marginBottom: 10, fontWeight: 500 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 7, justifyContent: 'center', marginTop: 10 }}>
              {[['VEC-', '#34d399'], ['ADM-', '#fbbf24'], ['PRO-', '#60a5fa']].map(([p, c]) => (
                <button key={p} onClick={() => setInput(p)} style={{ padding: '6px 14px', borderRadius: 999, background: `${c}22`, border: `1px solid ${c}80`, color: c, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em' }}>{p}</button>
              ))}
            </div>
          </div>
        )}

        {/* STEP pin: PIN admin de 6 dígitos */}
        {step === 'pin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="scale-in">
            <div style={{ padding: '13px 16px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: 18, textAlign: 'center', marginBottom: 6 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.24em', color: '#fbbf24', textTransform: 'uppercase', marginBottom: 4, fontWeight: 700 }}>Administrador</p>
              <p className="font-serif" style={{ fontSize: 19, color: 'var(--text-primary)' }}>{edificio?.nombre}</p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{edificio?.direccion}</p>
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', letterSpacing: '0.08em' }}>Ingresá tu PIN de 6 dígitos</p>
            <input
              ref={inputRef}
              value={pin}
              onChange={e => { const v = e.target.value.replace(/\D/g,'').slice(0,6); setPin(v); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handlePin()}
              placeholder="● ● ● ● ● ●"
              type="password"
              inputMode="numeric"
              maxLength={6}
              style={{ ...inputStyle, fontSize: 22, letterSpacing: '0.5em', textAlign: 'center', fontWeight: 700 }}
            />
            {error && <p style={{ color: '#f87171', fontSize: 11, textAlign: 'center', fontWeight: 500 }}>{error}</p>}
            <button onClick={handlePin} disabled={loading || pin.length !== 6} style={{ width: '100%', background: pin.length === 6 ? 'linear-gradient(135deg,#E0B05E,#C9923A)' : 'var(--bg-card)', border: `1px solid ${pin.length === 6 ? 'transparent' : 'var(--border)'}`, borderRadius: 999, padding: '14px', fontSize: 15, fontWeight: 700, color: pin.length === 6 ? '#0A1428' : 'var(--text-muted)', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Verificando...' : 'Ingresar'}
            </button>
            <button onClick={() => { setStep(1); setPin(''); setError('') }} style={{ color: 'var(--text-faint)', fontSize: 10, padding: '6px', letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center', fontWeight: 600 }}>← Volver</button>
          </div>
        )}

        {/* STEP 2: Nombre/depto para vecino y proveedor */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="scale-in">
            <div style={{ padding: '13px 16px', background: `linear-gradient(135deg,${rolColors[parsed?.rol]}0D,transparent)`, border: `1px solid ${rolColors[parsed?.rol]}22`, borderRadius: 18, textAlign: 'center', marginBottom: 2 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.24em', color: rolColors[parsed?.rol], textTransform: 'uppercase', marginBottom: 4, fontWeight: 700 }}>{rolLabels[parsed?.rol]}</p>
              <p className="font-serif" style={{ fontSize: 19, color: 'var(--text-primary)' }}>{edificio?.nombre}</p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{edificio?.direccion}</p>
            </div>
            <input ref={inputRef} value={nombre} onChange={e => { setNombre(e.target.value); setError('') }} placeholder="Nombre completo" style={inputStyle} />
            {parsed?.rol === 'vecino' && (
              <>
                <div style={{ display:'flex', gap:6, marginTop:2 }}>
                  {[
                    { id:'depto', label:'Depto' },
                    { id:'lote', label:'Lote' },
                    { id:'otro', label:'Otro' },
                  ].map(t => (
                    <button key={t.id} onClick={() => { setTipoUnidad(t.id); setError('') }}
                      style={{ flex:1, padding:'9px 4px', borderRadius:999, fontSize:11.5, fontWeight:700,
                        background: tipoUnidad===t.id ? 'linear-gradient(135deg,#E0B05E,#C9923A)' : 'var(--bg-card)',
                        color: tipoUnidad===t.id ? '#0A1428' : 'var(--text-muted)',
                        border: `1px solid ${tipoUnidad===t.id ? 'transparent' : 'var(--border)'}` }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {tipoUnidad === 'depto' && (
                  <div style={{ display:'flex', gap:8 }}>
                    <input value={piso} onChange={e => { setPiso(e.target.value.replace(/[^0-9]/g,'')); setError('') }}
                      onKeyDown={e => e.key === 'Enter' && handleEnter()} placeholder="Piso (ej: 4)" inputMode="numeric"
                      style={{ ...inputStyle, flex:1 }} />
                    <input value={letraUnidad} onChange={e => { setLetraUnidad(e.target.value.replace(/[^A-Za-z]/g,'').slice(0,2)); setError('') }}
                      onKeyDown={e => e.key === 'Enter' && handleEnter()} placeholder="Unidad (ej: B)"
                      style={{ ...inputStyle, flex:1, textTransform:'uppercase', letterSpacing:'0.07em' }} />
                  </div>
                )}
                {tipoUnidad === 'lote' && (
                  <input value={lote} onChange={e => { setLote(e.target.value.replace(/[^0-9]/g,'')); setError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleEnter()} placeholder="N° de lote (ej: 12)" inputMode="numeric"
                    style={inputStyle} />
                )}
                {tipoUnidad === 'otro' && (
                  <input value={otroUnidad} onChange={e => { setOtroUnidad(e.target.value); setError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleEnter()} placeholder="Tu identificación dentro del edificio"
                    style={inputStyle} />
                )}
                <p style={{ fontSize:9.5, color:'var(--text-faint)', paddingLeft:4 }}>Para evitar errores de carga, el piso y la unidad se piden por separado.</p>
              </>
            )}
            {error && <p style={{ color: '#f87171', fontSize: 11, textAlign: 'center', fontWeight: 500 }}>{error}</p>}
            <button onClick={handleEnter} disabled={loading} style={{ width: '100%', background: 'linear-gradient(135deg,#E0B05E,#C9923A)', border: 'none', borderRadius: 999, padding: '14px', fontSize: 15, fontWeight: 700, color: '#0A1428', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
            <button onClick={() => { setStep(1); setError(''); setParsed(null); setEdificio(null); setPiso(''); setLetraUnidad(''); setLote(''); setOtroUnidad('') }} style={{ color: 'var(--text-faint)', fontSize: 10, padding: '6px', letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center', fontWeight: 600 }}>← Volver</button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 20 }}/>

      <div style={{ paddingBottom: 22, textAlign: 'center', flexShrink: 0 }} className="fade-up-3">
        <p style={{ fontSize: 7.5, letterSpacing: '0.38em', textTransform: 'uppercase', color: 'rgba(224,176,94,0.12)', fontWeight: 600 }}>— MAKO · 2026 —</p>
      </div>
    </div>
  )
}
