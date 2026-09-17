import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader } from '../components/Palace'
import { Send } from 'lucide-react'

// Chat privado vecino <-> admin como sección propia. Usa anuncio_id = null
// (canal general), a diferencia de antes que dependía de responder un post
// puntual del Tablón.
export default function ChatAdmin({ user }) {
  const navigate = useNavigate()
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [cargando, setCargando] = useState(true)
  const bottomRef               = useRef(null)

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await supabase.from('mensajes_privados')
          .select('*').eq('vecino_id', user.id).is('anuncio_id', null)
          .order('created_at', { ascending:true })
        setMensajes(data || [])
      } catch (err) {
        console.error('Error cargando mensajes privados:', err)
      }
      setCargando(false)
    }
    fetch()
    const sub = supabase.channel(`priv-general-${user.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'mensajes_privados' }, payload => {
        if (payload.new.vecino_id===user.id && payload.new.anuncio_id===null)
          setMensajes(prev=>[...prev, payload.new])
      }).subscribe()
    return () => supabase.removeChannel(sub)
  }, [user.id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [mensajes])

  const handleSend = async () => {
    if (!texto.trim() || loading) return
    setLoading(true)
    const msg = { edificio_id:user.edificio.id, vecino_id:user.id, anuncio_id:null, autor:'vecino', contenido:texto.trim(), leido:false }
    const tempId = Date.now()
    setMensajes(prev=>[...prev, { ...msg, id:tempId, created_at:new Date().toISOString(), _temp:true }])
    setTexto('')
    try {
      const { error } = await supabase.from('mensajes_privados').insert(msg)
      if (error) throw error
      setMensajes(prev => prev.map(m => m.id === tempId ? { ...m, _temp:false } : m))
    } catch (err) {
      setMensajes(prev => prev.map(m => m.id === tempId ? { ...m, _temp:false, _error:true } : m))
    }
    setLoading(false)
  }

  return (
    <div className="page page-enter" style={{ display:'flex', flexDirection:'column', height:'100dvh' }}>
      <PalaceFrame />
      <PageHeader title="Chat con el admin" subtitle={user.edificio?.nombre} onBack={() => navigate(-1)} />
      <div style={{ flex:1, overflowY:'auto', padding:'0 20px 16px', display:'flex', flexDirection:'column', gap:10 }}>
        {!cargando && mensajes.length===0 && (
          <p style={{ fontSize:12, color:'var(--text-faint)', textAlign:'center', padding:'30px 0' }}>Escribile al administrador. Es un chat privado, solo lo ven ustedes dos.</p>
        )}
        {mensajes.map(m => (
          <div key={m.id} style={{ display:'flex', justifyContent:m.autor==='vecino'?'flex-end':'flex-start' }}>
            <div onClick={() => m._error && setTexto(m.contenido)} className={m.autor==='vecino'?'chat-mine':'chat-other'} style={{ maxWidth:'75%', padding:'10px 14px', borderRadius:m.autor==='vecino'?'18px 18px 4px 18px':'18px 18px 18px 4px', opacity:m._temp?0.7:1, border:m._error?'1px solid rgba(248,113,113,0.6)':'none', cursor:m._error?'pointer':'default' }}>
              {m.autor==='admin' && <p style={{ fontSize:8, fontWeight:700, color:'rgba(224,176,94,0.7)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.1em' }}>Admin</p>}
              <p style={{ fontSize:13, lineHeight:1.5 }}>{m.contenido}</p>
              {m._error && <p style={{ fontSize:9.5, color:'#f87171', fontWeight:700, marginTop:4 }}>⚠️ No se envió — tocá para reintentar</p>}
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>
      <div className="chat-input-bar" style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:10, flexShrink:0, paddingBottom:'max(12px,env(safe-area-inset-bottom))' }}>
        <input value={texto} onChange={e=>setTexto(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&handleSend()} placeholder="Escribile al admin..." style={{ flex:1, background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:999, padding:'10px 16px', color:'var(--text-primary)', fontSize:13, fontFamily:"'DM Sans',sans-serif" }}/>
        <button onClick={handleSend} disabled={loading||!texto.trim()} style={{ width:42, height:42, borderRadius:'50%', background:texto.trim()?'linear-gradient(135deg,#E0B05E,#C9923A)':'var(--bg-card)', border:'none', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Send size={16} color={texto.trim()?'#0A1428':'var(--text-faint)'} strokeWidth={2}/>
        </button>
      </div>
    </div>
  )
}
