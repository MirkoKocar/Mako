import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { notificar } from '../lib/flujo'
import { validarArchivo, subirAdjunto } from '../lib/adjuntos'
import FlowPanel from '../components/FlowPanel'
import { ImagenChat } from '../components/Adjuntos'
import { PalaceFrame, ChevronLeft, Send, Check, CheckCheck, Phone, X, Camera, Image as ImageIcon, Pencil, CornerUpLeft } from '../components/Palace'

const RESPUESTAS_RAPIDAS = ['Estoy en camino','Lo reviso hoy','Necesito más información','Trabajo completado']

export default function Chat({ user }) {
  const { avisoId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [aviso, setAviso] = useState(null)
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState(location.state?.mensajeInicial || '')
  const [loading, setLoading] = useState(true)
  const [showNota, setShowNota] = useState(false)
  const [notaInterna, setNotaInterna] = useState('')
  const [showWhatsapp, setShowWhatsapp] = useState(false)
  const [showCall, setShowCall] = useState(false)
  const [subiendoImagen, setSubiendoImagen] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [textoEdicion, setTextoEdicion] = useState('')
  const [respondiendoA, setRespondiendoA] = useState(null)
  const [otroEscribiendo, setOtroEscribiendo] = useState(false)
  const [errorCarga, setErrorCarga] = useState('')
  const bottomRef = useRef(null)
  const channelRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const cameraInputRef = useRef(null)
  const galeriaInputRef = useRef(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: av, error: e1 } = await supabase.from('avisos').select('*, vecinos(nombre,departamento)').eq('id', avisoId).single()
        if (e1) throw e1
        setAviso(av)
        const { data: msgs, error: e2 } = await supabase.from('mensajes').select('*').eq('aviso_id', avisoId).order('created_at', { ascending: true })
        if (e2) throw e2
        setMensajes(msgs || [])
      } catch (err) {
        setErrorCarga('No se pudo cargar la conversación. Revisá tu conexión.')
      }
      setLoading(false)
    }
    fetchData()

    channelRef.current = supabase.channel(`chat-${avisoId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `aviso_id=eq.${avisoId}` },
        payload => {
          setMensajes(prev => {
            if (prev.find(m => m.id === payload.new.id)) return prev
            const filtered = prev.filter(m => !m._temp || m.contenido !== payload.new.contenido)
            return [...filtered, payload.new]
          })
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensajes', filter: `aviso_id=eq.${avisoId}` },
        payload => {
          setMensajes(prev => prev.map(m => m.id === payload.new.id ? payload.new : m))
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'avisos', filter: `id=eq.${avisoId}` },
        () => { recargarAviso() })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.rol === user.rol) return // soy yo mismo, ignorar
        setOtroEscribiendo(true)
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = setTimeout(() => setOtroEscribiendo(false), 2500)
      })
      .subscribe()

    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [avisoId])

  const recargarAviso = useCallback(async () => {
    const { data } = await supabase.from('avisos').select('*, vecinos(nombre,departamento)').eq('id', avisoId).single()
    if (data) setAviso(data)
  }, [avisoId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, otroEscribiendo])

  // Marcar como leídos los mensajes del OTRO que todavía no lo estaban
  useEffect(() => {
    const pendientes = mensajes.filter(m => !m._temp && !m.es_nota_interna && m.remitente_rol !== user.rol && !m.leido)
    if (!pendientes.length) return
    supabase.from('mensajes').update({ leido: true }).in('id', pendientes.map(m => m.id)).then(() => {
      setMensajes(prev => prev.map(m => pendientes.find(p => p.id === m.id) ? { ...m, leido: true } : m))
    })
  }, [mensajes, user.rol])

  const avisarEscribiendo = () => {
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { rol: user.rol } })
  }

  const sendMsg = useCallback(async (contenidoOverride, imagenUrl = null) => {
    const contenido = contenidoOverride || texto.trim()
    if (!contenido && !imagenUrl) return
    setTexto('')
    const respuestaAId = respondiendoA?.id || null
    setRespondiendoA(null)

    const tempId = `temp-${Date.now()}`
    const tempMsg = {
      id: tempId, aviso_id: avisoId, contenido, imagen_url: imagenUrl,
      remitente_rol: user.rol, remitente_id: user.id,
      vecino_id: aviso?.vecino_id, proveedor_id: aviso?.proveedor_id,
      es_nota_interna: false, respuesta_a: respuestaAId,
      created_at: new Date().toISOString(), _temp: true
    }
    setMensajes(prev => [...prev, tempMsg])
    if (navigator.vibrate) navigator.vibrate(40)

    try {
      const { data: saved, error } = await supabase.from('mensajes').insert({
        aviso_id: avisoId, contenido, imagen_url: imagenUrl, remitente_rol: user.rol,
        remitente_id: user.id, vecino_id: aviso?.vecino_id,
        proveedor_id: aviso?.proveedor_id, es_nota_interna: false, respuesta_a: respuestaAId,
      }).select().single()

      if (error || !saved) throw error || new Error('sin datos')

      setMensajes(prev => prev.map(m => m.id === tempId ? saved : m))
      notificar({ tipo: 'mensaje', avisoId, contenido: contenido || '📷 Foto' })
    } catch (err) {
      // Antes, si esto fallaba (sin conexión, error del servidor, etc.) el
      // mensaje se quedaba para siempre en el chat con aspecto de "enviando"
      // sin avisarle nunca a la persona que en realidad no se mandó.
      console.error('Error enviando mensaje:', err)
      setMensajes(prev => prev.map(m => m.id === tempId ? { ...m, _temp: false, _error: true } : m))
    }
  }, [texto, avisoId, user, aviso, respondiendoA])

  // Reintentar un mensaje que quedó marcado como no enviado
  const reintentarMsg = useCallback((msg) => {
    setMensajes(prev => prev.filter(m => m.id !== msg.id))
    sendMsg(msg.contenido, msg.imagen_url)
  }, [sendMsg])

  const handleAdjuntar = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const msg = await validarArchivo(file, { permitirVideo: false })
    if (msg) { setErrorCarga(msg); return }
    setSubiendoImagen(true)
    try {
      const adj = await subirAdjunto(file, aviso.edificio_id, avisoId)
      await sendMsg('', `adjuntos:${adj.path}`)
    } catch (err) {
      setErrorCarga('No se pudo subir la imagen. Probá de nuevo.')
    }
    setSubiendoImagen(false)
  }

  const iniciarEdicion = (m) => { setEditandoId(m.id); setTextoEdicion(m.contenido) }
  const cancelarEdicion = () => { setEditandoId(null); setTextoEdicion('') }
  const guardarEdicion = async () => {
    if (!textoEdicion.trim()) return
    try {
      const { error } = await supabase.from('mensajes').update({ contenido: textoEdicion.trim(), editado: true }).eq('id', editandoId)
      if (error) throw error
      setMensajes(prev => prev.map(m => m.id === editandoId ? { ...m, contenido: textoEdicion.trim(), editado: true } : m))
    } catch (err) {
      setErrorCarga('No se pudo guardar la edición. Probá de nuevo.')
    }
    cancelarEdicion()
  }

  const sendNota = async () => {
    if (!notaInterna.trim()) return
    try {
      const { error } = await supabase.from('mensajes').insert({ aviso_id: avisoId, contenido: notaInterna.trim(), remitente_rol: 'admin', remitente_id: user.id, es_nota_interna: true })
      if (error) throw error
      setNotaInterna(''); setShowNota(false)
    } catch (err) {
      setErrorCarga('No se pudo guardar la nota. Probá de nuevo.')
    }
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0A1428' }}>
      <p style={{ color:'var(--text-faint)', fontSize:12 }}>Cargando...</p>
    </div>
  )

  if (!aviso) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0A1428', padding:'0 30px', gap:14, textAlign:'center' }}>
      <p style={{ color:'#f87171', fontSize:13, fontWeight:600 }}>{errorCarga || 'No se pudo cargar esta conversación.'}</p>
      <button onClick={() => window.location.reload()} style={{ fontSize:12, fontWeight:700, color:'#0A1428', padding:'10px 22px', background:'linear-gradient(135deg,#E0B05E,#C9923A)', borderRadius:999 }}>Reintentar</button>
      <button onClick={() => navigate(-1)} style={{ fontSize:11, color:'var(--text-faint)', padding:8 }}>Volver</button>
    </div>
  )

  const esPropio = (msg) => msg.remitente_rol === user.rol
  const stateIdx = ['nuevo','en_curso','resuelto'].indexOf(aviso?.estado)
  const buscarMensaje = (id) => mensajes.find(m => m.id === id)

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100dvh', background:'#0A1428', maxWidth:'var(--page-max)', margin:'0 auto' }}>
      <PalaceFrame />

      {/* Header */}
      <div style={{ padding:'44px 18px 12px', background:'rgba(10,20,40,0.97)', backdropFilter:'blur(20px)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <button onClick={() => navigate(-1)} style={{ color:'var(--text-muted)', fontSize:10, letterSpacing:'0.08em', display:'flex', alignItems:'center', gap:5, marginBottom:8, textTransform:'uppercase', fontWeight:600, background:'var(--bg-card)', padding:'6px 12px', borderRadius:999, border:'1px solid var(--border)' }}>
          <ChevronLeft size={13}/> Volver
        </button>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div style={{ flex:1, minWidth:0 }}>
            <h2 className="font-serif" style={{ fontSize:17, color:'var(--text-primary)', lineHeight:1.2, marginBottom:2 }}>{aviso?.titulo}</h2>
            <p style={{ fontSize:10, color:'var(--text-muted)', fontWeight:500 }}>
              {aviso?.vecinos?.nombre} · Depto {aviso?.vecinos?.departamento}
              {aviso?.proveedor_nombre && user.rol !== 'proveedor' && ` · ${aviso.proveedor_nombre}`}
            </p>
            {otroEscribiendo && <p style={{ fontSize:10, color:'rgba(224,176,94,0.7)', fontStyle:'italic', marginTop:3 }}>escribiendo...</p>}
            {errorCarga && (
              <p onClick={() => setErrorCarga('')} style={{ fontSize:10, color:'#f87171', fontWeight:600, marginTop:4, cursor:'pointer' }}>⚠️ {errorCarga} (tocá para ocultar)</p>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 18px', display:'flex', flexDirection:'column', gap:8 }}>
        <FlowPanel aviso={aviso} user={user} onCambio={recargarAviso} />
        <p style={{ fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-faint)', fontWeight:700, marginTop:8 }}>Conversación</p>
        {mensajes.length === 0 && !loading && (
          <div style={{ textAlign:'center', margin:'8px auto', color:'var(--text-faint)', fontSize:12 }}>Todavía no hay mensajes</div>
        )}
        {mensajes.map((m, i) => {
          const propio = esPropio(m)
          if (m.es_nota_interna && user.rol !== 'admin') return null
          const citado = m.respuesta_a ? buscarMensaje(m.respuesta_a) : null
          const enEdicion = editandoId === m.id

          return (
            <div key={m.id || i} style={{ display:'flex', justifyContent:m.es_nota_interna?'center':propio?'flex-end':'flex-start' }}>
              {m.es_nota_interna ? (
                <div style={{ padding:'6px 14px', background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.15)', borderRadius:10, maxWidth:'85%' }}>
                  <p style={{ fontSize:11, color:'rgba(251,191,36,0.6)', fontStyle:'italic' }}>Nota interna: {m.contenido}</p>
                </div>
              ) : (
                <div
                  onDoubleClick={() => !m._temp && !m._error && setRespondiendoA(m)}
                  onClick={() => m._error && reintentarMsg(m)}
                  style={{ maxWidth:'76%', minWidth:120, padding: m.imagen_url ? 6 : '10px 14px', borderRadius:16, borderBottomRightRadius:propio?4:16, borderBottomLeftRadius:propio?16:4, background:propio?'rgba(224,176,94,0.12)':'var(--bg-card)', border:`1px solid ${m._error?'rgba(248,113,113,0.5)':propio?'rgba(224,176,94,0.2)':'var(--border)'}`, opacity:m._temp?0.7:1, cursor:m._error?'pointer':'default', transition:'opacity 0.2s' }}>

                  {citado && (
                    <div style={{ borderLeft:'2px solid rgba(224,176,94,0.5)', paddingLeft:8, marginBottom:6, opacity:0.65 }}>
                      <p style={{ fontSize:10.5, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {citado.imagen_url ? '📷 Foto' : citado.contenido}
                      </p>
                    </div>
                  )}

                  {m.imagen_url && (
                    <div style={{ marginBottom: m.contenido ? 6 : 2 }}><ImagenChat src={m.imagen_url}/></div>
                  )}

                  {enEdicion ? (
                    <div style={{ padding: m.imagen_url ? '0 6px 6px' : 0 }}>
                      <textarea value={textoEdicion} onChange={e=>setTextoEdicion(e.target.value)} rows={2}
                        style={{ width:'100%', background:'rgba(0,0,0,0.2)', border:'1px solid rgba(224,176,94,0.3)', borderRadius:8, padding:8, color:'var(--text-primary)', fontSize:13, fontFamily:"'DM Sans',sans-serif", resize:'none' }}/>
                      <div style={{ display:'flex', gap:6, marginTop:6, justifyContent:'flex-end' }}>
                        <button onClick={cancelarEdicion} style={{ fontSize:10, color:'var(--text-faint)', padding:'4px 10px' }}>Cancelar</button>
                        <button onClick={guardarEdicion} style={{ fontSize:10, color:'#E0B05E', fontWeight:700, padding:'4px 10px', background:'rgba(224,176,94,0.1)', borderRadius:999 }}>Guardar</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {m.contenido && <p style={{ fontSize:14, color:propio?'var(--text-primary)':'var(--text-secondary)', lineHeight:1.45, fontWeight:500, padding: m.imagen_url ? '0 6px' : 0 }}>{m.contenido}</p>}
                      {m._error && (
                        <p style={{ fontSize:10.5, color:'#f87171', fontWeight:600, padding: m.imagen_url ? '0 6px' : 0, marginTop:2 }}>
                          ⚠️ No se pudo enviar — tocá para reintentar
                        </p>
                      )}
                      <div style={{ display:'flex', justifyContent:propio?'flex-end':'flex-start', alignItems:'center', gap:5, marginTop:3, padding: m.imagen_url ? '0 6px 4px' : 0 }}>
                        {propio && !m._temp && (
                          <button onClick={() => iniciarEdicion(m)} style={{ color:'var(--text-faint)', display:'flex' }}><Pencil size={9}/></button>
                        )}
                        {!m._temp && (
                          <button onClick={() => setRespondiendoA(m)} style={{ color:'var(--text-faint)', display:'flex' }}><CornerUpLeft size={10}/></button>
                        )}
                        {m.editado && <p style={{ fontSize:8.5, color:'var(--text-faint)', fontStyle:'italic' }}>editado</p>}
                        <p style={{ fontSize:9, color:'var(--text-faint)' }}>{new Date(m.created_at).toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' })}</p>
                        {propio && !m._temp && (m.leido ? <CheckCheck size={11} color="#60a5fa" strokeWidth={2}/> : <Check size={10} color="var(--text-muted)" strokeWidth={2}/>)}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} style={{ height:1 }}/>
      </div>

      {/* Respuestas rápidas proveedor */}
      {user.rol === 'proveedor' && (
        <div style={{ padding:'8px 16px 0', display:'flex', gap:7, overflowX:'auto', flexShrink:0 }}>
          {RESPUESTAS_RAPIDAS.map(r => (
            <button key={r} onClick={() => sendMsg(r)} style={{ padding:'6px 14px', borderRadius:999, background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--border)', fontSize:10, whiteSpace:'nowrap', fontWeight:600, flexShrink:0 }}>{r}</button>
          ))}
        </div>
      )}

      {/* Nota interna admin */}
      {user.rol === 'admin' && showNota && (
        <div style={{ padding:'8px 16px 0', flexShrink:0 }}>
          <div style={{ display:'flex', gap:8 }}>
            <input value={notaInterna} onChange={e => setNotaInterna(e.target.value)} placeholder="Nota interna..."
              style={{ flex:1, background:'rgba(251,191,36,0.05)', border:'1px solid rgba(251,191,36,0.18)', borderRadius:12, padding:'10px 14px', color:'var(--text-primary)', fontSize:13, fontFamily:"'DM Sans',sans-serif" }}/>
            <button onClick={sendNota} style={{ padding:'10px 16px', background:'rgba(251,191,36,0.1)', border:'1px solid rgba(251,191,36,0.22)', borderRadius:12, color:'rgba(251,191,36,0.75)', fontSize:11, fontWeight:700 }}>Guardar</button>
          </div>
        </div>
      )}

      {/* Respondiendo a... */}
      {respondiendoA && (
        <div style={{ padding:'8px 16px 0', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:'7px 12px' }}>
            <div style={{ borderLeft:'2px solid rgba(224,176,94,0.6)', paddingLeft:8, minWidth:0 }}>
              <p style={{ fontSize:9, color:'#E0B05E', fontWeight:700, marginBottom:1 }}>Respondiendo</p>
              <p style={{ fontSize:11, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{respondiendoA.imagen_url ? '📷 Foto' : respondiendoA.contenido}</p>
            </div>
            <button onClick={() => setRespondiendoA(null)} style={{ color:'var(--text-faint)', flexShrink:0, marginLeft:8 }}><X size={14}/></button>
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{ padding:'10px 15px 20px', background:'rgba(10,20,40,0.97)', backdropFilter:'blur(20px)', borderTop:'1px solid var(--border)', display:'flex', gap:7, alignItems:'flex-end', flexShrink:0 }}>
        {user.rol === 'admin' && (
          <button onClick={() => setShowNota(!showNota)} style={{ width:36, height:36, borderRadius:12, background:showNota?'rgba(251,191,36,0.12)':'var(--bg-card)', border:`1px solid ${showNota?'rgba(251,191,36,0.25)':'var(--border)'}`, color:showNota?'rgba(251,191,36,0.7)':'var(--text-muted)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>✎</button>
        )}

        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={handleAdjuntar} />
        <input ref={galeriaInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleAdjuntar} />

        <button onClick={() => cameraInputRef.current?.click()} disabled={subiendoImagen} style={{ width:36, height:36, borderRadius:12, background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text-muted)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Camera size={16}/>
        </button>
        <button onClick={() => galeriaInputRef.current?.click()} disabled={subiendoImagen} style={{ width:36, height:36, borderRadius:12, background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text-muted)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ImageIcon size={16}/>
        </button>

        <textarea value={texto} onChange={e => { setTexto(e.target.value); avisarEscribiendo() }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() } }} placeholder={subiendoImagen ? 'Subiendo foto...' : 'Escribí un mensaje...'} rows={1} disabled={subiendoImagen}
          style={{ flex:1, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:14, padding:'11px 14px', color:'var(--text-primary)', fontSize:14, resize:'none', lineHeight:1.5, maxHeight:90, overflowY:'auto', fontFamily:"'DM Sans',sans-serif" }}/>
        <button onClick={() => sendMsg()} disabled={!texto.trim()} style={{ width:40, height:40, borderRadius:13, flexShrink:0, background:texto.trim()?'linear-gradient(135deg,#E0B05E,#C9923A)':'var(--bg-card)', border:'1px solid var(--border)', color:texto.trim()?'#0A1428':'var(--text-faint)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:texto.trim()?'0 2px 12px rgba(224,176,94,0.28)':'none', transition:'all 0.2s' }}>
          <Send size={15} strokeWidth={2}/>
        </button>
      </div>
    </div>
  )
}
