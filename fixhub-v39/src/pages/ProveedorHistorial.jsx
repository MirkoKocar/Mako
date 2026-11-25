import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, AccentCard, Card, BottomNav, SectionLabel } from '../components/Palace'

export default function ProveedorHistorial({ user }) {
  const navigate = useNavigate()
  const [historial, setHistorial] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data, error } = await supabase.from('avisos').select('*, vecinos(nombre,departamento)')
          .eq('proveedor_id', user.id).eq('estado', 'resuelto').order('updated_at', { ascending: false })
        if (error) throw error
        setHistorial(data || [])
      } catch (err) {
        setErrorCarga('No se pudo cargar el historial. Revisá tu conexión.')
      }
      setLoading(false)
    }
    fetch()
  }, [user.id])

  return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title="Historial" subtitle="Trabajos completados" />
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SectionLabel style={{ marginBottom: 8 }}>{historial.length} trabajo{historial.length !== 1 ? 's' : ''} completado{historial.length !== 1 ? 's' : ''}</SectionLabel>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, padding: '30px 0' }}>Cargando...</p>
        ) : errorCarga ? (
          <Card style={{ textAlign: 'center', padding: '28px' }}>
            <p style={{ fontSize: 12, color: '#f87171', fontWeight: 600 }}>{errorCarga}</p>
          </Card>
        ) : historial.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '28px' }}>
            <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin trabajos completados aún</p>
          </Card>
        ) : historial.map(a => (
          <AccentCard key={a.id} accentColor="rgba(52,211,153,0.3)" onClick={() => navigate(`/proveedor/chat/${a.id}`)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titulo}</p>
                <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{a.vecinos?.nombre} · {a.categoria}</p>
              </div>
              <p style={{ fontSize: 9, color: 'rgba(52,211,153,0.5)', flexShrink: 0 }}>
                {new Date(a.updated_at || a.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
              </p>
            </div>
          </AccentCard>
        ))}
      </div>
    </div>
  )
}
