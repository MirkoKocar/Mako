import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, AccentCard, Card, PrimaryBtn, OrnamentLine, BottomNav, SectionLabel } from '../components/Palace'

export default function VisitaVecino({ user }) {
  const [visitas, setVisitas] = useState([])
  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState('')
  const [nota, setNota] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data, error: e } = await supabase.from('visitas').select('*')
          .eq('vecino_id', user.id).order('fecha', { ascending: false }).limit(10)
        if (e) throw e
        setVisitas(data || [])
      } catch (err) {
        setError('No se pudo cargar la lista de visitas. Revisá tu conexión.')
      }
    }
    fetch()
  }, [user.id])

  const autorizar = async () => {
    if (!nombre.trim() || !fecha) return
    setLoading(true); setError('')
    try {
      const { data, error: e } = await supabase.from('visitas').insert({
        nombre_visita: nombre.trim(), fecha, nota: nota.trim(),
        vecino_id: user.id, edificio_id: user.edificio.id,
        departamento: user.departamento
      }).select().single()
      if (e || !data) throw e || new Error('sin datos')
      setVisitas(prev => [data, ...prev])
      setNombre(''); setFecha(''); setNota('')
    } catch (err) {
      setError('No se pudo autorizar la visita. Probá de nuevo — es importante que quede registrada antes de que llegue.')
    }
    setLoading(false)
  }

  return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title="Mis Visitas" subtitle="Autorizá accesos" />
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Card style={{ padding: '14px' }}>
          <SectionLabel style={{ marginBottom: 10 }}>Nueva visita autorizada</SectionLabel>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del visitante"
            style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 14px', color: 'var(--text-primary)', fontSize: 13, marginBottom: 7 }} />
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} min={new Date().toISOString().split('T')[0]}
            style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 14px', color: 'var(--text-primary)', fontSize: 13, marginBottom: 7, colorScheme: 'dark' }} />
          <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (opcional)"
            style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 14px', color: 'var(--text-primary)', fontSize: 13, marginBottom: 12 }} />
          {error && <p style={{ fontSize: 11, color: '#f87171', fontWeight: 600, marginBottom: 10 }}>{error}</p>}
          <PrimaryBtn onClick={autorizar} disabled={loading}>{loading ? 'Guardando...' : 'Autorizar visita'}</PrimaryBtn>
        </Card>
        <OrnamentLine opacity={0.08} />
        <SectionLabel style={{ marginBottom: 8 }}>Mis visitas autorizadas</SectionLabel>
        {visitas.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '20px' }}>
            <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin visitas registradas</p>
          </Card>
        ) : visitas.map(v => (
          <AccentCard key={v.id} accentColor="var(--border)">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{v.nombre_visita}</p>
                {v.nota && <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{v.nota}</p>}
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0, marginLeft: 10 }}>
                {new Date(v.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
              </p>
            </div>
          </AccentCard>
        ))}
      </div>
    </div>
  )
}
