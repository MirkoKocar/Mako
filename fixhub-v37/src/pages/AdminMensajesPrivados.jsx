import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, Card } from '../components/Palace'
import { Send, ChevronRight, MessageCircle } from 'lucide-react'

// Lista de vecinos que le escribieron al admin por privado (canal general,
// anuncio_id = null). Tocar uno abre el chat con ese vecino puntual.
function ListaVecinos({ user, onAbrir }) {
  const [hilos, setHilos]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    const fetch = async () => {
      setLoading(true); setError('')
      try {
        const { data: msgs, error: e } = await supabase.from('mensajes_privados')
          .select('*, vecinos:vecino_id(id, nombre, departamento)')
          .eq('edificio_id', user.edificio.id).is('anuncio_id', null)
          .order('created_at', { ascending:false })
        if (e) throw e

        // Agrupar por vecino: último mensaje + si hay algo sin leer del vecino
        const porVecino = {}
        for (const m of (msgs||[])) {
          const vid = m.vecino_id
          if (!porVecino[vid]) {
            porVecino[vid] = { vecino: m.vecinos, ultimo: m, sinLeer: 0 }
          }
          if (m.autor === 'vecino' && !m.leido) porVecino[vid].sinLeer++
        }
        setHilos(Object.values(porVecino))
      } catch (err) {
        setError('No se pudieron cargar los mensajes. Revisá tu conexión.')
      }
      setLoading(false)
    }
    fetch()
  }, [user.edificio.id])

  if (loading) return <p style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center', padding:'30px 0' }}>Cargando...</p>
  if (error) return <p style={{ fontSize:12, color:'var(--red)', textAlign:'center', padding:'30px 0' }}>{error}</p>
  if (!hilos.length) return (
    <Card style={{ textAlign:'center', padding:'30px 20px' }}>
      <MessageCircle size={26} color="var(--text-faint)" strokeWidth={1} style={{ margin:'0 auto 10px' }}/>
      <p style={{ fontSize:13, color:'var(--text-muted)', fontWeight:600 }}>Sin mensajes todavía</p>
      <p style={{ fontSize:11, color:'var(--text-faint)', marginTop:4 }}>Acá van a aparecer los chats privados que inicien los vecinos.</p>
    </Card>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {hilos.map(h => (
        <div key={h.vecino?.id} onClick={() => onAbrir(h.vecino)} style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:16, padding:'14px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:38, height:38, borderRadius:'50%', background:'var(--gold-faint)', border:'1px solid rgba(224,176,94,0.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span className="font-serif" style={{ fontSize:16, color:'var(--gold)' }}>{h.vecino?.nombre?.charAt(0)||'?'}</span>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{h.vecino?.nombre||'Vecino'} {h.vecino?.departamento?`· Depto ${h.vecino.departamento}`:''}</p>
            <p style={{ fontSize:11, color:'var(--text-faint)', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{h.ultimo.autor==='admin'?'Vos: ':''}{h.ultimo.contenido}</p>
          </div>
          {h.sinLeer>0 && <div style={{ width:8, height:8, borderRadius:'50%', background:'#E0B05E', flexShrink:0 }}/>}
          <ChevronRight size={14} color="rgba(224,176,94,0.3)" strokeWidth={2}/>
        </div>
      ))}
    </div>
  )
}

function ChatConVecino({ user, vecino, onBack }) {
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef               = useRef(null)

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await supabase.from('mensajes_privados')
          .select('*').eq('vecino_id', vecino.id).is('anuncio_id', null)
          .order('created_at', { ascending:true })
        setMensajes(data || [])
        // Marcar como leídos los mensajes del vecino
        await supabase.from('mensajes_privados').update({ leido:true })
          .eq('vecino_id', vecino.id).is('anuncio_id', null).eq('autor', 'vecino').eq('leido', false)
      } catch (err) {
        console.error('Error cargando mensajes privados:', err)
      }
    }
    fetch()
    const sub = supabase.channel(`priv-admin-${vecino.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'mensajes_privados' }, payload => {
        if (payload.new.vecino_id===vecino.id && payload.new.anuncio_id===null)
          setMensajes(prev=>[...prev, payload.new])
      }).subscribe()
    return () => supabase.removeChannel(sub)
  }, [vecino.id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [mensajes])

  const handleSend = async () => {
    if (!texto.trim() || loading) return
    setLoading(true)
    const msg = { edificio_id:user.edificio.id, vecino_id:vecino.id, anuncio_id:null, autor:'admin', contenido:texto.trim(), leido:false }
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
      <PageHeader title={vecino.nombre} subtitle={vecino.departamento?`Depto ${vecino.departamento}`:'Mensaje privado'} onBack={onBack} />
      <div style={{ flex:1, overflowY:'auto', padding:'0 20px 16px', display:'flex', flexDirection:'column', gap:10 }}>
        {mensajes.map(m => (
          <div key={m.id} style={{ display:'flex', justifyContent:m.autor==='admin'?'flex-end':'flex-start' }}>
            <div onClick={() => m._error && setTexto(m.contenido)} className={m.autor==='admin'?'chat-mine':'chat-other'} style={{ maxWidth:'75%', padding:'10px 14px', borderRadius:m.autor==='admin'?'18px 18px 4px 18px':'18px 18px 18px 4px', opacity:m._temp?0.7:1, border:m._error?'1px solid rgba(248,113,113,0.6)':'none', cursor:m._error?'pointer':'default' }}>
              <p style={{ fontSize:13, lineHeight:1.5 }}>{m.contenido}</p>
              {m._error && <p style={{ fontSize:9.5, color:'#f87171', fontWeight:700, marginTop:4 }}>⚠️ No se envió — tocá para reintentar</p>}
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>
      <div className="chat-input-bar" style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:10, flexShrink:0, paddingBottom:'max(12px,env(safe-area-inset-bottom))' }}>
        <input value={texto} onChange={e=>setTexto(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&handleSend()} placeholder={`Escribile a ${vecino.nombre?.split(' ')[0]||'el vecino'}...`} style={{ flex:1, background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:999, padding:'10px 16px', color:'var(--text-primary)', fontSize:13, fontFamily:"'DM Sans',sans-serif" }}/>
        <button onClick={handleSend} disabled={loading||!texto.trim()} style={{ width:42, height:42, borderRadius:'50%', background:texto.trim()?'linear-gradient(135deg,#E0B05E,#C9923A)':'var(--bg-card)', border:'none', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Send size={16} color={texto.trim()?'#0A1428':'var(--text-faint)'} strokeWidth={2}/>
        </button>
      </div>
    </div>
  )
}

export default function AdminMensajesPrivados({ user }) {
  const navigate = useNavigate()
  const [vecinoAbierto, setVecinoAbierto] = useState(null)

  if (vecinoAbierto) return <ChatConVecino user={user} vecino={vecinoAbierto} onBack={() => setVecinoAbierto(null)} />

  return (
    <div className="page page-enter">
      <PalaceFrame />
      <PageHeader title="Mensajes privados" subtitle="Chats con vecinos" onBack={() => navigate(-1)} />
      <div style={{ padding:'0 20px' }}>
        <ListaVecinos user={user} onAbrir={setVecinoAbierto} />
      </div>
    </div>
  )
}
