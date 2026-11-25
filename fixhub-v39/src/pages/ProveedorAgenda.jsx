import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, AccentCard, Card, PrimaryBtn, OrnamentLine, BottomNav, SectionLabel } from '../components/Palace'

export default function ProveedorAgenda({ user }) {
  const [items, setItems] = useState([])
  const [titulo, setTitulo] = useState('')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [nota, setNota] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data, error: e } = await supabase.from('agenda_proveedor').select('*')
          .eq('proveedor_id', user.id).order('fecha', { ascending: true })
        if (e) throw e
        setItems(data || [])
      } catch (err) {
        setError('No se pudo cargar la agenda. Revisá tu conexión.')
      }
    }
    fetch()
  }, [user.id])

  const agregar = async () => {
    if (!titulo.trim() || !fecha) return
    setLoading(true); setError('')
    try {
      const { data, error: e } = await supabase.from('agenda_proveedor').insert({
        proveedor_id: user.id, titulo: titulo.trim(), fecha, hora, nota: nota.trim(), completado: false
      }).select().single()
      if (e || !data) throw e || new Error('sin datos')
      setItems(prev => [...prev, data].sort((a,b) => new Date(a.fecha) - new Date(b.fecha)))
      setTitulo(''); setFecha(''); setHora(''); setNota('')
    } catch (err) {
      setError('No se pudo guardar. Probá de nuevo.')
    }
    setLoading(false)
  }

  const completar = async (id) => {
    const anterior = items
    setItems(prev => prev.map(i => i.id === id ? { ...i, completado: true } : i))
    try {
      const { error: e } = await supabase.from('agenda_proveedor').update({ completado: true }).eq('id', id)
      if (e) throw e
    } catch (err) {
      setItems(anterior)
      setError('No se pudo marcar como completado. Probá de nuevo.')
    }
  }

  const pendientes = items.filter(i => !i.completado)
  const completados = items.filter(i => i.completado)

  return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title="Mi Agenda" subtitle="Trabajos programados" />

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Card style={{ padding: '16px' }}>
          <SectionLabel style={{ marginBottom: 12 }}>Nuevo trabajo</SectionLabel>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Descripción del trabajo"
            style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 14px', color: 'var(--text-primary)', fontSize: 13, marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, colorScheme: 'dark' }} />
            <input type="time" value={hora} onChange={e => setHora(e.target.value)}
              style={{ flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, colorScheme: 'dark' }} />
          </div>
          <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (opcional)"
            style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 14px', color: 'var(--text-primary)', fontSize: 13, marginBottom: 12 }} />
          {error && <p style={{ fontSize: 11, color: '#f87171', fontWeight: 600, marginBottom: 10 }}>{error}</p>}
          <PrimaryBtn onClick={agregar} disabled={loading}>{loading ? 'Guardando...' : 'Agregar'}</PrimaryBtn>
        </Card>

        <OrnamentLine opacity={0.08} />
        <SectionLabel>Próximos trabajos</SectionLabel>

        {pendientes.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '20px' }}>
            <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin trabajos programados</p>
          </Card>
        ) : (
          pendientes.map(i => (
            <AccentCard key={i.id} accentColor="var(--border-strong)">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{i.titulo}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                    {new Date(i.fecha).toLocaleDateString('es-AR',{day:'2-digit',month:'short'})} {i.hora && `· ${i.hora}`}
                  </p>
                  {i.nota && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>{i.nota}</p>}
                </div>
                <button onClick={() => completar(i.id)} style={{ fontSize: 9, color: 'rgba(52,211,153,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 8px', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 2, flexShrink: 0, marginLeft: 10 }}>
                  ✓ Hecho
                </button>
              </div>
            </AccentCard>
          ))
        )}

        {completados.length > 0 && (
          <>
            <SectionLabel style={{ marginTop: 8 }}>Completados</SectionLabel>
            {completados.slice(0,3).map(i => (
              <Card key={i.id} style={{ opacity: 0.45 }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'line-through' }}>{i.titulo}</p>
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
