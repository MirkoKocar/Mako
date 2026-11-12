import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, Card, FaseBadge, UrgenciaBadge } from '../components/Palace'
import AutorizarCard from '../components/AutorizarCard'
import { fmtPesos } from '../lib/validar'

const FILTROS = [
  ['Por autorizar', a => a.fase === 'pendiente_admin'],
  ['Esperando info', a => a.fase === 'info_solicitada'],
  ['En curso', a => ['derivado', 'en_camino'].includes(a.fase)],
  ['Por confirmar', a => a.fase === 'finalizado_proveedor'],
  ['Cerrados', a => ['cerrado', 'rechazado', 'privado'].includes(a.fase)],
  ['Todos', () => true],
]

export default function AdminAvisos({ user }) {
  const navigate = useNavigate()
  const [avisos, setAvisos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('Por autorizar')
  const [errorCarga, setErrorCarga] = useState('')

  const cargar = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('avisos').select('*, vecinos(nombre, departamento)')
        .eq('edificio_id', user.edificio.id).order('created_at', { ascending: false }).limit(300)
      if (error) throw error
      setAvisos(data || []); setErrorCarga('')
    } catch (err) {
      setErrorCarga('No se pudo cargar la lista de avisos. Revisá tu conexión.')
    }
    setLoading(false)
  }, [user.edificio.id])

  useEffect(() => { cargar() }, [cargar])

  const [, fn] = FILTROS.find(f => f[0] === filtro)
  const filtrados = avisos.filter(fn)
  const cuenta = (f) => avisos.filter(f[1]).length

  return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title="Avisos" subtitle="Gestión de reportes" onBack={() => navigate('/')} />

      <div style={{ padding: '0 20px 16px', display: 'flex', gap: 7, overflowX: 'auto' }}>
        {FILTROS.map(f => (
          <button key={f[0]} onClick={() => setFiltro(f[0])} style={{
            padding: '7px 13px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0,
            background: filtro === f[0] ? 'var(--gold-faint)' : 'transparent',
            border: `1px solid ${filtro === f[0] ? 'rgba(224,176,94,0.4)' : 'var(--border)'}`,
            color: filtro === f[0] ? 'var(--text-primary)' : 'var(--text-faint)', fontSize: 10.5, fontWeight: 700
          }}>{f[0]}{cuenta(f) > 0 && f[0] !== 'Todos' ? ` · ${cuenta(f)}` : ''}</button>
        ))}
      </div>

      <div className="grid-auto" style={{ padding: '0 20px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, padding: '30px 0' }}>Cargando...</p>
        ) : errorCarga ? (
          <Card style={{ textAlign: 'center', padding: '32px 16px' }}><p style={{ fontSize: 13, color: '#f87171', fontWeight: 600 }}>{errorCarga}</p></Card>
        ) : filtrados.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '32px 16px' }}><p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nada por acá</p></Card>
        ) : filtrados.map(a => a.fase === 'pendiente_admin' ? (
          <AutorizarCard key={a.id} aviso={a} edificio={user.edificio} onCambio={cargar} />
        ) : (
          <Card key={a.id} onClick={() => navigate(`/admin/aviso/${a.id}`)} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.3 }}>{a.titulo}</p>
                <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{a.vecinos?.nombre} · Depto {a.vecinos?.departamento}{a.proveedor_nombre ? ` · ${a.proveedor_nombre}` : ''}</p>
              </div>
              <FaseBadge fase={a.fase} />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{a.categoria}</span>
              {a.urgencia && <UrgenciaBadge urgencia={a.urgencia} />}
              {a.presupuesto != null && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#E0B05E', fontWeight: 700 }}>{fmtPesos(a.presupuesto)}</span>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
