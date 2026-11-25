// Página del proveedor (/t/<token>). AISLADA: sin Supabase Auth, sin Firebase, sin router y sin enlaces a la app.
// Todo pasa por netlify/functions/trabajo-link.js. El token entra por la URL una sola vez: se manda por POST,
// se guarda en sessionStorage de esta pestaña y la URL se reemplaza por /t.
import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_MB, validarArchivoBase } from '../lib/adjuntos-base'

const API = '/.netlify/functions/trabajo-link'
const SK = 't_tk'
const MENSAJE_INACTIVO = 'Este link ya no está activo. Pedile uno nuevo al administrador.'

const FRANJAS = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche', a_coordinar: 'A coordinar' }
const URG = { alta: 'Urgente', media: 'Normal', baja: 'Sin apuro' }
const ESTADO_ACUERDO = { propuesto: 'Esperando respuesta', aceptado_contraparte: 'Falta la aprobación del administrador', aprobado_admin: 'Aprobado por el administrador', rechazado: 'Rechazado', vencido: 'Vencido' }

const fmtFecha = (f) => { if (!f) return ''; const [y, m, d] = String(f).split('-'); return `${d}/${m}/${y}` }
const fmtHora = (iso) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const fmtMonto = (n) => n == null ? '' : '$' + Number(n).toLocaleString('es-AR')

async function api(token, accion, extra = {}) {
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', referrerPolicy: 'no-referrer', body: JSON.stringify({ token, accion, ...extra }) })
    const b = await r.json().catch(() => ({}))
    return { status: r.status, ...b }
  } catch { return { status: 0, error: 'Sin conexión. Revisá tu internet y probá de nuevo.' } }
}

export default function TrabajoLink() {
  const tokenRef = useRef(null)
  const [estado, setEstado] = useState('cargando')   // cargando | inactivo | terminos | ok | listo
  const [d, setD] = useState(null)                    // datos del trabajo
  const [urls, setUrls] = useState({})                // { path: { url, exp } }
  const [aviso, setAviso] = useState('')              // error / aviso general
  const [ocupado, setOcupado] = useState(false)
  const [pantalla, setPantalla] = useState('')        // '' | presupuesto | nopuedo | finalizar | acuerdo
  const [leido, setLeido] = useState(false)           // casilla de términos

  // 1) Token: de la URL (solo la primera vez) a sessionStorage, y la URL pasa a /t
  useEffect(() => {
    const m = window.location.pathname.match(/^\/t\/([A-Za-z0-9_-]{20,120})\/?$/)
    if (m) { try { sessionStorage.setItem(SK, m[1]) } catch { /* sin storage: queda en memoria */ } tokenRef.current = m[1]; window.history.replaceState(null, '', '/t') }
    else { try { tokenRef.current = sessionStorage.getItem(SK) } catch { tokenRef.current = null } }
    if (!tokenRef.current) { setEstado('inactivo'); return }
    cargar(false, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const guardarUrls = (nuevas, seg) => {
    if (!nuevas || !Object.keys(nuevas).length) return
    const exp = Date.now() + (seg || 600) * 1000 - 60000
    setUrls(prev => { const o = { ...prev }; for (const [p, u] of Object.entries(nuevas)) o[p] = { url: u, exp }; return o })
  }
  const urlDe = (p) => (p && urls[p]?.url) || null

  const cargar = useCallback(async (liviano = false, inicial = false, extra = {}) => {
    const yaTengo = Object.entries(urls).filter(([, v]) => v.exp > Date.now()).map(([p]) => p)
    const r = await api(tokenRef.current, 'ver', { liviano, yaTengo, ...extra })
    if (r.status === 410) { setEstado('inactivo'); return null }
    if (r.status === 429) { setAviso('Demasiados intentos. Esperá unos minutos.'); return null }
    if (r.status !== 200) { if (inicial) setEstado('inactivo'); else setAviso(r.error || ''); return null }
    if (r.requiere_terminos) { setEstado('terminos'); return null }
    guardarUrls(r.urls, r.url_vence_seg)
    setD(prev => (liviano && prev) ? { ...prev, fase: r.fase, chat_pausado: r.chat_pausado, chat_abierto: r.chat_abierto, presupuesto_pedido: r.presupuesto_pedido, mensajes: r.mensajes, acuerdo: r.acuerdo, acuerdo_rechazado: r.acuerdo_rechazado, trabajo: prev.trabajo && { ...prev.trabajo, acuerdo_aprobado: r.acuerdo?.estado === 'aprobado_admin' } } : r)
    setEstado('ok')
    return r
  }, [urls])

  // 2) Polling del chat cada 5 s; se pausa si la pestaña está oculta
  const cargarRef = useRef(cargar); cargarRef.current = cargar
  useEffect(() => {
    if (estado !== 'ok' || !d?.chat_abierto) return
    const t = setInterval(() => { if (!document.hidden) cargarRef.current(true) }, 5000)
    const vis = () => { if (!document.hidden) cargarRef.current(true) }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [estado, d?.chat_abierto])

  const accion = async (nombre, extra = {}, { alOk } = {}) => {
    setOcupado(true); setAviso('')
    const r = await api(tokenRef.current, nombre, extra)
    setOcupado(false)
    if (r.status === 410) { setEstado('inactivo'); return r }
    if (r.status !== 200) { setAviso(r.error || 'No se pudo completar. Probá de nuevo.'); return r }
    if (alOk) alOk(r)
    return r
  }

  // 3) Subida de archivos con URL firmada (restringida a <edificio>/<reclamo>/ en el servidor)
  const subir = async (file) => {
    const err = validarArchivoBase(file, { permitirVideo: false, permitirPdf: true })
    if (err) { setAviso(err); return null }
    const p = await api(tokenRef.current, 'pedir_url_subida', { nombre: file.name || 'archivo', tipo: file.type, size: file.size })
    if (p.status !== 200) { setAviso(p.error || 'No se pudo preparar la subida.'); return null }
    try {
      const headers = { 'Content-Type': file.type, 'x-upsert': 'false', 'cache-control': 'max-age=3600' }
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
      if (anon) headers.apikey = anon
      const r = await fetch(p.upload_url, { method: 'PUT', headers, body: file })
      if (!r.ok) throw new Error('subida')
    } catch { setAviso('No se pudo subir el archivo. Probá de nuevo.'); return null }
    return { path: p.path, tipo: file.type, nombre: (file.name || '').slice(0, 80), size: file.size }
  }

  const aceptarTerminos = async () => { setOcupado(true); await cargar(false, false, { aceptaTerminos: true }); setOcupado(false) }

  // ---------------- Pantallas ----------------
  if (estado === 'cargando') return <Marco><p style={S.centro}>Cargando…</p></Marco>
  if (estado === 'inactivo') return <Marco><div style={S.tarjeta}><p style={S.h2}>Link inactivo</p><p style={S.p}>{MENSAJE_INACTIVO}</p></div></Marco>
  if (estado === 'listo') return <Marco><div style={S.tarjeta}><p style={S.h2}>¡Listo!</p><p style={S.p}>Avisamos al administrador. Ya podés cerrar esta página.</p></div></Marco>
  if (estado === 'terminos') return (
    <Marco>
      <div style={S.tarjeta}>
        <p style={S.h2}>Antes de empezar</p>
        <p style={S.p}>Este link es personal para este trabajo. No lo compartas. Desde acá vas a poder aceptar el trabajo, chatear con el vecino (el administrador supervisa la conversación) y avisar cuando termines.</p>
        <p style={S.p}>Los datos de contacto (teléfonos, emails y links) los coordina el administrador. Leé los <a href="/terminos.html" target="_blank" rel="noopener noreferrer" style={S.link}>términos</a> y la <a href="/privacidad.html" target="_blank" rel="noopener noreferrer" style={S.link}>política de privacidad</a>.</p>
        <label style={S.check}><input type="checkbox" checked={leido} onChange={e => setLeido(e.target.checked)} style={{ width: 22, height: 22, flexShrink: 0 }} /> Leí y acepto</label>
        <button style={{ ...S.btn, opacity: leido ? 1 : .5 }} disabled={!leido || ocupado} onClick={aceptarTerminos}>Continuar</button>
        {aviso && <p style={S.error}>{aviso}</p>}
      </div>
    </Marco>
  )

  const t = d.trabajo
  const fase = d.fase
  const fotos = t.fotos || []

  return (
    <Marco>
      <header style={S.cab}>
        <div>
          <p style={S.mini}>{t.edificio}{t.direccion ? ` · ${t.direccion}` : ''}</p>
          <h1 style={S.h1}>{t.titulo}</h1>
        </div>
        <span style={{ ...S.pill, background: t.urgencia === 'alta' ? '#FDE7E4' : '#EEF1F6', color: t.urgencia === 'alta' ? '#B3261E' : '#3B4A66' }}>{URG[t.urgencia] || 'Normal'}</span>
      </header>

      {aviso && <p style={S.error} role="alert">{aviso}</p>}

      <section style={S.tarjeta}>
        <p style={S.fila}><b>Rubro:</b> {t.rubro}</p>
        <p style={S.fila}><b>Dónde:</b> Depto {t.depto || '?'}{t.vecino ? ` · ${t.vecino}` : ''}</p>
        {t.descripcion && <p style={{ ...S.p, marginTop: 8 }}>{t.descripcion}</p>}
        {t.nota_admin && <p style={S.nota}><b>Nota del administrador:</b> {t.nota_admin}</p>}
        {fotos.length > 0 && (
          <div style={S.fotos}>
            {fotos.map(f => { const u = urlDe(f.path); if (!u) return null; return f.tipo.startsWith('video/')
              ? <video key={f.path} src={u} controls playsInline preload="metadata" style={S.foto} />
              : <a key={f.path} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={f.nombre || 'Foto del problema'} style={S.foto} /></a> })}
          </div>
        )}
      </section>

      {/* ---- DERIVADO ---- */}
      {fase === 'derivado' && !pantalla && (
        <section style={S.tarjeta}>
          <p style={S.h2}>¿Podés hacer este trabajo?</p>
          <button style={S.btn} disabled={ocupado} onClick={() => accion('aceptar', {}, { alOk: () => cargar() })}>✅ Acepto el trabajo</button>
          {!d.presupuesto_pedido && <button style={S.btn2} disabled={ocupado} onClick={() => accion('pedir_presupuesto', {}, { alOk: () => { cargar(); setPantalla('presupuesto') } })}>💬 Pido presupuesto (necesito verlo)</button>}
          <button style={S.btnRojo} disabled={ocupado} onClick={() => setPantalla('nopuedo')}>No puedo</button>
        </section>
      )}
      {fase === 'derivado' && d.presupuesto_pedido && !pantalla && (
        <section style={S.tarjeta}>
          <p style={S.p}>Pediste presupuestar. Coordiná la visita en el chat y mandá tu presupuesto.</p>
          <button style={S.btn2} onClick={() => setPantalla('presupuesto')}>Enviar presupuesto</button>
        </section>
      )}
      {pantalla === 'nopuedo' && <FormNoPuedo ocupado={ocupado} onVolver={() => setPantalla('')} onEnviar={(motivo) => accion('no_puede', { motivo }, { alOk: () => setEstado('listo') })} />}
      {pantalla === 'presupuesto' && <FormAcuerdo titulo="Enviar presupuesto" montoObligatorio ocupado={ocupado} onVolver={() => setPantalla('')} onEnviar={(v) => accion('enviar_presupuesto', v, { alOk: () => { setPantalla(''); cargar(true) } })} />}

      {/* ---- ACUERDO ---- */}
      {d.chat_abierto && !pantalla && (
        <AcuerdoCard d={d} ocupado={ocupado}
          onAceptar={(id) => accion('aceptar_acuerdo', { acuerdo_id: id }, { alOk: () => cargar(true) })}
          onProponer={() => setPantalla('acuerdo')} />
      )}
      {pantalla === 'acuerdo' && <FormAcuerdo titulo="Proponer acuerdo" ocupado={ocupado} onVolver={() => setPantalla('')} onEnviar={(v) => accion('proponer_acuerdo', v, { alOk: () => { setPantalla(''); cargar(true) } })} />}

      {/* ---- CHAT ---- */}
      {d.chat_abierto && !pantalla && (
        <Chat d={d} urlDe={urlDe} ocupado={ocupado} subir={subir} setAviso={setAviso}
          onEnviar={(v) => accion('enviar_mensaje', v, { alOk: (r) => { if (r.bloqueado) setAviso(r.mensaje); cargar(true) } })} />
      )}

      {/* ---- EN CAMINO: terminé ---- */}
      {fase === 'en_camino' && !pantalla && (
        <section style={S.tarjeta}>
          {t.requiere_acuerdo && !t.acuerdo_aprobado && <p style={S.nota}>Este edificio pide un acuerdo aprobado por el administrador antes de finalizar.</p>}
          <button style={S.btn} onClick={() => setPantalla('finalizar')}>🏁 Terminé el trabajo</button>
        </section>
      )}
      {pantalla === 'finalizar' && <FormFinalizar ocupado={ocupado} subir={subir} setAviso={setAviso} onVolver={() => setPantalla('')}
        onEnviar={(v) => accion('finalizar', v, { alOk: () => { setPantalla(''); cargar() } })} />}

      {/* ---- FINALIZADO ---- */}
      {fase === 'finalizado_proveedor' && (
        <section style={S.tarjeta}>
          <p style={S.h2}>⏳ Esperando confirmación</p>
          <p style={S.p}>Marcaste el trabajo como terminado{t.cierre?.monto != null ? ` por ${fmtMonto(t.cierre.monto)}` : ''}. El vecino y el administrador tienen que confirmarlo. El chat sigue abierto.</p>
          {t.cierre?.nota && <p style={S.fila}><b>Tu nota:</b> {t.cierre.nota}</p>}
          <div style={S.fotos}>{(t.cierre?.adjuntos || []).map(f => { const u = urlDe(f.path); return u && f.tipo !== 'application/pdf' ? <img key={f.path} src={u} alt="Comprobante" style={S.foto} /> : u ? <a key={f.path} href={u} target="_blank" rel="noopener noreferrer" style={S.link}>📄 {f.nombre || 'Comprobante'}</a> : null })}</div>
        </section>
      )}
      <p style={S.pie}>MAKO Consorcios · Link personal, no lo compartas</p>
    </Marco>
  )
}

// ---------------------------------------------------------------------------
function AcuerdoCard({ d, ocupado, onAceptar, onProponer }) {
  const a = d.acuerdo
  const puedeAceptar = a && a.estado === 'propuesto' && a.propuesto_por === 'vecino'
  return (
    <section style={S.tarjeta}>
      <p style={S.h2}>🤝 Acuerdo</p>
      {a ? (
        <>
          <p style={S.fila}><b>{ESTADO_ACUERDO[a.estado]}</b> · propuesto por {a.propuesto_por === 'proveedor' ? 'vos' : 'el vecino'}</p>
          {a.fecha_visita && <p style={S.fila}>Visita: {fmtFecha(a.fecha_visita)} · {FRANJAS[a.franja] || ''}</p>}
          {a.monto_presupuesto != null && <p style={S.fila}>Monto: {fmtMonto(a.monto_presupuesto)}</p>}
          <p style={S.fila}>Alcance: {a.alcance}</p>
          {puedeAceptar && <button style={S.btn} disabled={ocupado} onClick={() => onAceptar(a.id)}>Acepto este acuerdo</button>}
        </>
      ) : <p style={S.p}>Todavía no hay acuerdo. {d.acuerdo_rechazado ? `El último fue rechazado${d.acuerdo_rechazado.decidido_motivo ? ': ' + d.acuerdo_rechazado.decidido_motivo : ''}.` : ''}</p>}
      {(!a || ['rechazado', 'vencido'].includes(a.estado) || a.estado === 'aprobado_admin' || a.estado === 'propuesto') && <button style={S.btn2} onClick={onProponer}>{a ? 'Proponer otro acuerdo' : 'Proponer acuerdo (visita y monto)'}</button>}
    </section>
  )
}

function Chat({ d, urlDe, ocupado, subir, setAviso, onEnviar }) {
  const [texto, setTexto] = useState('')
  const [foto, setFoto] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const fin = useRef(null)
  useEffect(() => { fin.current?.scrollIntoView({ block: 'nearest' }) }, [d.mensajes?.length])
  const pausado = d.chat_pausado
  const enviar = async () => {
    if (!texto.trim() && !foto) return
    onEnviar({ texto: texto.trim(), imagen_path: foto?.path || undefined })
    setTexto(''); setFoto(null)
  }
  const elegir = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setSubiendo(true); const r = await subir(f); setSubiendo(false)
    if (r) setFoto(r)
  }
  return (
    <section style={S.tarjeta}>
      <p style={S.h2}>💬 Chat</p>
      <p style={S.supervisa}>🛡️ Esta conversación la supervisa el administrador</p>
      <div style={S.chat} aria-live="polite">
        {(d.mensajes || []).length === 0 && <p style={{ ...S.mini, textAlign: 'center' }}>Todavía no hay mensajes.</p>}
        {(d.mensajes || []).map(m => (
          <div key={m.id} style={{ ...S.burbuja, alignSelf: m.propio ? 'flex-end' : 'flex-start', background: m.propio ? '#0A1428' : m.de === 'admin' ? '#FFF4DC' : '#fff', color: m.propio ? '#fff' : '#0A1428' }}>
            <p style={{ ...S.mini, color: m.propio ? '#C9D2E3' : '#5B6B88', margin: 0 }}>{m.nombre} · {fmtHora(m.creado)}</p>
            {m.imagen && (urlDe(m.imagen) ? <img src={urlDe(m.imagen)} alt="Foto" style={{ maxWidth: '100%', borderRadius: 8, marginTop: 6 }} /> : <p style={S.mini}>📷 Foto</p>)}
            {m.texto && <p style={{ margin: '4px 0 0', fontSize: 15, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.texto}</p>}
            {m.retenido && <p style={{ ...S.mini, color: '#FFB4A9', margin: '6px 0 0' }}>⛔ Por seguridad, los datos de contacto los coordina el administrador. Este mensaje solo lo ve el administrador.</p>}
          </div>
        ))}
        <div ref={fin} />
      </div>
      {pausado ? <p style={S.nota}>El administrador pausó el chat. Podés leer, pero no escribir por ahora.</p> : (
        <>
          {foto && <p style={S.mini}>📎 Foto lista para enviar · <button style={S.linkBtn} onClick={() => setFoto(null)}>quitar</button></p>}
          <textarea style={S.input} rows={2} maxLength={1000} placeholder="Escribí un mensaje…" value={texto} onChange={e => setTexto(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ ...S.btn2, margin: 0, flex: '0 0 auto', width: 56, textAlign: 'center', cursor: 'pointer' }} aria-label="Adjuntar foto">{subiendo ? '…' : '📷'}
              <input type="file" accept="image/*" capture="environment" onChange={elegir} style={{ display: 'none' }} /></label>
            <button style={{ ...S.btn, margin: 0, flex: 1 }} disabled={ocupado || subiendo || (!texto.trim() && !foto)} onClick={enviar}>Enviar</button>
          </div>
        </>
      )}
    </section>
  )
}

function FormNoPuedo({ ocupado, onVolver, onEnviar }) {
  const [m, setM] = useState('')
  return (
    <section style={S.tarjeta}>
      <p style={S.h2}>No puedo hacer este trabajo</p>
      <label style={S.label}>Motivo (corto)</label>
      <input style={S.input} maxLength={300} value={m} onChange={e => setM(e.target.value)} placeholder="Ej: estoy en otra obra esta semana" />
      <button style={S.btnRojo} disabled={ocupado || m.trim().length < 3} onClick={() => onEnviar(m.trim())}>Confirmar</button>
      <button style={S.btn2} onClick={onVolver}>Volver</button>
    </section>
  )
}

function FormAcuerdo({ titulo, montoObligatorio, ocupado, onVolver, onEnviar }) {
  const [v, setV] = useState({ fecha_visita: '', franja: 'a_coordinar', monto: '', alcance: '' })
  const set = (k) => (e) => setV(p => ({ ...p, [k]: e.target.value }))
  const hoy = new Date().toISOString().slice(0, 10)
  const ok = v.alcance.trim().length >= 3 && (!montoObligatorio || Number(v.monto) > 0)
  return (
    <section style={S.tarjeta}>
      <p style={S.h2}>{titulo}</p>
      <label style={S.label}>Fecha de visita (opcional)</label>
      <input style={S.input} type="date" min={hoy} value={v.fecha_visita} onChange={set('fecha_visita')} />
      <label style={S.label}>Franja</label>
      <select style={S.input} value={v.franja} onChange={set('franja')}>{Object.entries(FRANJAS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
      <label style={S.label}>Monto en pesos{montoObligatorio ? '' : ' (opcional)'}</label>
      <input style={S.input} inputMode="decimal" placeholder="Ej: 45000" value={v.monto} onChange={set('monto')} />
      <label style={S.label}>Qué incluye ({v.alcance.length}/300)</label>
      <textarea style={S.input} rows={3} maxLength={300} value={v.alcance} onChange={set('alcance')} placeholder="Ej: cambio de caño de 1 metro y mano de obra" />
      <p style={S.mini}>Lo tiene que aceptar la otra parte y aprobar el administrador.</p>
      <button style={{ ...S.btn, opacity: ok ? 1 : .5 }} disabled={!ok || ocupado} onClick={() => onEnviar({ ...v, monto: v.monto === '' ? undefined : Number(String(v.monto).replace(',', '.')), fecha_visita: v.fecha_visita || undefined })}>Enviar</button>
      <button style={S.btn2} onClick={onVolver}>Volver</button>
    </section>
  )
}

function FormFinalizar({ ocupado, subir, setAviso, onVolver, onEnviar }) {
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [adj, setAdj] = useState([])
  const [subiendo, setSubiendo] = useState(false)
  const [seguro, setSeguro] = useState(false)
  const elegir = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f || adj.length >= 5) return
    setSubiendo(true); const r = await subir(f); setSubiendo(false)
    if (r) setAdj(a => [...a, r])
  }
  const enviar = () => onEnviar({ monto: Number(String(monto).replace(/\./g, '').replace(',', '.')), nota: nota.trim(), adjuntos: adj })
  const montoOk = Number(String(monto).replace(/\./g, '').replace(',', '.')) > 0
  return (
    <section style={S.tarjeta}>
      <p style={S.h2}>Terminé el trabajo</p>
      <label style={S.label}>Monto final en pesos</label>
      <input style={S.input} inputMode="decimal" placeholder="Ej: 45000" value={monto} onChange={e => setMonto(e.target.value)} />
      <label style={S.label}>Nota ({nota.length}/500)</label>
      <textarea style={S.input} rows={3} maxLength={500} value={nota} onChange={e => setNota(e.target.value)} placeholder="Qué hiciste" />
      <label style={S.label}>Foto del trabajo o remito (hasta 5)</label>
      <label style={{ ...S.btn2, textAlign: 'center', cursor: 'pointer' }}>{subiendo ? 'Subiendo…' : '📷 Agregar foto o PDF'}
        <input type="file" accept="image/*,application/pdf" onChange={elegir} style={{ display: 'none' }} /></label>
      {adj.map(a => <p key={a.path} style={S.mini}>✔ {a.nombre || 'Archivo'} · <button style={S.linkBtn} onClick={() => setAdj(l => l.filter(x => x.path !== a.path))}>quitar</button></p>)}
      {seguro && adj.length === 0 ? (
        <div style={S.nota}>
          <p style={{ margin: '0 0 8px' }}><b>¿Seguro?</b> No subiste ninguna foto ni remito. Con una prueba el cierre es más rápido.</p>
          <button style={S.btn} disabled={ocupado} onClick={enviar}>Sí, enviar sin foto</button>
          <button style={S.btn2} onClick={() => setSeguro(false)}>Voy a agregar una</button>
        </div>
      ) : (
        <button style={{ ...S.btn, opacity: montoOk ? 1 : .5 }} disabled={!montoOk || ocupado || subiendo} onClick={() => adj.length === 0 ? setSeguro(true) : enviar()}>Enviar</button>
      )}
      <button style={S.btn2} onClick={onVolver}>Volver</button>
    </section>
  )
}

function Marco({ children }) { return <main style={S.marco}>{children}</main> }

const S = {
  marco: { maxWidth: 480, margin: '0 auto', padding: '16px 14px 40px', minHeight: '100dvh', background: '#E6E9EF', color: '#0A1428', fontFamily: "'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", boxSizing: 'border-box' },
  cab: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 12 },
  h1: { fontSize: 22, margin: '2px 0 0', lineHeight: 1.2 }, h2: { fontSize: 17, fontWeight: 700, margin: '0 0 8px' },
  p: { fontSize: 15, lineHeight: 1.5, margin: '0 0 10px' }, fila: { fontSize: 15, margin: '4px 0', lineHeight: 1.4 },
  mini: { fontSize: 12, color: '#5B6B88', margin: '0 0 4px' }, centro: { textAlign: 'center', marginTop: 80, color: '#5B6B88' },
  tarjeta: { background: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: '0 1px 6px rgba(10,20,40,.08)' },
  pill: { fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 999, whiteSpace: 'nowrap' },
  btn: { display: 'block', width: '100%', minHeight: 52, margin: '10px 0 0', borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 700, color: '#0A1428', background: 'linear-gradient(135deg,#E0B05E,#C9923A)', cursor: 'pointer' },
  btn2: { display: 'block', width: '100%', minHeight: 48, margin: '10px 0 0', borderRadius: 14, border: '1.5px solid #0A1428', fontSize: 15, fontWeight: 600, color: '#0A1428', background: 'transparent', cursor: 'pointer', boxSizing: 'border-box', padding: '12px 8px' },
  btnRojo: { display: 'block', width: '100%', minHeight: 48, margin: '10px 0 0', borderRadius: 14, border: '1.5px solid #B3261E', fontSize: 15, fontWeight: 600, color: '#B3261E', background: 'transparent', cursor: 'pointer' },
  input: { width: '100%', boxSizing: 'border-box', padding: 12, fontSize: 16, borderRadius: 12, border: '1.5px solid #C7CEDB', marginBottom: 8, fontFamily: 'inherit', background: '#fff', color: '#0A1428' },
  label: { display: 'block', fontSize: 13, fontWeight: 600, margin: '8px 0 4px' },
  check: { display: 'flex', gap: 10, alignItems: 'center', fontSize: 16, margin: '12px 0' },
  error: { background: '#FDE7E4', color: '#8C1D18', padding: 12, borderRadius: 12, fontSize: 14, margin: '0 0 12px' },
  nota: { background: '#FFF4DC', padding: 12, borderRadius: 12, fontSize: 14, margin: '8px 0' },
  supervisa: { fontSize: 12, background: '#EEF1F6', padding: '6px 10px', borderRadius: 10, margin: '0 0 8px' },
  chat: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', padding: 8, background: '#F3F5F9', borderRadius: 12, marginBottom: 8 },
  burbuja: { maxWidth: '85%', padding: '8px 12px', borderRadius: 14, boxShadow: '0 1px 2px rgba(10,20,40,.1)' },
  fotos: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }, foto: { width: 96, height: 96, objectFit: 'cover', borderRadius: 10, background: '#DDE2EC' },
  link: { color: '#8A5A12', fontWeight: 600 }, linkBtn: { background: 'none', border: 'none', color: '#8A5A12', textDecoration: 'underline', fontSize: 12, padding: 0, cursor: 'pointer' },
  pie: { textAlign: 'center', fontSize: 11, color: '#7A869D', marginTop: 20 },
}
