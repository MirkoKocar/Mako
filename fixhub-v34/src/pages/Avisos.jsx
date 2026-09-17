import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, Card, StatusBadge, UrgenciaBadge, BottomNav } from '../components/Palace'

const FILTROS = ['Todos', 'Nuevo', 'En curso', 'Resuelto']
const estadoMap = { 'Nuevo': 'nuevo', 'En curso': 'en_curso', 'Resuelto': 'resuelto' }

export default function Avisos({ user }) {
  const navigate = useNavigate()
  const [avisos, setAvisos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('Todos')

  useEffect(() => {
    const fetch = async () => {
      let q = supabase.from('avisos').select('*').eq('vecino_id', user.id).order('created_at', { ascending: false })
      const { data } = await q
      setAvisos(data || [])
      setLoading(false)
    }
    fetch()
  }, [user.id])

  const filtrados = filtro === 'Todos' ? avisos : avisos.filter(a => a.estado === estadoMap[filtro])

  return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title="Mis Avisos" subtitle="Historial de reportes" />

      {/* Filtros */}
      <div style={{ padding: '0 20px 20px', display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 20 }}>
        {FILTROS.map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            padding: '7px 16px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0,
            background: filtro === f ? 'var(--gold-faint)' : 'transparent',
            border: `1px solid ${filtro === f ? 'var(--border)' : 'var(--border)'}`,
            color: filtro === f ? 'var(--text-primary)' : 'var(--text-faint)',
            fontSize: 11, letterSpacing: '0.05em', transition: 'all 0.2s'
          }}>{f}</button>
        ))}
      </div>

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, padding: '30px 0' }}>Cargando...</p>
        ) : filtrados.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '32px 16px' }}>
            <p style={{ fontSize: 14, color: 'var(--text-faint)' }}>Sin avisos {filtro !== 'Todos' ? `"${filtro}"` : ''}</p>
            <button onClick={() => navigate('/aviso')} style={{ marginTop: 12, fontSize: 11, color: '#D9CBB0', letterSpacing: '0.06em' }}>
              Crear aviso →
            </button>
          </Card>
        ) : (
          filtrados.map(a => (
            <Card key={a.id} onClick={() => navigate(`/chat/${a.id}`)} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <p style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, flex: 1, marginRight: 10, lineHeight: 1.3 }}>{a.titulo}</p>
                <StatusBadge estado={a.estado} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{a.categoria}</span>
                {a.urgencia && <><span style={{ color: 'var(--text-faint)', fontSize: 10 }}>·</span><UrgenciaBadge urgencia={a.urgencia} /></>}
                <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-faint)' }}>
                  {new Date(a.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                </span>
              </div>
              {a.descripcion && (
                <p style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {a.descripcion}
                </p>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
