// Acuerdo de visita / monto / alcance. Una parte propone, la otra acepta y el ADMINISTRADOR aprueba o rechaza.
// Sin su aprobación no vale. Funciona para vecino, administrador y proveedor registrado (el proveedor por link
// usa la misma lógica desde su página). Todo pasa por netlify/functions/trabajo-app.js.
import React, { useCallback, useEffect, useState } from 'react'
import { trabajoApp } from '../lib/flujo'

const FASES = ['derivado', 'en_camino', 'finalizado_proveedor']
const FRANJAS = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche', a_coordinar: 'A coordinar' }
const ESTADOS = {
  propuesto: { t: 'Esperando respuesta', c: '#E0B05E' },
  aceptado_contraparte: { t: 'Aceptado · falta aprobación del admin', c: '#60a5fa' },
  aprobado_admin: { t: 'Aprobado por el admin', c: '#34d399' },
  rechazado: { t: 'Rechazado', c: '#f87171' },
  vencido: { t: 'Vencido', c: '#94a3b8' },
}
const card = { width: '100%', padding: '12px 14px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border)' }
const btn = (primario) => ({ padding: '10px 14px', borderRadius: 12, fontSize: 12, fontWeight: 700, border: primario ? 'none' : '1px solid var(--border-strong)', background: primario ? 'linear-gradient(135deg,#E0B05E,#C9923A)' : 'transparent', color: primario ? '#0A1428' : 'var(--text-secondary)' })
const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", marginTop: 6 }

const fmtF = (f) => { const [y, m, d] = String(f).split('-'); return `${d}/${m}/${y}` }
const pesos = (n) => '$' + Number(n).toLocaleString('es-AR')

export default function AcuerdoPanel({ aviso, user }) {
  const [d, setD] = useState(null)
  const [form, setForm] = useState(false)
  const [v, setV] = useState({ fecha_visita: '', franja: 'a_coordinar', monto: '', alcance: '' })
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const activo = aviso && aviso.proveedor_id && FASES.includes(aviso.fase)
  const esParte = user.rol === 'vecino' || user.rol === 'proveedor'

  const cargar = useCallback(async () => {
    if (!aviso?.id) return
    const r = await trabajoApp({ accion: 'estado', avisoId: aviso.id })
    if (r.ok) setD(r)
  }, [aviso?.id])

  useEffect(() => {
    if (!activo) return
    cargar()
    const t = setInterval(() => { if (!document.hidden) cargar() }, 15000)
    return () => clearInterval(t)
  }, [activo, aviso?.fase, aviso?.proveedor_id, cargar])

  if (!activo || !d) return null
  const a = d.acuerdo
  const e = a && ESTADOS[a.estado]
  const puedeAceptar = esParte && a?.estado === 'propuesto' && a.propuesto_por !== user.rol
  const puedeProponer = esParte && aviso.fase !== 'finalizado_proveedor'

  const run = async (body, okMsg) => {
    setOcupado(true); setMsg('')
    const r = await trabajoApp({ avisoId: aviso.id, ...body })
    setOcupado(false)
    if (r.error) return setMsg(r.error)
    setMsg(okMsg || ''); setForm(false); cargar()
  }
  const proponer = () => run({
    accion: 'acuerdo_proponer', alcance: v.alcance, fecha_visita: v.fecha_visita || undefined, franja: v.franja,
    monto: v.monto === '' ? undefined : Number(String(v.monto).replace(/\./g, '').replace(',', '.')),
  }, 'Propuesta enviada ✓')
  const rechazar = () => { const motivo = window.prompt('Motivo del rechazo (opcional)') ; if (motivo === null) return; run({ accion: 'acuerdo_decidir', acuerdoId: a.id, aprobar: false, motivo }, 'Acuerdo rechazado') }

  return (
    <div style={card}>
      <p style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 700, marginBottom: 6 }}>🤝 Acuerdo</p>
      {d.requiere_acuerdo && <p style={{ fontSize: 10.5, color: '#E0B05E', marginBottom: 6 }}>Este edificio exige un acuerdo aprobado antes de finalizar el trabajo.</p>}
      {a ? (
        <>
          <p style={{ fontSize: 11, fontWeight: 700, color: e.c }}>{e.t}</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 4 }}>
            {a.fecha_visita && <>Visita: <b>{fmtF(a.fecha_visita)}</b> · {FRANJAS[a.franja] || ''}<br /></>}
            {a.monto_presupuesto != null && <>Monto: <b>{pesos(a.monto_presupuesto)}</b><br /></>}
            Alcance: {a.alcance}<br />
            <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>Propuesto por {a.propuesto_por === 'vecino' ? 'el vecino' : 'el proveedor'}{a.decidido_motivo ? ` · Motivo: ${a.decidido_motivo}` : ''}</span>
          </p>
        </>
      ) : <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Todavía no hay acuerdo.{d.acuerdo_rechazado ? ` El último fue rechazado${d.acuerdo_rechazado.decidido_motivo ? ': ' + d.acuerdo_rechazado.decidido_motivo : ''}.` : ''}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {puedeAceptar && <button disabled={ocupado} style={btn(true)} onClick={() => run({ accion: 'acuerdo_aceptar', acuerdoId: a.id }, 'Aceptaste el acuerdo ✓')}>Aceptar acuerdo</button>}
        {user.rol === 'admin' && a?.estado === 'aceptado_contraparte' && <button disabled={ocupado} style={btn(true)} onClick={() => run({ accion: 'acuerdo_decidir', acuerdoId: a.id, aprobar: true }, 'Acuerdo aprobado ✓')}>✅ Aprobar</button>}
        {user.rol === 'admin' && a && ['propuesto', 'aceptado_contraparte'].includes(a.estado) && <button disabled={ocupado} style={btn(false)} onClick={rechazar}>Rechazar</button>}
        {puedeProponer && !form && <button style={btn(false)} onClick={() => setForm(true)}>{a ? 'Proponer otro' : 'Proponer acuerdo'}</button>}
      </div>

      {form && (
        <div style={{ marginTop: 10 }}>
          <input style={input} type="date" min={new Date().toISOString().slice(0, 10)} value={v.fecha_visita} onChange={e2 => setV({ ...v, fecha_visita: e2.target.value })} aria-label="Fecha de visita" />
          <select style={input} value={v.franja} onChange={e2 => setV({ ...v, franja: e2.target.value })} aria-label="Franja">{Object.entries(FRANJAS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          <input style={input} inputMode="decimal" placeholder="Monto en pesos (opcional)" value={v.monto} onChange={e2 => setV({ ...v, monto: e2.target.value })} />
          <textarea style={{ ...input, resize: 'none' }} rows={3} maxLength={300} placeholder={`Qué incluye (${v.alcance.length}/300)`} value={v.alcance} onChange={e2 => setV({ ...v, alcance: e2.target.value })} />
          <p style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 4 }}>No pongas teléfonos, emails ni links: los coordina el administrador. Lo tiene que aceptar la otra parte y aprobar el admin.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button disabled={ocupado || v.alcance.trim().length < 3} style={{ ...btn(true), opacity: v.alcance.trim().length < 3 ? 0.5 : 1 }} onClick={proponer}>Enviar propuesta</button>
            <button style={btn(false)} onClick={() => setForm(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {msg && <p style={{ fontSize: 11, marginTop: 8, fontWeight: 600, color: msg.includes('✓') ? '#34d399' : '#f87171' }}>{msg}</p>}
    </div>
  )
}
