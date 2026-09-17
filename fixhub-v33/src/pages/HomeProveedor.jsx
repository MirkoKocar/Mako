import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { PalaceFrame, OrnamentLine, DiamondRow, AccentCard, Card, BottomNav, SectionLabel, AnimCounter } from '../components/Palace'

export default function HomeProveedor({ user }) {
  const navigate = useNavigate()
  const [disponible, setDisponible] = useState(user.disponible ?? true)
  const [activos, setActivos] = useState([])
  const [stats, setStats] = useState({ total: 0, completados: 0, pendientes: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data, error } = await supabase.from('avisos').select('*, vecinos(nombre,departamento)')
          .eq('proveedor_id', user.id).order('created_at', { ascending: false })
        if (error) throw error
        const todos = data || []
        setActivos(todos.filter(a => a.estado !== 'resuelto').slice(0, 5))
        setStats({ total: todos.length, completados: todos.filter(a => a.estado === 'resuelto').length, pendientes: todos.filter(a => a.estado !== 'resuelto').length })
      } catch (err) {
        console.error('Error cargando avisos del proveedor:', err)
      }
      setLoading(false)
    }
    fetch()
  }, [user.id])

  const toggleDisponible = async () => {
    const next = !disponible
    setDisponible(next)
    try {
      const { error } = await supabase.from('proveedores').update({ disponible: next }).eq('id', user.id)
      if (error) throw error
    } catch (err) {
      setDisponible(!next) // revertir si no se pudo guardar
    }
  }

  function ActionBtn({ label, sub, onClick }) {
    return (
      <div onClick={onClick} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '15px 14px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 3,
        position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: 0, left: 14, right: 14, height: 1, background: 'linear-gradient(to right,transparent,rgba(224,176,94,0.13),transparent)' }}/>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</p>
        {sub && <p style={{ fontSize: 9.5, color: 'var(--text-faint)', fontWeight: 500 }}>{sub}</p>}
      </div>
    )
  }

  return (
    <div className="page page-enter">
      <PalaceFrame />

      <div style={{ position: 'relative', padding: '52px 20px 24px', textAlign: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(180deg,rgba(96,165,250,0.05) 0%,transparent 100%)', borderBottomLeftRadius: '50% 20px', borderBottomRightRadius: '50% 20px', pointerEvents: 'none' }}/>
        <p className="animate-ornament" style={{ fontSize: 9, letterSpacing: '0.45em', color: 'rgba(224,176,94,0.45)', marginBottom: 8, fontWeight: 600 }}>✦ ✦ ✦</p>
        <h1 className="font-serif" style={{ fontSize: 26, color: 'var(--text-primary)', lineHeight: 1.05 }}>{user.nombre}</h1>
        <p style={{ fontSize: 9.5, color: 'var(--text-faint)', letterSpacing: '0.1em', marginTop: 4, fontWeight: 500 }}>{user.especialidad} · {user.edificio.nombre}</p>
        <div style={{ marginTop: 12 }}><OrnamentLine /></div>
      </div>

      {/* Toggle disponibilidad */}
      <div style={{ padding: '0 20px 18px' }}>
        <div onClick={toggleDisponible} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: disponible ? 'rgba(52,211,153,0.07)' : 'rgba(248,113,113,0.06)', border: `1px solid ${disponible ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.15)'}`, borderRadius: 16, padding: '14px 18px', cursor: 'pointer' }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: disponible ? '#34d399' : '#f87171' }}>{disponible ? 'Disponible' : 'No disponible'}</p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontWeight: 500 }}>{disponible ? 'Recibiendo solicitudes' : 'No recibís solicitudes'}</p>
          </div>
          <div style={{ width: 46, height: 26, borderRadius: 999, background: disponible ? 'rgba(52,211,153,0.6)' : 'rgba(248,113,113,0.4)', position: 'relative', transition: 'background 0.3s', flexShrink: 0 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--text-primary)', position: 'absolute', top: 3, left: disponible ? 23 : 3, transition: 'left 0.3s', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}/>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: '0 20px 18px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
        {[{ label: 'Total', value: stats.total, color: 'var(--text-secondary)' }, { label: 'Pendientes', value: stats.pendientes, color: '#fbbf24' }, { label: 'Completados', value: stats.completados, color: '#34d399' }].map(s => (
          <Card key={s.label} style={{ textAlign: 'center', padding: '13px 8px', borderRadius: 14 }}>
            <AnimCounter value={s.value} color={s.color} size={28} />
            <p style={{ fontSize: 8, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 5, fontWeight: 700 }}>{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Accesos rápidos */}
      <div style={{ padding: '0 20px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
        <ActionBtn label="Mi agenda" sub="Trabajos programados" onClick={() => navigate('/proveedor/agenda')} />
        <ActionBtn label="Historial" sub="Trabajos completados" onClick={() => navigate('/proveedor/historial')} />
      </div>

      <div style={{ padding: '0 20px' }}><DiamondRow count={3} opacity={0.09} /></div>

      {/* Trabajos activos */}
      <div style={{ padding: '14px 20px 0' }}>
        <SectionLabel style={{ marginBottom: 10 }}>Trabajos activos</SectionLabel>
        {loading ? (
          <p style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', padding: '20px 0' }}>Cargando...</p>
        ) : activos.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '22px', borderRadius: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Sin trabajos activos</p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activos.map(a => (
              <AccentCard key={a.id} onClick={() => navigate(`/proveedor/chat/${a.id}`)}
                accentColor={a.estado === 'nuevo' ? '#f87171' : '#fbbf24'}>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titulo}</p>
                <p style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 3, fontWeight: 500 }}>{a.vecinos?.nombre} · Depto {a.vecinos?.departamento}</p>
              </AccentCard>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
