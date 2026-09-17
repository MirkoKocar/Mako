import React, { useState } from 'react'
import { supabase } from '../supabase'
import { Building2, Plus, ChevronRight, LogOut, DoorOpen } from 'lucide-react'

export default function AdminEdificios({ session, onSelectEdificio, onLogout, onSalirDelEdificio }) {
  const { edificios = [], pin } = session
  const [agregando, setAgregando] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [lista, setLista] = useState(edificios)

  const handleAgregar = async () => {
    const cod = codigo.trim().toUpperCase()
    if (!cod) { setError('Ingresá el código del edificio.'); return }
    setLoading(true); setError('')

    try {
      // No hace falta comparar el PIN acá: las reglas de seguridad del
      // servidor (RLS) solo devuelven el edificio si su PIN coincide con el
      // de tu sesión — si no coincide, esta consulta simplemente no trae
      // nada, sin exponer nunca el PIN real al navegador.
      const { data, error: e } = await supabase.from('edificios').select('*').eq('codigo_acceso', cod).limit(1)
      if (e) throw e
      if (!data?.length) { setError('Código incorrecto o el PIN no coincide con ese edificio.'); setLoading(false); return }

      const edif = data[0]
      if (lista.find(x => x.id === edif.id)) { setError('Ya tenés ese edificio agregado.'); setLoading(false); return }

      setLista(prev => [...prev, edif])
      setCodigo(''); setAgregando(false)
    } catch (err) {
      setError('No se pudo verificar el código. Revisá tu conexión e intentá de nuevo.')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', position: 'relative', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif" }}>

      {/* Blobs épicos */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-15%', right: '-20%', width: '70%', height: '50%', background: 'radial-gradient(circle, rgba(224,176,94,0.09) 0%, transparent 70%)', borderRadius: '50%', animation: 'blobTravel 18s ease-in-out infinite' }}/>
        <div style={{ position: 'absolute', bottom: '-10%', left: '-20%', width: '60%', height: '45%', background: 'radial-gradient(circle, rgba(96,165,250,0.06) 0%, transparent 70%)', borderRadius: '50%', animation: 'blobTravel 22s ease-in-out infinite', animationDelay: '-6s' }}/>
        <div style={{ position: 'absolute', top: '40%', right: '-10%', width: '40%', height: '35%', background: 'radial-gradient(circle, rgba(224,176,94,0.05) 0%, transparent 65%)', borderRadius: '50%', animation: 'blobTravel 20s ease-in-out infinite', animationDelay: '-12s' }}/>
      </div>

      <div style={{ position: 'relative', zIndex: 1, padding: '52px 22px 32px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }} className="fade-up">
          <p style={{ fontSize: 8, letterSpacing: '0.55em', color: 'rgba(224,176,94,0.4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Panel de Administración</p>

          {/* Ornamento */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 14, opacity: 0.35 }}>
            <div style={{ height: '1.5px', width: 50, background: 'linear-gradient(to right, transparent, var(--gold))' }}/>
            <div style={{ width: 6, height: 6, border: '1.5px solid var(--gold)', transform: 'rotate(45deg)' }}/>
            <div style={{ width: 4, height: 4, border: '1px solid var(--gold)', transform: 'rotate(45deg)' }}/>
            <div style={{ width: 6, height: 6, border: '1.5px solid var(--gold)', transform: 'rotate(45deg)' }}/>
            <div style={{ height: '1.5px', width: 50, background: 'linear-gradient(to left, transparent, var(--gold))' }}/>
          </div>

          <h1 className="font-serif" style={{ fontSize: 32, color: 'var(--text-primary)', lineHeight: 1.05, marginBottom: 6 }}>
            Mis Edificios
          </h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 500 }}>
            {lista.length} edificio{lista.length !== 1 ? 's' : ''} bajo tu gestión
          </p>

          {/* Línea ornamental */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, opacity: 0.2 }}>
            <div style={{ height: '1.5px', flex: 1, background: 'linear-gradient(to right, transparent, var(--gold))' }}/>
            <span className="font-serif" style={{ fontSize: 10, color: 'var(--gold)' }}>✦</span>
            <div style={{ height: '1.5px', flex: 1, background: 'linear-gradient(to left, transparent, var(--gold))' }}/>
          </div>
        </div>

        {/* Lista de edificios */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          {lista.map((edif, i) => (
            <button
              key={edif.id}
              onClick={() => onSelectEdificio(edif)}
              className="fade-up"
              style={{
                animationDelay: `${i * 0.08}s`, opacity: 0,
                width: '100%', textAlign: 'left', cursor: 'pointer',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderLeft: '3px solid rgba(224,176,94,0.5)',
                borderRadius: 20, padding: '18px 20px',
                display: 'flex', alignItems: 'center', gap: 16,
                boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                position: 'relative', overflow: 'hidden',
              }}
            >
              {/* Destello superior */}
              <div style={{ position: 'absolute', top: 0, left: 20, right: 20, height: 1, background: 'linear-gradient(to right, transparent, rgba(224,176,94,0.15), transparent)' }}/>

              {/* Ícono edificio */}
              <div style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: 'rgba(224,176,94,0.08)',
                border: '1px solid rgba(224,176,94,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Building2 size={22} color="#E0B05E" strokeWidth={1.5}/>
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-serif" style={{ fontSize: 17, color: 'var(--text-primary)', marginBottom: 3, lineHeight: 1.2 }}>{edif.nombre}</p>
                {edif.direccion && <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{edif.direccion}</p>}
                <p style={{ fontSize: 8.5, color: 'rgba(224,176,94,0.55)', fontWeight: 700, letterSpacing: '0.1em', marginTop: 4, textTransform: 'uppercase' }}>{edif.codigo_acceso}</p>
              </div>

              {/* Flecha */}
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(224,176,94,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ChevronRight size={16} color="rgba(224,176,94,0.6)" strokeWidth={2}/>
              </div>
            </button>
          ))}
        </div>

        {/* Botón agregar edificio */}
        {!agregando ? (
          <button
            onClick={() => setAgregando(true)}
            className="fade-up-3"
            style={{
              width: '100%', padding: '14px', borderRadius: 999,
              background: 'var(--gold-faint)',
              border: '1px dashed rgba(224,176,94,0.35)',
              color: 'var(--gold)', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              letterSpacing: '0.03em'
            }}
          >
            <Plus size={16} strokeWidth={2}/> Agregar otro edificio
          </button>
        ) : (
          <div className="scale-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', letterSpacing: '0.08em', fontWeight: 600 }}>Código del nuevo edificio</p>
            <input
              value={codigo}
              onChange={e => { setCodigo(e.target.value.toUpperCase()); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleAgregar()}
              placeholder="EDIFICIO2"
              autoFocus
              style={{
                width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                borderRadius: 999, padding: '12px 20px', color: 'var(--text-primary)',
                fontSize: 15, fontWeight: 700, letterSpacing: '0.1em', textAlign: 'center',
                fontFamily: "'DM Sans',sans-serif"
              }}
            />
            {error && <p style={{ color: 'var(--red)', fontSize: 11, textAlign: 'center', fontWeight: 500 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setAgregando(false); setCodigo(''); setError('') }} style={{ flex: 1, padding: '12px', borderRadius: 999, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600, fontSize: 13 }}>Cancelar</button>
              <button onClick={handleAgregar} disabled={loading || !codigo.trim()} style={{ flex: 2, padding: '12px', borderRadius: 999, background: codigo.trim() ? 'linear-gradient(135deg,#E0B05E,#C9923A)' : 'var(--bg-card)', border: 'none', color: codigo.trim() ? '#0A1428' : 'var(--text-muted)', fontWeight: 700, fontSize: 13, opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Verificando...' : 'Agregar'}
              </button>
            </div>
          </div>
        )}

        {/* Salir del edificio (sin cerrar sesión real) */}
        {onSalirDelEdificio && (
          <button onClick={onSalirDelEdificio} style={{ width: '100%', marginTop: 20, padding: '12px', borderRadius: 999, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <DoorOpen size={13} strokeWidth={2}/> Salir del edificio
          </button>
        )}

        {/* Cerrar sesión */}
        <button onClick={onLogout} style={{ width: '100%', marginTop: 10, padding: '12px', borderRadius: 999, background: 'transparent', border: '1px solid rgba(248,113,113,0.2)', color: 'rgba(248,113,113,0.5)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <LogOut size={13} strokeWidth={2}/> Cerrar sesión
        </button>

        {/* Footer ornamental */}
        <p style={{ textAlign: 'center', fontSize: 7.5, letterSpacing: '0.38em', textTransform: 'uppercase', color: 'rgba(224,176,94,0.1)', fontWeight: 600, marginTop: 24 }}>— MAKO · 2026 —</p>
      </div>
    </div>
  )
}
