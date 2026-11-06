import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, AccentCard, Card, BottomNav, SectionLabel } from '../components/Palace'

export default function ActivityLog({ user }) {
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const [avRes, resRes, anRes] = await Promise.all([
        supabase.from('avisos').select('id,titulo,estado,created_at,updated_at,vecinos(departamento)').eq('edificio_id', user.edificio.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('reservas').select('espacio_nombre,departamento,fecha,created_at').eq('edificio_id', user.edificio.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('anuncios').select('titulo,created_at').eq('edificio_id', user.edificio.id).order('created_at', { ascending: false }).limit(5),
      ])
      const todos = [
        ...(avRes.data || []).map(a => ({ tipo: 'aviso', desc: `Aviso: ${a.titulo}`, sub: `Depto ${a.vecinos?.departamento} · ${a.estado}`, fecha: a.created_at, color: a.estado === 'resuelto' ? 'rgba(52,211,153,0.4)' : a.estado === 'en_curso' ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.4)' })),
        ...(resRes.data || []).map(r => ({ tipo: 'reserva', desc: `Reserva: ${r.espacio_nombre}`, sub: `Depto ${r.departamento} · ${new Date(r.fecha).toLocaleDateString('es-AR')}`, fecha: r.created_at, color: 'rgba(96,165,250,0.4)' })),
        ...(anRes.data || []).map(a => ({ tipo: 'anuncio', desc: `Anuncio: ${a.titulo}`, sub: 'Publicado por admin', fecha: a.created_at, color: 'var(--border-strong)' })),
      ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 30)
      setEventos(todos)
      setLoading(false)
    }
    fetch()
  }, [user.edificio.id])

  return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title="Actividad" subtitle="Timeline del edificio" />
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, padding: '30px 0' }}>Cargando...</p>
        ) : eventos.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: 12 }}>
            {/* Timeline line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ width: 7, height: 7, border: `1px solid ${e.color}`, transform: 'rotate(45deg)', background: `${e.color}30`, flexShrink: 0 }} />
              {i < eventos.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: 4 }}>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, lineHeight: 1.3 }}>{e.desc}</p>
              <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{e.sub}</p>
              <p style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 3, letterSpacing: '0.06em' }}>
                {new Date(e.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })} · {new Date(e.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
