import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { rpc, notificar, enlaceWhatsApp, FASES, PASOS } from '../lib/flujo'
import { validarArchivo, subirAdjunto } from '../lib/adjuntos'
import { validarMonto, fmtPesos, fmtFecha, fmtFechaHora } from '../lib/validar'
import Adjuntos from './Adjuntos'
import { Camera, MapPin, Phone, Star } from 'lucide-react'

const card = { width: '100%', padding: '12px 14px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border)' }
const big = (bg, color, border = 'transparent') => ({ width: '100%', padding: '15px', borderRadius: 16, fontSize: 14, fontWeight: 800, background: bg, color, border: `1px solid ${border}` })
const oro = 'linear-gradient(135deg,#E0B05E,#C9923A)'

function Estrellas({ valor = 0, onElegir, chico }) {
  const t = chico ? 14 : 30
  return (
    <div role={onElegir ? 'radiogroup' : 'img'} aria-label={`${valor} de 5 estrellas`} style={{ display: 'flex', gap: chico ? 2 : 6, marginTop: chico ? 0 : 8 }}>
      {[1, 2, 3, 4, 5].map(n => {
        const lleno = n <= valor
        const icono = <Star size={t} color="#E0B05E" fill={lleno ? '#E0B05E' : 'none'} strokeWidth={1.6} />
        return onElegir
          ? <button key={n} role="radio" aria-checked={valor === n} aria-label={`${n} estrella${n > 1 ? 's' : ''}`} onClick={() => onElegir(n)} style={{ padding: 4, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icono}</button>
          : <span key={n} style={{ display: 'flex' }}>{icono}</span>
      })}
    </div>
  )
}

export default function FlowPanel({ aviso, user, onCambio }) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [modo, setModo] = useState(null)       // 'no_puede' | 'finalizar' | 'responder' | 'link'
  const [texto, setTexto] = useState('')
  const [monto, setMonto] = useState('')
  const [archivos, setArchivos] = useState([])
  const [link, setLink] = useState(null)
  const [sinFoto, setSinFoto] = useState(false)       // aviso "¿seguro que no querés subir el remito?"
  const [calif, setCalif] = useState(null)           // calificación ya enviada de este trabajo
  const [estrellas, setEstrellas] = useState(0)
  const [resena, setResena] = useState('')
  const [resumenProv, setResumenProv] = useState(null)
  const [verResenas, setVerResenas] = useState(false)
  const inputRef = useRef(null)

  const fase = aviso.fase || 'pendiente_admin'
  const meta = FASES[fase] || FASES.pendiente_admin
  const soyVecino = user.rol === 'vecino', soyAdmin = user.rol === 'admin', soyProv = user.rol === 'proveedor'
  const edificio = user.edificio
  const unidad = aviso.vecinos?.departamento

  const fase0 = aviso.fase
  useEffect(() => {
    if (!['finalizado_proveedor', 'cerrado'].includes(fase0)) return
    let vivo = true
    supabase.from('calificaciones').select('estrellas, resena').eq('aviso_id', aviso.id).limit(1).then(({ data }) => { if (vivo) setCalif(data?.[0] || null) })
    return () => { vivo = false }
  }, [aviso.id, fase0])
  useEffect(() => {
    if (user.rol !== 'vecino' || !aviso.proveedor_id || !['derivado', 'en_camino', 'finalizado_proveedor', 'cerrado'].includes(fase0)) return
    let vivo = true
    supabase.rpc('fh_resenas_proveedor', { p_proveedor: aviso.proveedor_id }).then(({ data }) => { if (vivo && data?.[0]) setResumenProv(data[0]) })
    return () => { vivo = false }
  }, [aviso.proveedor_id, fase0, user.rol])

  const run = async (fn) => { setCargando(true); setError(''); try { await fn() } catch (e) { setError('No se pudo completar. Revisá tu conexión e intentá de nuevo.') } setCargando(false) }

  const aceptar = () => run(async () => {
    const r = await rpc('fh_proveedor_aceptar', { p_aviso: aviso.id })
    if (r.error) return setError(r.error)
    notificar({ tipo: 'aceptado', avisoId: aviso.id }); onCambio?.()
  })

  const noPuede = () => run(async () => {
    const r = await rpc('fh_proveedor_no_puede', { p_aviso: aviso.id, p_motivo: texto })
    if (r.error) return setError(r.error)
    notificar({ tipo: 'no_puede', avisoId: aviso.id }); setModo(null); setTexto(''); onCambio?.()
  })

  const agregarArchivos = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = ''
    for (const f of files) {
      const msg = await validarArchivo(f, { permitirVideo: true, permitirPdf: soyProv })
      if (msg) { setError(msg); return }
    }
    if (archivos.length + files.length > 6) { setError('Máximo 6 archivos.'); return }
    setError(''); setSinFoto(false); setArchivos(prev => [...prev, ...files])
  }

  const finalizar = (forzar = false) => run(async () => {
    const m = validarMonto(monto)
    if (m.error) return setError(m.error)
    if (!archivos.length && !forzar) { setSinFoto(true); return }
    setSinFoto(false)
    const subidos = []
    for (const f of archivos) subidos.push(await subirAdjunto(f, aviso.edificio_id, aviso.id))
    const r = await rpc('fh_proveedor_finalizar', { p_aviso: aviso.id, p_monto: m.valor, p_nota: texto, p_adjuntos: subidos })
    if (r.error) return setError(r.error)
    notificar({ tipo: 'finalizado', avisoId: aviso.id }); setModo(null); setArchivos([]); setMonto(''); setTexto(''); onCambio?.()
  })

  const enviarCalif = async () => {
    if (!estrellas) return null
    const r = await rpc('fh_calificar', { p_aviso: aviso.id, p_estrellas: estrellas, p_resena: resena })
    if (!r.error) setCalif({ estrellas, resena: resena.trim() || null })
    return r.error || null
  }
  const calificarSolo = () => run(async () => {
    const e = await enviarCalif()
    if (e) setError(e)
  })

  const confirmar = () => run(async () => {
    if (soyVecino && !calif && estrellas) { const e = await enviarCalif(); if (e) return setError(e) }
    const r = await rpc('fh_confirmar_resuelto', { p_aviso: aviso.id })
    if (r.error) return setError(r.error)
    notificar({ tipo: 'confirmar', avisoId: aviso.id }); onCambio?.()
  })

  const responder = () => run(async () => {
    // fotos nuevas opcionales
    let nuevos = aviso.adjuntos || []
    if (archivos.length) {
      const subidos = []
      for (const f of archivos) subidos.push(await subirAdjunto(f, aviso.edificio_id, aviso.id))
      nuevos = [...nuevos, ...subidos].slice(0, 6)
      const { error: e } = await supabase.from('avisos').update({ adjuntos: nuevos }).eq('id', aviso.id)
      if (e) return setError('No se pudieron guardar las fotos.')
    }
    const r = await rpc('fh_vecino_responder_info', { p_aviso: aviso.id, p_texto: texto })
    if (r.error) return setError(r.error)
    notificar({ tipo: 'info_respondida', avisoId: aviso.id }); setModo(null); setArchivos([]); setTexto(''); onCambio?.()
  })

  const cancelarReporte = () => run(async () => {
    if (!window.confirm('¿Cancelar este reporte? Se borra y no se puede deshacer.')) return
    const { error: e } = await supabase.from('avisos').delete().eq('id', aviso.id)
    if (e) return setError('No se pudo cancelar el reporte.')
    window.history.back()
  })

  const reenviarLink = () => run(async () => {
    const n = await notificar({ tipo: 'derivado', avisoId: aviso.id, reenviar: true })
    if (!n?.link) return setError('No se pudo generar el link nuevo.')
    setLink(n); setModo('link')
  })

  const reasignar = () => run(async () => {
    if (!window.confirm('¿Sacar a este proveedor y elegir otro? El link que tenía deja de funcionar.')) return
    const r = await rpc('fh_admin_reasignar', { p_aviso: aviso.id })
    if (r.error) return setError(r.error)
    onCambio?.()
  })

  const Archivos = () => (
    <div style={{ marginTop: 8 }}>
      <input ref={inputRef} type="file" multiple accept={soyProv ? 'image/*,video/*,application/pdf' : 'image/*,video/*'} style={{ display: 'none' }} onChange={agregarArchivos} />
      <button onClick={() => inputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderRadius: 12, background: 'var(--input-bg)', border: '1px dashed var(--border-strong)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, width: '100%', justifyContent: 'center' }}>
        <Camera size={15} /> {soyProv ? 'Subir remito firmado o foto de cómo quedó' : 'Agregar foto o video'}
      </button>
      {archivos.length > 0 && <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6 }}>{archivos.length} archivo(s): {archivos.map(f => f.name).join(', ').slice(0, 90)} <button onClick={() => setArchivos([])} style={{ color: '#f87171', fontWeight: 700, marginLeft: 6 }}>quitar</button></p>}
    </div>
  )

  const campoTxt = { width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 12, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, resize: 'none', fontFamily: "'DM Sans',sans-serif" }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Línea de tiempo */}
      {fase === 'privado' ? null : fase !== 'rechazado' ? (
        <div style={{ display: 'flex', gap: 3 }}>
          {PASOS.map((p, i) => (
            <div key={p} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: 4, borderRadius: 999, background: i <= meta.paso ? meta.color : 'rgba(255,255,255,0.07)' }} />
              <p style={{ fontSize: 7.5, marginTop: 4, color: i <= meta.paso ? 'var(--text-secondary)' : 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p}</p>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...card, borderColor: 'rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.06)' }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#f87171' }}>Reporte rechazado</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.45 }}>{aviso.motivo_rechazo}</p>
        </div>
      )}
      <p style={{ fontSize: 11, fontWeight: 800, color: meta.color }}>{meta.label}</p>

      {/* Ficha del trabajo */}
      <div style={card}>
        {(soyProv || soyAdmin) && (
          <div style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 700 }}>Dirección</p>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700, marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}><MapPin size={13} color="#E0B05E" />
              {edificio?.direccion || edificio?.nombre} · Depto {unidad}</p>
          </div>
        )}
        {(soyProv || soyAdmin) && (
          <div style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 700 }}>Vecino</p>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, marginTop: 2 }}>{aviso.vecinos?.nombre}</p>
            <p style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2 }}>Para coordinar el horario, escribile desde el chat de abajo.</p>
          </div>
        )}
        <p style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 700 }}>Problema · {aviso.categoria}</p>
        <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700, marginTop: 2 }}>{aviso.titulo}</p>
        {aviso.descripcion && <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 4, whiteSpace: 'pre-wrap' }}>{aviso.descripcion}</p>}
        <p style={{ fontSize: 10.5, marginTop: 6, color: aviso.urgencia === 'alta' ? '#f87171' : aviso.urgencia === 'media' ? '#fbbf24' : '#34d399', fontWeight: 700 }}>Urgencia {aviso.urgencia}</p>
        <Adjuntos items={aviso.adjuntos} titulo="Fotos / video del vecino" />
        {aviso.proveedor_nombre && !soyProv && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Proveedor: <strong>{aviso.proveedor_nombre}</strong>{resumenProv && resumenProv.cantidad > 0 && <> · <span style={{ color: '#E0B05E', fontWeight: 700 }}>★ {Number(resumenProv.promedio).toFixed(1)}</span> ({resumenProv.cantidad})</>}</p>}
        {soyVecino && resumenProv && resumenProv.cantidad > 0 && (
          <div style={{ marginTop: 6 }}>
            <button onClick={() => setVerResenas(v => !v)} style={{ fontSize: 11, color: '#E0B05E', textDecoration: 'underline' }}>{verResenas ? 'Ocultar reseñas' : 'Ver reseñas de otros vecinos'}</button>
            {verResenas && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {(resumenProv.resenas || []).length === 0 && <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>Todavía nadie dejó comentarios, solo estrellas.</p>}
                {(resumenProv.resenas || []).map((r, i) => (
                  <div key={i} style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--input-bg)', border: '1px solid var(--border)' }}>
                    <Estrellas valor={r.estrellas} chico />
                    <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4 }}>“{r.resena}”</p>
                    <p style={{ fontSize: 9.5, color: 'var(--text-faint)', marginTop: 2 }}>Un vecino del edificio · {fmtFecha(r.fecha)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {soyAdmin && calif && <p style={{ fontSize: 11, color: '#E0B05E', marginTop: 8, fontWeight: 700 }}>Calificación del vecino: ★ {calif.estrellas}/5{calif.resena ? ` — “${calif.resena}”` : ''}</p>}
      </div>

      {fase === 'privado' && (
        <div style={{ ...card, borderColor: 'rgba(167,139,250,0.4)', background: 'rgba(167,139,250,0.06)' }}>
          <p style={{ fontSize: 12.5, fontWeight: 800, color: '#a78bfa' }}>Resuelto por privado</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
            {soyVecino ? 'El administrador no tiene un proveedor de este rubro cargado y te recomienda contactar a:' : 'Le pasaste al vecino el contacto de:'} <strong>{aviso.proveedor_nombre}</strong>
          </p>
          {aviso.contacto_privado && soyVecino && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <a href={`tel:+${aviso.contacto_privado}`} style={{ flex: 1, textAlign: 'center', padding: '11px', borderRadius: 12, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399', fontSize: 12.5, fontWeight: 700, textDecoration: 'none', display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}><Phone size={14} /> Llamar</a>
              <a href={`https://wa.me/${aviso.contacto_privado}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: 'center', padding: '11px', borderRadius: 12, background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)', color: '#25D366', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>WhatsApp</a>
            </div>
          )}
          {aviso.contacto_privado && !soyVecino && <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>Teléfono: {aviso.contacto_privado}</p>}
        </div>
      )}

      {/* Finalizado: resumen para vecino/admin */}
      {['finalizado_proveedor', 'cerrado'].includes(fase) && (
        <div style={{ ...card, borderColor: 'rgba(224,176,94,0.3)' }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#E0B05E' }}>Trabajo finalizado · {fmtPesos(aviso.presupuesto)}</p>
          {aviso.nota_cierre && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{aviso.nota_cierre}</p>}
          <Adjuntos items={aviso.cierre_adjuntos} titulo="Remito / foto del resultado" />
          <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 6 }}>Finalizado {fmtFechaHora(aviso.finalizado_at)}{aviso.cerrado_at ? ` · Cerrado ${fmtFechaHora(aviso.cerrado_at)}` : ''}</p>
        </div>
      )}

      {/* ---------- ACCIONES ---------- */}
      {soyProv && fase === 'derivado' && modo !== 'no_puede' && modo !== 'finalizar' && (
        <>
          <button disabled={cargando} onClick={aceptar} style={{ ...big(oro, '#0A1428'), opacity: cargando ? 0.6 : 1 }}>Aceptar trabajo / Voy en camino</button>
          <button disabled={cargando} onClick={() => { setModo('no_puede'); setTexto(''); setError('') }} style={big('rgba(248,113,113,0.08)', '#f87171', 'rgba(248,113,113,0.3)')}>No puedo ir (derivar a otro)</button>
        </>
      )}
      {soyProv && modo === 'no_puede' && (
        <div style={card}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>¿Por qué no podés? (opcional)</p>
          <textarea rows={2} value={texto} onChange={e => setTexto(e.target.value.slice(0, 300))} style={campoTxt} placeholder="Ej: estoy en otra obra hasta mañana" />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => setModo(null)} style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-faint)' }}>Volver</button>
            <button disabled={cargando} onClick={noPuede} style={{ ...big('rgba(248,113,113,0.15)', '#f87171', 'rgba(248,113,113,0.4)'), padding: 12, opacity: cargando ? 0.6 : 1 }}>{cargando ? 'Enviando...' : 'Confirmar: no puedo ir'}</button>
          </div>
        </div>
      )}
      {soyProv && ['derivado', 'en_camino'].includes(fase) && modo !== 'no_puede' && modo !== 'finalizar' && (
        <button onClick={() => { setModo('finalizar'); setError(''); setTexto('') }} style={big('rgba(52,211,153,0.14)', '#34d399', 'rgba(52,211,153,0.4)')}>Marcar como Finalizado</button>
      )}
      {soyProv && fase === 'en_camino' && modo !== 'finalizar' && (
        <button disabled={cargando} onClick={() => { setModo('no_puede'); setTexto(''); setError('') }} style={{ fontSize: 11, color: 'var(--text-faint)', textDecoration: 'underline', padding: 4 }}>Ya no puedo ir</button>
      )}
      {soyProv && modo === 'finalizar' && (
        <div style={{ ...card, borderColor: 'rgba(52,211,153,0.35)' }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#34d399', marginBottom: 8 }}>Finalizar trabajo</p>
          <input value={monto} onChange={e => { setMonto(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 12)); setError('') }} inputMode="decimal" placeholder="Monto cobrado ($)" style={{ ...campoTxt, marginBottom: 8 }} />
          <textarea rows={2} value={texto} onChange={e => setTexto(e.target.value.slice(0, 500))} placeholder="Qué se hizo (opcional)" style={campoTxt} />
          <Archivos />
          <p style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 6 }}>El remito firmado o la foto de cómo quedó son opcionales, pero ayudan a que el vecino y el administrador confirmen más rápido.</p>
          {sinFoto && !archivos.length && (
            <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.4)' }}>
              <p style={{ fontSize: 12.5, fontWeight: 800, color: '#fbbf24' }}>¿Seguro que no querés subir el remito firmado o una foto de cómo quedó?</p>
              <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.45 }}>Si lo subís, queda como comprobante del trabajo y evita reclamos después.</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => { setSinFoto(false); inputRef.current?.click() }} style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 12, fontWeight: 800, background: 'linear-gradient(135deg,#E0B05E,#C9923A)', color: '#0A1428' }}>Subir ahora</button>
                <button disabled={cargando} onClick={() => finalizar(true)} style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 12, fontWeight: 700, border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', opacity: cargando ? 0.6 : 1 }}>Finalizar sin foto</button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => { setModo(null); setArchivos([]); setSinFoto(false) }} style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-faint)' }}>Volver</button>
            <button disabled={cargando} onClick={() => finalizar(false)} style={{ ...big(oro, '#0A1428'), padding: 12, opacity: cargando ? 0.6 : 1 }}>{cargando ? 'Subiendo...' : 'Enviar y finalizar'}</button>
          </div>
        </div>
      )}

      {soyVecino && ['finalizado_proveedor', 'cerrado'].includes(fase) && aviso.proveedor_id && (
        <div style={{ ...card, borderColor: 'rgba(224,176,94,0.3)' }}>
          {calif ? (
            <>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#E0B05E' }}>Tu calificación a {aviso.proveedor_nombre}</p>
              <Estrellas valor={calif.estrellas} />
              {calif.resena && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.45 }}>“{calif.resena}”</p>}
            </>
          ) : (
            <>
              <p style={{ fontSize: 12.5, fontWeight: 800, color: '#E0B05E' }}>¿Cómo fue el trabajo de {aviso.proveedor_nombre}?</p>
              <p style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2 }}>Tu calificación ayuda a los próximos vecinos. La reseña es opcional.</p>
              <Estrellas valor={estrellas} onElegir={setEstrellas} />
              <textarea rows={2} value={resena} onChange={e => setResena(e.target.value.slice(0, 300))} placeholder="Reseña (opcional): puntualidad, prolijidad, trato…" style={{ ...campoTxt, marginTop: 8 }} />
              {fase === 'cerrado' && <button disabled={cargando || !estrellas} onClick={calificarSolo} style={{ ...big(oro, '#0A1428'), marginTop: 8, padding: 12, opacity: (cargando || !estrellas) ? 0.5 : 1 }}>Enviar calificación</button>}
            </>
          )}
        </div>
      )}

      {(soyVecino || soyAdmin) && fase === 'finalizado_proveedor' && (() => {
        const mio = soyVecino ? aviso.resuelto_vecino : aviso.resuelto_admin
        const otro = soyVecino ? aviso.resuelto_admin : aviso.resuelto_vecino
        return (
          <button disabled={cargando || mio} onClick={confirmar} style={{ ...big(mio ? 'rgba(52,211,153,0.06)' : 'rgba(52,211,153,0.16)', '#34d399', 'rgba(52,211,153,0.4)'), opacity: cargando ? 0.6 : 1 }}>
            {mio ? `Ya confirmaste — esperando ${soyVecino ? 'al administrador' : 'al vecino'} (1/2)` : otro ? 'Confirmar que está resuelto (falta tu OK — 1/2)' : 'Confirmar que está resuelto'}
          </button>
        )
      })()}
      {fase === 'cerrado' && <div style={{ ...card, textAlign: 'center', borderColor: 'rgba(52,211,153,0.3)' }}><p style={{ fontSize: 12, fontWeight: 800, color: '#34d399' }}>✓ Cerrado — confirmado por el vecino y el administrador</p></div>}

      {soyVecino && fase === 'info_solicitada' && (
        <div style={{ ...card, borderColor: 'rgba(251,146,60,0.4)', background: 'rgba(251,146,60,0.06)' }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#fb923c' }}>El administrador necesita más información</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.45 }}>“{aviso.motivo_info}”</p>
          {modo !== 'responder' ? <button onClick={() => { setModo('responder'); setTexto('') }} style={{ ...big(oro, '#0A1428'), marginTop: 10 }}>Responder</button> : (
            <div style={{ marginTop: 8 }}>
              <textarea rows={3} value={texto} onChange={e => { setTexto(e.target.value.slice(0, 1000)); setError('') }} placeholder="Tu respuesta" style={campoTxt} />
              <Archivos />
              <button disabled={cargando || texto.trim().length < 2} onClick={responder} style={{ ...big(oro, '#0A1428'), marginTop: 10, opacity: (cargando || texto.trim().length < 2) ? 0.5 : 1 }}>{cargando ? 'Enviando...' : 'Enviar respuesta'}</button>
            </div>
          )}
        </div>
      )}
      {soyVecino && ['pendiente_admin', 'info_solicitada'].includes(fase) && (
        <button disabled={cargando} onClick={cancelarReporte} style={{ fontSize: 11, color: 'var(--text-faint)', textDecoration: 'underline', padding: 4 }}>Cancelar este reporte</button>
      )}

      {soyAdmin && ['derivado', 'en_camino'].includes(fase) && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={cargando} onClick={reenviarLink} style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 11.5, fontWeight: 700, border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', opacity: cargando ? 0.6 : 1 }}>Reenviar link al proveedor</button>
          <button disabled={cargando} onClick={reasignar} style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 11.5, fontWeight: 700, border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', opacity: cargando ? 0.6 : 1 }}>Cambiar proveedor</button>
        </div>
      )}
      {soyAdmin && modo === 'link' && link && (
        <div style={{ ...card, borderColor: 'rgba(52,211,153,0.3)' }}>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>Link nuevo para {link.proveedor}. El anterior dejó de funcionar. Vence en 72 horas.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={async () => window.open(await enlaceWhatsApp(link.telefono, link.link, aviso), '_blank', 'noopener')} style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 12, fontWeight: 800, background: '#25D366', color: '#05260f' }}>Enviar por WhatsApp</button>
            <button onClick={() => navigator.clipboard?.writeText(link.link).then(() => setError('Link copiado ✓')).catch(() => setError('No se pudo copiar.'))} style={{ padding: '11px 14px', borderRadius: 12, fontSize: 12, fontWeight: 700, border: '1px solid var(--border-strong)', color: 'var(--text-secondary)' }}>Copiar</button>
          </div>
        </div>
      )}
      {error && <p style={{ fontSize: 11.5, color: error.includes('✓') ? '#34d399' : '#f87171', fontWeight: 600 }}>{error}</p>}
    </div>
  )
}
