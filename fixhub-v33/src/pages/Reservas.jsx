import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, AccentCard, Card, OrnamentLine, PrimaryBtn, BottomNav, SectionLabel } from '../components/Palace'

const ESPACIOS = [
  { id: 'sum', nombre: 'Salón de Usos Múltiples', capacidad: 80, horario: '8:00 – 23:00', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { id: 'laundry', nombre: 'Laundry', capacidad: 4, horario: '7:00 – 22:00', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
  { id: 'gym', nombre: 'Gimnasio', capacidad: 10, horario: '6:00 – 23:00', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'terraza', nombre: 'Terraza', capacidad: 20, horario: '9:00 – 21:00', icon: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z' },
]

function formatFecha(d) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Reservas({ user }) {
  const [misReservas, setMisReservas] = useState([])
  const [selected, setSelected] = useState(null)
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data, error: e } = await supabase.from('reservas').select('*')
          .eq('vecino_id', user.id).order('fecha', { ascending: true })
        if (e) throw e
        setMisReservas(data || [])
      } catch (err) {
        console.error('Error cargando reservas:', err)
      }
    }
    fetch()
  }, [user.id, success])

  const reservar = async () => {
    if (!fecha || !hora) { setError('Elegí fecha y hora.'); return }
    setLoading(true); setError('')
    const { error: e } = await supabase.from('reservas').insert({
      vecino_id: user.id, edificio_id: user.edificio.id,
      espacio: selected.id, espacio_nombre: selected.nombre,
      fecha, hora, departamento: user.departamento, estado: 'confirmada'
    })
    if (e) { setError('Error al reservar. Verificá disponibilidad.'); setLoading(false); return }
    setSuccess(true); setLoading(false); setSelected(null); setFecha(''); setHora('')
    setTimeout(() => setSuccess(false), 3000)
  }

  const cancelar = async (id) => {
    const anterior = misReservas
    setMisReservas(prev => prev.map(r => r.id === id ? { ...r, estado: 'cancelada' } : r))
    try {
      const { error } = await supabase.from('reservas').update({ estado: 'cancelada' }).eq('id', id)
      if (error) throw error
    } catch (err) {
      setMisReservas(anterior)
      setError('No se pudo cancelar la reserva. Probá de nuevo.')
    }
  }

  return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title="Reservas" subtitle="Espacios comunes" />

      {success && (
        <div style={{ margin: '0 20px 16px', padding: '12px 16px', background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 4 }}>
          <p style={{ fontSize: 12, color: '#34d399', letterSpacing: '0.06em' }}>Reserva confirmada correctamente.</p>
        </div>
      )}

      {/* Espacios */}
      <div style={{ padding: '0 20px 20px' }}>
        <SectionLabel style={{ marginBottom: 12 }}>Seleccioná un espacio</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {ESPACIOS.map(e => (
            <AccentCard key={e.id} onClick={() => setSelected(selected?.id === e.id ? null : e)}
              accentColor={selected?.id === e.id ? 'var(--border-strong)' : 'var(--border)'}
              style={{ cursor: 'pointer' }}>
              <svg width="16" height="16" fill="none" stroke="var(--border)" strokeWidth="1.2" strokeLinecap="round" viewBox="0 0 24 24" style={{ marginBottom: 8 }}>
                <path d={e.icon} />
              </svg>
              <p style={{ fontSize: 12, color: selected?.id === e.id ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 500, lineHeight: 1.3 }}>{e.nombre}</p>
              <p style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 4, letterSpacing: '0.04em' }}>{e.horario}</p>
            </AccentCard>
          ))}
        </div>

        {/* Formulario reserva */}
        {selected && (
          <div style={{ marginTop: 16, padding: '16px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--input-bg)' }}>
            <p className="font-cormorant" style={{ fontSize: 16, color: 'var(--text-primary)', marginBottom: 12 }}>{selected.nombre}</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>Fecha</p>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, colorScheme: 'dark' }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>Hora</p>
                <input type="time" value={hora} onChange={e => setHora(e.target.value)}
                  style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, colorScheme: 'dark' }} />
              </div>
            </div>
            {error && <p style={{ color: '#f87171', fontSize: 11, marginBottom: 10 }}>{error}</p>}
            <PrimaryBtn onClick={reservar} disabled={loading}>{loading ? 'Reservando...' : 'Confirmar reserva'}</PrimaryBtn>
          </div>
        )}
      </div>

      <OrnamentLine opacity={0.08} style={{ margin: '0 20px' }} />

      {/* Mis reservas */}
      <div style={{ padding: '20px' }}>
        <SectionLabel style={{ marginBottom: 12 }}>Mis reservas</SectionLabel>
        {misReservas.filter(r => r.estado === 'confirmada').length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '20px 16px' }}>
            <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin reservas activas</p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {misReservas.filter(r => r.estado === 'confirmada').map(r => (
              <AccentCard key={r.id} accentColor="rgba(52,211,153,0.3)">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{r.espacio_nombre}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{formatFecha(r.fecha)} · {r.hora}</p>
                  </div>
                  <button onClick={() => cancelar(r.id)} style={{ fontSize: 9, color: 'rgba(248,113,113,0.45)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', border: '1px solid rgba(248,113,113,0.1)', borderRadius: 2 }}>
                    Cancelar
                  </button>
                </div>
              </AccentCard>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
