import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, Card, SectionLabel } from '../components/Palace'
import { fmtPesos, fmtFecha } from '../lib/validar'

// Evita que una celda que empiece con = + - @ se ejecute como fórmula en Excel
const csvCelda = (v) => {
  let t = String(v ?? '').replace(/\r?\n/g, ' ')
  if (/^[=+\-@\t]/.test(t)) t = "'" + t
  return `"${t.replace(/"/g, '""')}"`
}

export default function AdminHistorial({ user }) {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const hoy = new Date()
  const [mes, setMes] = useState(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`)

  useEffect(() => {
    supabase.from('avisos').select('*, vecinos(nombre, departamento)').eq('edificio_id', user.edificio.id)
      .eq('fase', 'cerrado').order('cerrado_at', { ascending: false }).limit(1000)
      .then(({ data, error: e }) => { if (e) setError('No se pudo cargar el historial.'); else setItems(data || []); setLoading(false) })
  }, [user.edificio.id])

  const meses = useMemo(() => {
    const set = new Set(items.map(a => (a.cerrado_at || a.created_at).slice(0, 7)))
    set.add(mes)
    return [...set].sort().reverse()
  }, [items, mes])

  const delMes = items.filter(a => (a.cerrado_at || a.created_at).slice(0, 7) === mes)
  const total = delMes.reduce((s, a) => s + Number(a.presupuesto || 0), 0)
  const porCategoria = Object.entries(delMes.reduce((m, a) => { m[a.categoria] = (m[a.categoria] || 0) + Number(a.presupuesto || 0); return m }, {})).sort((a, b) => b[1] - a[1])

  const exportar = () => {
    const cab = ['Fecha cierre', 'Unidad', 'Categoría', 'Trabajo', 'Proveedor', 'Monto', 'Autorizado por', 'Fecha reporte', 'Finalizado']
    const filas = delMes.map(a => [fmtFecha(a.cerrado_at), a.vecinos?.departamento, a.categoria, a.titulo, a.proveedor_nombre, a.presupuesto, a.autorizado_por === 'auto' ? 'Regla automática' : 'Administrador', fmtFecha(a.created_at), fmtFecha(a.finalizado_at)])
    const csv = '\uFEFF' + [cab, ...filas].map(f => f.map(csvCelda).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `gastos-${user.edificio.nombre.replace(/[^a-zA-Z0-9]/g, '_')}-${mes}.csv`
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title="Historial de gastos" subtitle="Trabajos cerrados — para expensas y consejo" onBack={() => navigate(-1)} />
      <div style={{ padding: '0 20px 30px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <select value={mes} onChange={e => setMes(e.target.value)} style={{ width: '100%', background: '#11203B', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px', color: 'var(--text-primary)', fontSize: 14 }}>
          {meses.map(m => { const [y, mm] = m.split('-'); return <option key={m} value={m}>{new Date(Number(y), Number(mm) - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</option> })}
        </select>

        <Card style={{ padding: 16, textAlign: 'center', borderColor: 'rgba(224,176,94,0.3)' }}>
          <p style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 700 }}>Total del mes</p>
          <p className="font-serif" style={{ fontSize: 32, color: '#E0B05E', marginTop: 4 }}>{fmtPesos(total)}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{delMes.length} trabajo(s) cerrado(s)</p>
        </Card>

        {porCategoria.length > 0 && (<>
          <SectionLabel>Por categoría</SectionLabel>
          <Card style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {porCategoria.map(([c, v]) => <div key={c} style={{ display: 'flex', justifyContent: 'space-between' }}><p style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{c}</p><p style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 700 }}>{fmtPesos(v)}</p></div>)}
          </Card>
        </>)}

        {delMes.length > 0 && <button onClick={exportar} style={{ width: '100%', padding: '13px', borderRadius: 14, fontSize: 13, fontWeight: 800, background: 'linear-gradient(135deg,#E0B05E,#C9923A)', color: '#0A1428' }}>Descargar planilla (CSV para Excel)</button>}

        {loading ? <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>Cargando...</p>
          : error ? <p style={{ textAlign: 'center', color: '#f87171', fontSize: 12 }}>{error}</p>
          : delMes.length === 0 ? <Card style={{ textAlign: 'center', padding: 28 }}><p style={{ fontSize: 13, color: 'var(--text-faint)' }}>No hay trabajos cerrados este mes.</p></Card>
          : delMes.map(a => (
            <Card key={a.id} onClick={() => navigate(`/admin/aviso/${a.id}`)} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>{a.categoria}: {a.titulo}</p>
                <p style={{ fontSize: 13, color: '#E0B05E', fontWeight: 800, whiteSpace: 'nowrap' }}>{fmtPesos(a.presupuesto)}</p>
              </div>
              <p style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Depto {a.vecinos?.departamento} · {a.proveedor_nombre || 'Proveedor eliminado'} · cerrado {fmtFecha(a.cerrado_at)}</p>
              <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>{a.autorizado_por === 'auto' ? 'Autorizado por regla automática' : 'Autorizado por el administrador'} · tocá para ver el remito</p>
            </Card>
          ))}
      </div>
    </div>
  )
}
