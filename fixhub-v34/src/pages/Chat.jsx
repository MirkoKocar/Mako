import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { notifyNuevoMensaje, notifyFaltaConfirmarResuelto } from '../firebase'
import { PalaceFrame, ChevronLeft, Send, Check, CheckCheck, Phone, X, Camera, Image as ImageIcon, Pencil, CornerUpLeft } from '../components/Palace'

const RESPUESTAS_RAPIDAS = ['Estoy en camino','Lo reviso hoy','Necesito más información','Trabajo completado']
const BUCKET = 'chat-imagenes'

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
        const { data: av, error: e1 } = await supabase.from('avisos').select('*, proveedores(*), vecinos(nombre,departamento)').eq('id', avisoId).single()
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
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.rol === user.rol) return // soy yo mismo, ignorar
        setOtroEscribiendo(true)
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = setTimeout(() => setOtroEscribiendo(false), 2500)
      })
      .subscribe()

    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [avisoId])

  // Alert timers
  useEffect(() => {
    if (user.rol !== 'vecino') return
    const t1 = setTimeout(() => setShowWhatsapp(true), 10 * 60 * 1000)
    const t2 = setTimeout(() => setShowCall(true), 25 * 60 * 1000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [user.rol])

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
      const destinatarioId = user.rol === 'vecino' ? aviso?.proveedor_id : aviso?.vecino_id
      const remitente = user.nombre || (user.rol === 'admin' ? 'Admin' : 'Proveedor')
      if (destinatarioId) {
        await notifyNuevoMensaje({ avisoId, contenido: contenido || '📷 Foto', destinatarioId, remitente, destinatarioEsProveedor: user.rol === 'vecino' })
      }
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
    setSubiendoImagen(true)
    try {
      const nombreArchivo = `${avisoId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      const { error } = await supabase.storage.from(BUCKET).upload(nombreArchivo, file)
      if (error) throw error
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(nombreArchivo)
      await sendMsg('', pub.publicUrl)
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

  const cambiarEstado = async (nuevoEstado) => {
    const anterior = aviso
    setAviso(prev => ({ ...prev, estado: nuevoEstado }))
    try {
      const { error } = await supabase.from('avisos').update({ estado: nuevoEstado, updated_at: new Date().toISOString() }).eq('id', avisoId)
      if (error) throw error
    } catch (err) {
      setAviso(anterior)
      setErrorCarga('No se pudo cambiar el estado. Probá de nuevo.')
    }
  }

  // Doble confirmación de "Resuelto": tanto el vecino como el admin tienen
  // que tocar el botón para que el reclamo pase a Completo. Si solo uno lo
  // tocó, queda marcado "1/2" y se le avisa al otro que falta su ok.
  const [marcandoResuelto, setMarcandoResuelto] = useState(false)
  const marcarResuelto = async () => {
    if (marcandoResuelto || user.rol === 'proveedor' || !aviso?.presupuesto) return
    const campo = user.rol === 'vecino' ? 'resuelto_vecino' : 'resuelto_admin'
    if (aviso?.[campo]) return // ya lo había marcado esta misma persona/rol
    setMarcandoResuelto(true)
    const anterior = aviso
    const otroYaMarcado = user.rol === 'vecino' ? aviso?.resuelto_admin : aviso?.resuelto_vecino
    const ambosCompletos = !!otroYaMarcado
    const cambios = { [campo]: true, ...(ambosCompletos ? { estado: 'resuelto', updated_at: new Date().toISOString() } : {}) }
    setAviso(prev => ({ ...prev, ...cambios }))
    try {
      const { error } = await supabase.from('avisos').update(cambios).eq('id', avisoId)
      if (error) throw error
      if (!ambosCompletos) {
        // Avisarle a la otra parte que falta su confirmación
        await notifyFaltaConfirmarResuelto({
          avisoId, titulo: aviso?.titulo, edificioId: user.edificio?.id || aviso?.edificio_id,
          vecinoId: aviso?.vecino_id, paraRol: user.rol === 'vecino' ? 'admin' : 'vecino',
        })
      }
    } catch (err) {
      setAviso(anterior)
      setErrorCarga('No se pudo registrar tu confirmación. Probá de nuevo.')
    }
    setMarcandoResuelto(false)
  }

  // Presupuesto: lo carga el proveedor. Mientras no esté cargado, no se
  // puede dar el reclamo por completado (recordatorio en rojo para el
  // proveedor cada vez que entra al chat).
  const [presupuestoInput, setPresupuestoInput] = useState('')
  const [editandoPresupuesto, setEditandoPresupuesto] = useState(false)
  const [guardandoPresupuesto, setGuardandoPresupuesto] = useState(false)
  const guardarPresupuesto = async () => {
    const monto = parseFloat(presupuestoInput.replace(',', '.'))
    if (!monto || monto <= 0) { setErrorCarga('Ingresá un monto válido para el presupuesto.'); return }
    setGuardandoPresupuesto(true)
    try {
      const { error } = await supabase.from('avisos').update({ presupuesto: monto }).eq('id', avisoId)
      if (error) throw error
      setAviso(prev => ({ ...prev, presupuesto: monto }))
      setEditandoPresupuesto(false)
    } catch (err) {
      setErrorCarga('No se pudo guardar el presupuesto. Probá de nuevo.')
    }
    setGuardandoPresupuesto(false)
  }

  const abrirWhatsApp = () => {
    const tel = aviso?.proveedores?.telefono
    if (!tel) return
    const msg = encodeURIComponent(`Hola, te escribo desde MAKO sobre el aviso: "${aviso?.titulo}". Necesito una respuesta.`)
    window.open(`https://wa.me/${tel}?text=${msg}`, '_blank')
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
    <div style={{ display:'flex', flexDirection:'column', height:'100dvh', background:'#0A1428', maxWidth:430, margin:'0 auto' }}>
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
              {aviso?.proveedores?.nombre && ` · ${aviso.proveedores.nombre}`}
            </p>
            {otroEscribiendo && <p style={{ fontSize:10, color:'rgba(224,176,94,0.7)', fontStyle:'italic', marginTop:3 }}>escribiendo...</p>}
            {errorCarga && (
              <p onClick={() => setErrorCarga('')} style={{ fontSize:10, color:'#f87171', fontWeight:600, marginTop:4, cursor:'pointer' }}>⚠️ {errorCarga} (tocá para ocultar)</p>
            )}
            <div style={{ display:'flex', gap:3, marginTop:7 }}>
              {['nuevo','en_curso','resuelto'].map((e,i) => (
                <div key={e} style={{ flex:1, height:3, borderRadius:999, background:i<=stateIdx?(e==='resuelto'?'rgba(52,211,153,0.65)':e==='en_curso'?'rgba(251,191,36,0.6)':'rgba(248,113,113,0.55)'):'rgba(255,255,255,0.06)', transition:'background 0.3s' }}/>
              ))}
            </div>
          </div>
          {user.rol === 'admin' && (
            <select value={aviso?.estado === 'resuelto' ? 'en_curso' : aviso?.estado} onChange={e => cambiarEstado(e.target.value)}
              disabled={aviso?.estado === 'resuelto'}
              style={{ marginLeft:10, background:'#11203B', border:'1px solid var(--border)', borderRadius:10, padding:'6px 10px', color:'var(--text-primary)', fontSize:10, fontWeight:600, flexShrink:0, opacity:aviso?.estado==='resuelto'?0.5:1 }}>
              <option value="nuevo">Pendiente</option>
              <option value="en_curso">En proceso</option>
            </select>
          )}
        </div>

        {/* Presupuesto — lo carga el proveedor; vecino y admin lo ven, y no pueden completar el reclamo sin esto */}
        {user.rol === 'proveedor' ? (
          aviso?.presupuesto && !editandoPresupuesto ? (
            <div style={{ width:'100%', marginTop:10, padding:'10px 14px', borderRadius:14, background:'rgba(224,176,94,0.08)', border:'1px solid rgba(224,176,94,0.25)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <p style={{ fontSize:12, color:'#E0B05E', fontWeight:700 }}>Presupuesto: ${aviso.presupuesto}</p>
              <button onClick={() => { setPresupuestoInput(String(aviso.presupuesto)); setEditandoPresupuesto(true) }} style={{ fontSize:10, color:'var(--text-faint)', fontWeight:600, textDecoration:'underline' }}>Editar</button>
            </div>
          ) : (
            <div style={{ width:'100%', marginTop:10, padding:'10px 14px', borderRadius:14, background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.3)' }}>
              <p style={{ fontSize:11, color:'#f87171', fontWeight:600, marginBottom:8 }}>⚠️ Para que este reporte pueda marcarse como completado, cargá un presupuesto.</p>
              <div style={{ display:'flex', gap:8 }}>
                <input value={presupuestoInput} onChange={e => setPresupuestoInput(e.target.value.replace(/[^0-9.,]/g,''))} placeholder="Monto ($)" inputMode="decimal"
                  style={{ flex:1, background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:10, padding:'8px 12px', color:'var(--text-primary)', fontSize:13 }} />
                <button onClick={guardarPresupuesto} disabled={guardandoPresupuesto} style={{ padding:'8px 16px', borderRadius:10, background:'linear-gradient(135deg,#E0B05E,#C9923A)', color:'#0A1428', fontSize:12, fontWeight:700, opacity:guardandoPresupuesto?0.6:1 }}>
                  {guardandoPresupuesto ? '...' : 'Guardar'}
                </button>
              </div>
            </div>
          )
        ) : (
          aviso?.presupuesto ? (
            <div style={{ width:'100%', marginTop:10, padding:'9px 14px', borderRadius:14, background:'rgba(224,176,94,0.06)', border:'1px solid rgba(224,176,94,0.2)' }}>
              <p style={{ fontSize:11.5, color:'#E0B05E', fontWeight:600 }}>Presupuesto informado por el proveedor: ${aviso.presupuesto}</p>
            </div>
          ) : (
            <div style={{ width:'100%', marginTop:10, padding:'9px 14px', borderRadius:14, background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.2)' }}>
              <p style={{ fontSize:11, color:'#fbbf24', fontWeight:600 }}>El proveedor todavía no cargó un presupuesto — hace falta antes de poder completar este reclamo.</p>
            </div>
          )
        )}

        {/* Doble confirmación de resuelto — la ve el vecino que reportó y el admin, no el proveedor */}
        {user.rol !== 'proveedor' && aviso?.estado !== 'resuelto' && (
          aviso?.presupuesto ? (
            <button onClick={marcarResuelto} disabled={marcandoResuelto || aviso?.[user.rol === 'vecino' ? 'resuelto_vecino' : 'resuelto_admin']}
              style={{ width:'100%', marginTop:10, padding:'12px', borderRadius:14, fontSize:13, fontWeight:700,
                background: aviso?.[user.rol === 'vecino' ? 'resuelto_vecino' : 'resuelto_admin'] ? 'rgba(52,211,153,0.08)' : 'rgba(52,211,153,0.14)',
                border: `1px solid ${aviso?.[user.rol === 'vecino' ? 'resuelto_vecino' : 'resuelto_admin'] ? 'rgba(52,211,153,0.25)' : 'rgba(52,211,153,0.4)'}`,
                color: '#34d399', display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity:marcandoResuelto?0.6:1 }}>
              <CheckCheck size={16}/>
              {aviso?.[user.rol === 'vecino' ? 'resuelto_vecino' : 'resuelto_admin']
                ? `Ya marcaste esto como resuelto — esperando a ${user.rol === 'vecino' ? 'el administrador' : 'el vecino'} (1/2)`
                : (aviso?.resuelto_vecino || aviso?.resuelto_admin)
                  ? 'Confirmar que también está resuelto (1/2 — falta vos)'
                  : 'Marcar como resuelto'}
            </button>
          ) : (
            <div style={{ width:'100%', marginTop:8, padding:'10px', borderRadius:14, fontSize:11, fontWeight:600, background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text-faint)', textAlign:'center' }}>
              El botón de "Marcar como resuelto" se habilita apenas el proveedor cargue el presupuesto.
            </div>
          )
        )}
        {aviso?.estado === 'resuelto' && (
          <div style={{ width:'100%', marginTop:10, padding:'10px', borderRadius:14, fontSize:12, fontWeight:700, background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.3)', color:'#34d399', textAlign:'center' }}>
            ✓ Completo — confirmado por el vecino y el administrador
          </div>
        )}
      </div>

      {/* Alert banners */}
      {showWhatsapp && user.rol === 'vecino' && aviso?.proveedores?.telefono && (
        <div style={{ background:'rgba(251,191,36,0.08)', borderBottom:'1px solid rgba(251,191,36,0.18)', padding:'10px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <p style={{ fontSize:11, color:'rgba(251,191,36,0.8)', fontWeight:600 }}>Sin respuesta. ¿Alertar por WhatsApp?</p>
          <button onClick={abrirWhatsApp} style={{ fontSize:10, color:'rgba(251,191,36,0.9)', fontWeight:700, padding:'5px 12px', border:'1px solid rgba(251,191,36,0.3)', borderRadius:999, background:'rgba(251,191,36,0.1)', flexShrink:0, marginLeft:10 }}>Alertar</button>
        </div>
      )}
      {showCall && user.rol === 'vecino' && aviso?.proveedores?.telefono && (
        <div style={{ background:'rgba(248,113,113,0.08)', borderBottom:'1px solid rgba(248,113,113,0.18)', padding:'10px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <p style={{ fontSize:11, color:'rgba(248,113,113,0.8)', fontWeight:600 }}>Urgente — sin respuesta por 25 min.</p>
          <a href={`tel:${aviso.proveedores.telefono}`} style={{ fontSize:10, color:'#f87171', fontWeight:700, padding:'5px 12px', border:'1px solid rgba(248,113,113,0.3)', borderRadius:999, background:'rgba(248,113,113,0.1)', flexShrink:0, marginLeft:10, textDecoration:'none', display:'flex', alignItems:'center', gap:5 }}>
            <Phone size={11}/> Llamar
          </a>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 18px', display:'flex', flexDirection:'column', gap:8 }}>
        {mensajes.length === 0 && !loading && (
          <div style={{ textAlign:'center', margin:'auto', color:'var(--text-faint)', fontSize:12 }}>Iniciá la conversación</div>
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
                    <img src={m.imagen_url} alt="Foto adjunta" style={{ width:'100%', maxHeight:260, objectFit:'cover', borderRadius:12, marginBottom: m.contenido ? 6 : 2 }}/>
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
