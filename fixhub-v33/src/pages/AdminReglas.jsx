import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, Card, PrimaryBtn, SectionLabel } from '../components/Palace'

const CATEGORIAS = ['Plomería', 'Electricidad', 'Gas', 'Ascensor', 'Limpieza', 'Seguridad', 'Estructura', 'Internet']
const campo = { width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 12, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, fontFamily: "'DM Sans',sans-serif" }

function Toggle({ on, onChange, label, sub }) {
  return (
    <div onClick={() => onChange(!on)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
      <div><p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</p>{sub && <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{sub}</p>}</div>
      <div style={{ width: 46, height: 26, borderRadius: 999, background: on ? 'rgba(52,211,153,0.6)' : 'rgba(255,255,255,0.12)', position: 'relative', flexShrink: 0, transition: 'background 0.3s' }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: on ? 23 : 3, transition: 'left 0.3s' }} />
      </div>
    </div>
  )
}

export default function AdminReglas({ user }) {
  const navigate = useNavigate()
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [r, setR] = useState({ auto_activo: false, monto_maximo: '', hora_desde: '08:00', hora_hasta: '18:00', solo_dias_habiles: true, urgencia_alta_deriva_directo: false, costos: {} })

  useEffect(() => {
    supabase.from('reglas_autorizacion').select('*').eq('edificio_id', user.edificio.id).limit(1).then(({ data, error }) => {
      if (error) setMsg({ ok: false, t: 'No se pudieron cargar las reglas.' })
      else if (data?.[0]) {
        const d = data[0]
        setR({ auto_activo: d.auto_activo, monto_maximo: d.monto_maximo ?? '', hora_desde: d.hora_desde?.slice(0, 5) || '08:00', hora_hasta: d.hora_hasta?.slice(0, 5) || '18:00',
          solo_dias_habiles: d.solo_dias_habiles, urgencia_alta_deriva_directo: d.urgencia_alta_deriva_directo, costos: d.costos_estimados || {} })
      }
      setCargando(false)
    })
  }, [user.edificio.id])

  const guardar = async () => {
    setMsg(null)
    const monto = r.monto_maximo === '' ? null : Number(r.monto_maximo)
    if (monto !== null && (!isFinite(monto) || monto < 0 || monto > 1e9)) return setMsg({ ok: false, t: 'El monto máximo no es válido.' })
    if (r.hora_desde >= r.hora_hasta) return setMsg({ ok: false, t: 'El horario hábil está al revés: "desde" tiene que ser antes que "hasta".' })
    const costos = {}
    for (const c of CATEGORIAS) {
      const v = r.costos[c]
      if (v === undefined || v === '') continue
      const n = Number(v)
      if (!isFinite(n) || n < 0 || n > 1e9) return setMsg({ ok: false, t: `El costo de ${c} no es válido.` })
      costos[c] = n
    }
    if (r.auto_activo && monto === null && !r.urgencia_alta_deriva_directo) return setMsg({ ok: false, t: 'Para activar la autorización automática cargá un monto máximo o la opción de urgencia alta.' })
    setGuardando(true)
    const { error } = await supabase.from('reglas_autorizacion').upsert({
      edificio_id: user.edificio.id, auto_activo: r.auto_activo, monto_maximo: monto, hora_desde: r.hora_desde, hora_hasta: r.hora_hasta,
      solo_dias_habiles: r.solo_dias_habiles, urgencia_alta_deriva_directo: r.urgencia_alta_deriva_directo, costos_estimados: costos, updated_at: new Date().toISOString(),
    }, { onConflict: 'edificio_id' })
    setGuardando(false)
    setMsg(error ? { ok: false, t: 'No se pudo guardar. Probá de nuevo.' } : { ok: true, t: 'Reglas guardadas ✓' })
  }

  if (cargando) return <div className="page"><PalaceFrame /><p style={{ textAlign: 'center', color: 'var(--text-faint)', padding: 40, fontSize: 12 }}>Cargando...</p></div>

  return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title="Autorización automática" subtitle="Reglas del edificio" onBack={() => navigate(-1)} />
      <div style={{ padding: '0 20px 30px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Card style={{ padding: 16 }}>
          <Toggle on={r.auto_activo} onChange={v => setR(p => ({ ...p, auto_activo: v }))} label="Autorizar automáticamente"
            sub="Si un reporte cumple las reglas de abajo, se deriva solo al mejor proveedor disponible de esa categoría. Si no cumple (de noche, monto alto, sin proveedor), frena y te pide el OK a vos." />
        </Card>

        <SectionLabel>Regla por monto</SectionLabel>
        <Card style={{ padding: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.45 }}>Se autoriza solo si el <strong>costo estimado</strong> de la categoría es <strong>menor a</strong>:</p>
          <input value={r.monto_maximo} inputMode="numeric" placeholder="Monto máximo en $ (ej: 50000)" onChange={e => setR(p => ({ ...p, monto_maximo: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) }))} style={campo} />
        </Card>

        <SectionLabel>Horario hábil</SectionLabel>
        <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="time" value={r.hora_desde} onChange={e => setR(p => ({ ...p, hora_desde: e.target.value }))} style={campo} />
            <span style={{ color: 'var(--text-faint)' }}>a</span>
            <input type="time" value={r.hora_hasta} onChange={e => setR(p => ({ ...p, hora_hasta: e.target.value }))} style={campo} />
          </div>
          <Toggle on={r.solo_dias_habiles} onChange={v => setR(p => ({ ...p, solo_dias_habiles: v }))} label="Solo de lunes a viernes" sub="Hora de Argentina. Fuera de horario o en fin de semana siempre te pide OK." />
        </Card>

        <SectionLabel>Costo estimado por categoría</SectionLabel>
        <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>Es tu estimación de lo que suele costar un trabajo de cada rubro. La app la usa para aplicar la regla de monto y te la muestra en la tarjeta. Sin estimación cargada, esa categoría siempre pasa por vos.</p>
          {CATEGORIAS.map(c => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 600, width: 100 }}>{c}</p>
              <input value={r.costos[c] ?? ''} inputMode="numeric" placeholder="$" onChange={e => setR(p => ({ ...p, costos: { ...p.costos, [c]: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) } }))} style={{ ...campo, padding: '8px 12px' }} />
            </div>
          ))}
        </Card>

        <SectionLabel>Emergencias</SectionLabel>
        <Card style={{ padding: 16 }}>
          <Toggle on={r.urgencia_alta_deriva_directo} onChange={v => setR(p => ({ ...p, urgencia_alta_deriva_directo: v }))} label="Urgencia ALTA se deriva directo"
            sub="Una fuga de gas o una inundación no espera: se deriva al instante, a cualquier hora y sin importar el monto, y te avisamos a vos al mismo tiempo." />
        </Card>

        {msg && <p style={{ fontSize: 12, fontWeight: 700, color: msg.ok ? '#34d399' : '#f87171' }}>{msg.t}</p>}
        <PrimaryBtn onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar reglas'}</PrimaryBtn>
      </div>
    </div>
  )
}
