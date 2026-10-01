import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, AccentCard, Card, PrimaryBtn, BottomNav, SectionLabel } from '../components/Palace'

export default function AdminEmergencias({ user }) {
  const [items, setItems] = useState([])
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data, error: e } = await supabase.from('emergencias').select('*').eq('edificio_id', user.edificio.id).order('created_at', { ascending: true })
        if (e) throw e
        setItems(data || [])
      } catch (err) {
        setError('No se pudo cargar la lista de emergencias. Revisá tu conexión.')
      }
    }
    fetch()
  }, [user.edificio.id])

  const agregar = async () => {
    if (!nombre.trim() || !telefono.trim()) return
    setLoading(true); setError('')
    try {
      const { data, error: e } = await supabase.from('emergencias').insert({ nombre: nombre.trim(), telefono: telefono.trim(), descripcion: descripcion.trim(), edificio_id: user.edificio.id }).select().single()
      if (e || !data) throw e || new Error('sin datos')
      setItems(prev => [...prev, data])
      setNombre(''); setTelefono(''); setDescripcion('')
    } catch (err) {
      setError('No se pudo guardar el contacto. Probá de nuevo.')
    }
    setLoading(false)
  }

  const eliminar = async (id) => {
    const anterior = items
    setItems(prev => prev.filter(i => i.id !== id))
    try {
      const { error: e } = await supabase.from('emergencias').delete().eq('id', id)
      if (e) throw e
    } catch (err) {
      setItems(anterior)
      setError('No se pudo eliminar el contacto. Probá de nuevo.')
    }
  }

  return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title="Emergencias" subtitle="Contactos del edificio" />
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Card style={{ padding: '14px' }}>
          <SectionLabel style={{ marginBottom: 10 }}>Agregar contacto</SectionLabel>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre (ej: Bomberos)"
            style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '9px 14px', color: 'var(--text-primary)', fontSize: 13, marginBottom: 7 }} />
          <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Teléfono"
            style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '9px 14px', color: 'var(--text-primary)', fontSize: 13, marginBottom: 7 }} />
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción (opcional)"
            style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '9px 14px', color: 'var(--text-primary)', fontSize: 13, marginBottom: 10 }} />
          {error && <p style={{ fontSize: 11, color: '#f87171', fontWeight: 600, marginBottom: 10 }}>{error}</p>}
          <PrimaryBtn onClick={agregar} disabled={loading}>{loading ? 'Guardando...' : 'Agregar'}</PrimaryBtn>
        </Card>
        {items.map(e => (
          <AccentCard key={e.id} accentColor="rgba(248,113,113,0.3)">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{e.nombre}</p>
                {e.descripcion && <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{e.descripcion}</p>}
                <p style={{ fontSize: 12, color: 'rgba(248,113,113,0.65)', marginTop: 4, fontFamily: "'Cormorant Garamond',serif", fontWeight: 600 }}>{e.telefono}</p>
              </div>
              <button onClick={() => eliminar(e.id)} style={{ fontSize: 16, color: 'rgba(248,113,113,0.3)', padding: '4px 8px' }}>×</button>
            </div>
          </AccentCard>
        ))}
      </div>
    </div>
  )
}
