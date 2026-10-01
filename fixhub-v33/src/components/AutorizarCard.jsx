import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { rpc, notificar, enlaceWhatsApp } from '../lib/flujo'
import { fmtPesos } from '../lib/validar'
import { UrgenciaBadge } from './Palace'
import Adjuntos from './Adjuntos'

// Tarjeta del "filtro inteligente": el admin ve el resumen y decide con 2 botones grandes.
export default function AutorizarCard({ aviso, edificio, onCambio }) {
  const navigate = useNavigate()
  const [modo, setModo] = useState(null)         // null | 'elegir' | 'rechazar' | 'info' | 'enviado'
  const [provs, setProvs] = useState([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    if (modo !== 'elegir') return
    let vivo = true
    supabase.from('proveedores').select('id,nombre,especialidad,disponible,ranking,telefono')
      .eq('edificio_id', aviso.edificio_id).is('eliminado_at', null).order('ranking', { ascending: false })
      .then(({ data, error: e }) => {
        if (!vivo) return
        if (e) { setError('No se pudo cargar la lista de proveedores.'); return }
        const lista = data || []
        // los de la categoría primero
        lista.sort((x, y) => (y.especialidad === aviso.categoria) - (x.especialidad === aviso.categoria))
        setProvs(lista.filter(p => !(aviso.proveedores_descartados || []).includes(p.id)))
      })
    return () => { vivo = false }
  }, [modo])

  const unidad = `${edificio?.nombre || 'Consorcio'} - Depto ${aviso.vecinos?.departamento || '?'}`

  const autorizar = async (prov) => {
    setCargando(true); setError('')
    const r = await rpc('fh_admin_autorizar', { p_aviso: aviso.id, p_proveedor: prov.id })
    if (r.error) { setError(r.error); setCargando(false); return }
    const n = await notificar({ tipo: 'derivado', avisoId: aviso.id })
    setResultado({ proveedor: prov.nombre, link: n?.link, telefono: n?.telefono || prov.telefono, whatsapp: n?.whatsapp })
    setModo('enviado'); setCargando(false)
  }

  const rechazar = async () => {
    setCargando(true); setError('')
    const r = await rpc('fh_admin_rechazar', { p_aviso: aviso.id, p_motivo: texto })
    if (r.error) { setError(r.error); setCargando(false); return }
    await notificar({ tipo: 'rechazado', avisoId: aviso.id })
    setModo(null); setTexto(''); setCargando(false); onCambio?.()
  }

  const pedirInfo = async () => {
    setCargando(true); setError('')
    const r = await rpc('fh_admin_pedir_info', { p_aviso: aviso.id, p_mensaje: texto })
    if (r.error) { setError(r.error); setCargando(false); return }
    await notificar({ tipo: 'info', avisoId: aviso.id })
    setModo(null); setTexto(''); setCargando(false); onCambio?.()
  }

  const colorUrg = aviso.urgencia === 'alta' ? '#f87171' : aviso.urgencia === 'media' ? '#fbbf24' : '#34d399'
  const btnGrande = (bg, color, border) => ({ flex: 1, padding: '16px 10px', borderRadius: 16, fontSize: 14, fontWeight: 800, background: bg, color, border: `1px solid ${border}`, opacity: cargando ? 0.6 : 1, lineHeight: 1.2 })

  return (
    <div style={{ background: 'var(--bg-card)', border: `1px solid ${colorUrg}45`, borderLeft: `4px solid ${colorUrg}`, borderRadius: 18, padding: '14px 14px 14px' }}>
      <div onClick={() => navigate(`/admin/aviso/${aviso.id}`)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <p style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700 }}>{unidad}</p>
          <UrgenciaBadge urgencia={aviso.urgencia} />
        </div>
        <p style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 800, marginTop: 6, lineHeight: 1.3 }}>{aviso.categoria}: {aviso.titulo}</p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
          Urgencia: <strong style={{ color: colorUrg }}>{aviso.urgencia === 'alta' ? 'Alta' : aviso.urgencia === 'media' ? 'Media' : 'Baja'}</strong>
          {aviso.costo_estimado ? <> · Costo estimado {fmtPesos(aviso.costo_estimado)}</> : null}
        </p>
        {aviso.descripcion && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.45 }}>{aviso.descripcion}</p>}
        {aviso.motivo_no_puede && <p style={{ fontSize: 11, color: '#fb923c', marginTop: 6 }}>El proveedor anterior no pudo ir: {aviso.motivo_no_puede}</p>}
        {aviso.fase === 'info_solicitada' && <p style={{ fontSize: 11, color: '#fb923c', marginTop: 6 }}>Esperando la respuesta del vecino a: “{aviso.motivo_info}”</p>}
      </div>
      <Adjuntos items={aviso.adjuntos} />

      {modo === null && (
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={() => { setError(''); setModo('elegir') }} style={btnGrande('linear-gradient(135deg,#E0B05E,#C9923A)', '#0A1428', 'transparent')}>Autorizar y Derivar</button>
          <button onClick={() => { setError(''); setTexto(''); setModo('rechazar') }} style={btnGrande('rgba(248,113,113,0.1)', '#f87171', 'rgba(248,113,113,0.35)')}>Rechazar / Pedir más info</button>
        </div>
      )}

      {modo === 'elegir' && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>¿A quién derivás este trabajo?</p>
          {provs.length === 0 && !error && <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>No hay proveedores cargados. Agregalos en “Servicios”.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {provs.map(p => (
              <button key={p.id} disabled={cargando} onClick={() => autorizar(p)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 14, background: 'var(--input-bg)', border: `1px solid ${p.especialidad === aviso.categoria ? 'rgba(224,176,94,0.4)' : 'var(--border)'}`, textAlign: 'left', opacity: cargando ? 0.6 : 1 }}>
                <span><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{p.nombre}</span><br/><span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{p.especialidad}{p.especialidad !== aviso.categoria ? ' · otra especialidad' : ''}</span></span>
                <span style={{ fontSize: 9, fontWeight: 700, color: p.disponible ? '#34d399' : '#f87171', textTransform: 'uppercase' }}>{p.disponible ? 'Disponible' : 'Ocupado'}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setModo(null)} style={{ marginTop: 10, fontSize: 11, color: 'var(--text-faint)' }}>← Volver</button>
        </div>
      )}

      {(modo === 'rechazar' || modo === 'info') && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {[['info', 'Pedir más info'], ['rechazar', 'Rechazar']].map(([m, l]) => (
              <button key={m} onClick={() => { setModo(m); setError('') }} style={{ flex: 1, padding: '9px', borderRadius: 12, fontSize: 12, fontWeight: 700, background: modo === m ? 'rgba(224,176,94,0.14)' : 'transparent', border: `1px solid ${modo === m ? 'rgba(224,176,94,0.4)' : 'var(--border)'}`, color: modo === m ? '#E0B05E' : 'var(--text-muted)' }}>{l}</button>
            ))}
          </div>
          <textarea value={texto} onChange={e => { setTexto(e.target.value.slice(0, 500)); setError('') }} rows={3}
            placeholder={modo === 'info' ? 'Qué necesitás saber (ej: ¿desde cuándo pasa? ¿hay olor a gas?)' : 'Motivo del rechazo (el vecino lo va a ver)'}
            style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 12, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, resize: 'none', fontFamily: "'DM Sans',sans-serif" }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => setModo(null)} style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-faint)' }}>Cancelar</button>
            <button disabled={cargando || texto.trim().length < 5} onClick={modo === 'info' ? pedirInfo : rechazar}
              style={{ flex: 1, padding: '12px', borderRadius: 14, fontSize: 13, fontWeight: 800, background: modo === 'info' ? 'linear-gradient(135deg,#E0B05E,#C9923A)' : 'rgba(248,113,113,0.15)', color: modo === 'info' ? '#0A1428' : '#f87171', border: modo === 'info' ? 'none' : '1px solid rgba(248,113,113,0.4)', opacity: (cargando || texto.trim().length < 5) ? 0.5 : 1 }}>
              {cargando ? 'Enviando...' : modo === 'info' ? 'Enviar pregunta al vecino' : 'Rechazar reporte'}
            </button>
          </div>
        </div>
      )}

      {modo === 'enviado' && resultado && (
        <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)' }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#34d399' }}>✓ Derivado a {resultado.proveedor}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.45 }}>
            {resultado.whatsapp ? 'Le mandamos el link por WhatsApp. ' : ''}Si no le llegó, enviáselo vos — entra sin usuario ni contraseña y vence en 72 horas.
          </p>
          {resultado.link && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <a href={resultado.telefono ? undefined : '#'} onClick={async (e) => { e.preventDefault(); window.open(await enlaceWhatsApp(resultado.telefono, resultado.link, aviso), '_blank', 'noopener') }}
                style={{ flex: 1, textAlign: 'center', padding: '11px', borderRadius: 12, fontSize: 12, fontWeight: 800, background: '#25D366', color: '#05260f', textDecoration: 'none' }}>Enviar por WhatsApp</a>
              <button onClick={async () => { try { await navigator.clipboard.writeText(resultado.link); setError('Link copiado ✓') } catch { setError('No se pudo copiar. Mantené apretado el link para copiarlo.') } }}
                style={{ padding: '11px 14px', borderRadius: 12, fontSize: 12, fontWeight: 700, border: '1px solid var(--border-strong)', color: 'var(--text-secondary)' }}>Copiar link</button>
            </div>
          )}
          <button onClick={() => onCambio?.()} style={{ marginTop: 10, width: '100%', padding: '11px', borderRadius: 12, fontSize: 12, fontWeight: 800, background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.35)' }}>Listo</button>
        </div>
      )}
      {error && <p style={{ fontSize: 11, color: error.includes('✓') ? '#34d399' : '#f87171', fontWeight: 600, marginTop: 8 }}>{error}</p>}
    </div>
  )
}
