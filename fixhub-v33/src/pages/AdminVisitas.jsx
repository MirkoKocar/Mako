import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, AccentCard, Card, BottomNav, SectionLabel } from '../components/Palace'

export default function AdminVisitas({ user }) {
  const [visitas, setVisitas] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data, error } = await supabase.from('visitas').select('*, vecinos(nombre,departamento)')
          .eq('edificio_id', user.edificio.id).order('fecha', { ascending: false }).limit(30)
        if (error) throw error
        setVisitas(data || [])
      } catch (err) {
        setErrorCarga('No se pudo cargar el registro de visitas. Revisá tu conexión.')
      }
      setLoading(false)
    }
    fetch()
  }, [user.edificio.id])

  return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title="Visitas" subtitle="Accesos autorizados" />
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SectionLabel style={{ marginBottom: 8 }}>Registro de visitas</SectionLabel>
        {loading ? <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, padding: '20px 0' }}>Cargando...</p>
          : errorCarga ? (
            <Card style={{ textAlign: 'center', padding: '24px' }}>
              <p style={{ fontSize: 12, color: '#f87171', fontWeight: 600 }}>{errorCarga}</p>
            </Card>
          ) : visitas.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: '24px' }}>
              <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin visitas registradas</p>
            </Card>
          ) : visitas.map(v => (
            <AccentCard key={v.id} accentColor="var(--border)">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{v.nombre_visita}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>Autorizado por: {v.vecinos?.nombre} · Depto {v.vecinos?.departamento}</p>
                  {v.nota && <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2, fontStyle: 'italic' }}>{v.nota}</p>}
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0, marginLeft: 10 }}>{new Date(v.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}</p>
              </div>
            </AccentCard>
          ))}
      </div>
    </div>
  )
}
