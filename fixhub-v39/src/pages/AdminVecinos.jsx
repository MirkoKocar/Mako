import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, AccentCard, Card, OrnamentLine, BottomNav, SectionLabel } from '../components/Palace'

export default function AdminVecinos({ user }) {
  const [vecinos, setVecinos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [errorCarga, setErrorCarga] = useState('')

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data, error } = await supabase.from('vecinos').select('*')
          .eq('edificio_id', user.edificio.id).order('departamento', { ascending: true })
        if (error) throw error
        setVecinos(data || [])
      } catch (err) {
        setErrorCarga('No se pudo cargar la lista de vecinos. Revisá tu conexión.')
      }
      setLoading(false)
    }
    fetch()
  }, [user.edificio.id])

  const filtrados = vecinos.filter(v =>
    v.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    v.departamento?.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title="Vecinos" subtitle={`${vecinos.length} registrados`} />

      <div style={{ padding: '0 20px 20px' }}>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre o depto..."
          style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '11px 15px', color: 'var(--text-primary)', fontSize: 13 }} />
      </div>

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 11, padding: '30px 0' }}>Cargando...</p>
        ) : errorCarga ? (
          <Card style={{ textAlign: 'center', padding: '24px' }}>
            <p style={{ fontSize: 12, color: '#f87171', fontWeight: 600 }}>{errorCarga}</p>
          </Card>
        ) : filtrados.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '24px' }}>
            <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin vecinos registrados</p>
          </Card>
        ) : (
          filtrados.map(v => (
            <AccentCard key={v.id} accentColor="var(--border)">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{v.nombre}</p>
                  {v.email && <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{v.email}</p>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 11, color: 'var(--border-strong)', fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Depto {v.departamento}</span>
                </div>
              </div>
            </AccentCard>
          ))
        )}
      </div>
    </div>
  )
}
