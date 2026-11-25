// Panel del administrador en la tarjeta del reclamo: estado del WhatsApp, si el proveedor abrió el link y cuándo,
// Reenviar (el MISMO link) / Revocar, acuerdo pendiente de aprobar. Datos desde netlify/functions/trabajo-app.js.
import React, { useCallback, useEffect, useState } from 'react'
import { notificar, trabajoApp, enlaceWhatsApp } from '../lib/flujo'

const card = { width: '100%', padding: '12px 14px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border)' }
const btn = (peligro) => ({ flex: 1, padding: '11px', borderRadius: 12, fontSize: 11.5, fontWeight: 700, border: `1px solid ${peligro ? 'rgba(248,113,113,0.3)' : 'var(--border-strong)'}`, color: peligro ? '#f87171' : 'var(--text-secondary)', background: 'transparent' })
const WA = {
  enviado: { t: '📤 Enviado', c: '#E0B05E' }, entregado: { t: '✅ Entregado', c: '#34d399' },
  leido: { t: '👀 Leído', c: '#60a5fa' }, fallido: { t: '❌ Falló', c: '#f87171' },
}
const fh = (iso) => iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
const EVENTOS = { creado: 'Link creado', primer_acceso: 'Primer acceso', acceso: 'Volvió a entrar', terminos: 'Aceptó términos', aceptar: 'Aceptó el trabajo', pedir_presupuesto: 'Pidió presupuesto', enviar_presupuesto: 'Envió presupuesto', no_puede: 'Dijo que no puede', enviar_mensaje: 'Escribió en el chat', proponer_acuerdo: 'Propuso acuerdo', aceptar_acuerdo: 'Aceptó acuerdo', finalizar: 'Marcó finalizado', subida: 'Subió un archivo', revocado_por_admin: 'Revocado por el admin' }

export default function AdminEnlacePanel({ aviso, onCambio, onReasignar, cargando }) {
  const [d, setD] = useState(null)
  const [res, setRes] = useState(null)       // resultado de "Reenviar": link + si se mandó por WhatsApp
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [verEventos, setVerEventos] = useState(false)

  const cargar = useCallback(async () => {
    const r = await trabajoApp({ accion: 'estado_admin', avisoId: aviso.id })
    if (r.ok) setD(r)
  }, [aviso.id])
  useEffect(() => {
    cargar()
    const t = setInterval(() => { if (!document.hidden) cargar() }, 20000)
    return () => clearInterval(t)
  }, [cargar, aviso.fase, aviso.proveedor_id])

  const reenviar = async () => {
    setOcupado(true); setMsg(''); setRes(null)
    const n = await notificar({ tipo: 'derivado', avisoId: aviso.id, reenviar: true })
    setOcupado(false)
    if (!n?.link) return setMsg('No se pudo reenviar el link.')
    setRes(n); cargar()
  }
  const revocar = async () => {
    if (!window.confirm('¿Revocar el link? El proveedor no va a poder entrar hasta que le reenvíes uno.')) return
    setOcupado(true)
    const r = await trabajoApp({ accion: 'revocar_link', avisoId: aviso.id })
    setOcupado(false)
    if (r.error) return setMsg(r.error)
    setRes(null); setMsg('Link revocado ✓'); cargar()
  }
  const copiar = () => navigator.clipboard?.writeText(res.link).then(() => setMsg('Link copiado ✓')).catch(() => setMsg('No se pudo copiar.'))

  if (!d) return null
  const w = d.whatsapp, e = d.enlace
  const ult = w.ultimo
  const estadoWa = w.baja ? { t: '🔕 Baja (respondió BAJA)', c: '#f87171' } : ult ? WA[ult.estado] : { t: 'Sin envío', c: 'var(--text-muted)' }
  const pendiente = d.acuerdo?.estado === 'aceptado_contraparte'
  const falloOBaja = w.baja || ult?.estado === 'fallido' || !w.puede_enviar

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 700 }}>Link y WhatsApp del proveedor</p>

      <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
        <p>WhatsApp: <b style={{ color: estadoWa.c }}>{estadoWa.t}</b>{ult && !w.baja ? <span style={{ color: 'var(--text-faint)' }}> · {fh(ult.updated_at || ult.created_at)}</span> : null}</p>
        {ult?.error && <p style={{ fontSize: 10.5, color: '#f87171' }}>{ult.error}</p>}
        {!w.puede_enviar && !w.baja && w.motivo_no_envio && <p style={{ fontSize: 10.5, color: '#E0B05E' }}>No se envía WhatsApp: {w.motivo_no_envio}.</p>}
        <p>Link: <b>{e ? (e.activo ? 'activo' : 'inactivo') : 'sin crear'}</b>
          {e?.primer_acceso_at ? <> · abierto por primera vez el {fh(e.primer_acceso_at)} · último acceso {fh(e.ultimo_acceso_at)}</> : e ? ' · todavía no lo abrió' : ''}</p>
      </div>

      {pendiente && <p style={{ fontSize: 11.5, color: '#60a5fa', fontWeight: 700 }}>🤝 Hay un acuerdo esperando tu aprobación (abajo).</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={ocupado || cargando} onClick={reenviar} style={{ ...btn(), opacity: ocupado ? 0.6 : 1 }}>Reenviar link</button>
        <button disabled={ocupado || cargando || !e?.activo} onClick={revocar} style={{ ...btn(true), opacity: !e?.activo ? 0.4 : 1 }}>Revocar link</button>
        <button disabled={cargando} onClick={onReasignar} style={btn(true)}>Cambiar proveedor</button>
      </div>
      {falloOBaja && !res && <p style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>Si no le llega, tocá “Reenviar link” y mandáselo a mano por WhatsApp.</p>}

      {res && (
        <div style={{ ...card, borderColor: res.whatsapp ? 'rgba(52,211,153,0.3)' : 'rgba(224,176,94,0.4)' }}>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
            {res.whatsapp ? `Reenviamos el mismo link a ${res.proveedor} por WhatsApp.` : `No se pudo mandar por WhatsApp a ${res.proveedor}${res.whatsapp_error ? ` (${res.whatsapp_error})` : ''}. Enviáselo vos:`}
            {' '}El link sigue activo mientras el reclamo siga en curso.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={async () => window.open(await enlaceWhatsApp(res.telefono, res.link, aviso), '_blank', 'noopener')} style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 12, fontWeight: 800, background: '#25D366', color: '#05260f' }}>Enviar a mano por WhatsApp</button>
            <button onClick={copiar} style={{ padding: '11px 14px', borderRadius: 12, fontSize: 12, fontWeight: 700, border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', background: 'transparent' }}>Copiar</button>
          </div>
        </div>
      )}

      {d.eventos?.length > 0 && (
        <>
          <button onClick={() => setVerEventos(!verEventos)} style={{ fontSize: 10.5, color: 'var(--text-faint)', textDecoration: 'underline', alignSelf: 'flex-start' }}>{verEventos ? 'Ocultar' : 'Ver'} actividad del link</button>
          {verEventos && <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>{d.eventos.map((ev, i) => <li key={i}>{fh(ev.created_at)} · {EVENTOS[ev.evento] || ev.evento}</li>)}</ul>}
        </>
      )}
      {msg && <p style={{ fontSize: 11.5, fontWeight: 600, color: msg.includes('✓') ? '#34d399' : '#f87171' }}>{msg}</p>}
    </div>
  )
}
