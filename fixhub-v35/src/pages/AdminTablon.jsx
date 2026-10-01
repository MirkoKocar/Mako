import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { notifyNuevoAnuncioTablon } from '../firebase'
import { PalaceFrame, PageHeader, AccentCard, Card, PrimaryBtn, OrnamentLine, SectionLabel, GhostBtn } from '../components/Palace'
import { Megaphone, Vote, Bell, Plus, Trash2, X } from 'lucide-react'

const TIPOS = [
  { id:'aviso',    label:'Aviso',    Icon:Megaphone, color:'#E0B05E', desc:'Comunicado general' },
  { id:'votacion', label:'Votación', Icon:Vote,      color:'#60a5fa', desc:'Los vecinos votan' },
  { id:'anuncio',  label:'Urgente',  Icon:Bell,      color:'#f87171', desc:'Prioridad alta' },
]

const PRIORIDAD_COLOR = { urgente:'#f87171', normal:'#E0B05E', info:'#60a5fa', aviso:'#E0B05E', votacion:'#60a5fa', anuncio:'#f87171' }

export default function AdminTablon({ user }) {
  const [anuncios, setAnuncios]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [creando, setCreando]     = useState(false)
  const [tipo, setTipo]           = useState('aviso')
  const [titulo, setTitulo]       = useState('')
  const [contenido, setContenido] = useState('')
  const [opciones, setOpciones]   = useState(['', ''])
  const [saving, setSaving]       = useState(false)
  const [fechaHora, setFechaHora] = useState('') // vacío = publicar ahora mismo
  const [errorCarga, setErrorCarga] = useState('')
  const [errorForm, setErrorForm] = useState('')

  const fetchAnuncios = async () => {
    setLoading(true); setErrorCarga('')
    try {
      const { data, error } = await supabase.from('anuncios').select('*')
        .eq('edificio_id', user.edificio.id)
        .order('created_at', { ascending:false })
      if (error) throw error
      setAnuncios(data || [])
    } catch (err) {
      setErrorCarga('No se pudo cargar el tablón. Revisá tu conexión.')
    }
    setLoading(false)
  }

  useEffect(() => { fetchAnuncios() }, [user.edificio.id])

  const publicar = async () => {
    if (!titulo.trim()) return
    if (tipo === 'votacion' && opciones.filter(o=>o.trim()).length < 2) return
    setSaving(true); setErrorForm('')

    const publicaEnFuturo = fechaHora && new Date(fechaHora) > new Date()
    const payload = {
      titulo: titulo.trim(), contenido: contenido.trim(),
      edificio_id: user.edificio.id,
      tipo, prioridad: tipo === 'anuncio' ? 'urgente' : tipo === 'votacion' ? 'info' : 'normal',
      autor: user.nombre,
      opciones_votacion: tipo === 'votacion' ? opciones.filter(o=>o.trim()) : null,
      fecha_publicacion: fechaHora ? new Date(fechaHora).toISOString() : new Date().toISOString(),
      notificado: !publicaEnFuturo,
    }

    try {
      const { data, error } = await supabase.from('anuncios').insert(payload).select().single()
      if (error || !data) throw error || new Error('sin datos')
      setAnuncios(prev => [data, ...prev].sort((a,b) => new Date(b.fecha_publicacion) - new Date(a.fecha_publicacion)))
      // Si se publica ahora, notificamos ya. Si es programado para más adelante, no se notifica todavía.
      if (!publicaEnFuturo) await notifyNuevoAnuncioTablon({ edificioId: user.edificio.id, titulo: titulo.trim(), tipo })
      setTitulo(''); setContenido(''); setOpciones(['','']); setTipo('aviso'); setFechaHora('')
      setCreando(false)
    } catch (err) {
      setErrorForm('No se pudo publicar. Probá de nuevo.')
    }
    setSaving(false)
  }

  const eliminar = async (id) => {
    const anterior = anuncios
    setAnuncios(prev => prev.filter(a => a.id !== id))
    try {
      const { error } = await supabase.from('anuncios').delete().eq('id', id)
      if (error) throw error
    } catch (err) {
      setAnuncios(anterior) // no se pudo borrar de verdad, lo devolvemos a la lista
    }
  }

  const formatFechaHora = (iso) => {
    const d = new Date(iso)
    return d.toLocaleDateString('es-AR', { day:'numeric', month:'short', year:'numeric' }) + ' · ' +
           d.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' })
  }

  const inputStyle = { width:'100%', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:12, padding:'10px 14px', color:'var(--text-primary)', fontSize:13, fontFamily:"'DM Sans',sans-serif", marginBottom:8, outline:'none' }

  return (
    <div className="page page-enter">
      <PalaceFrame />
      <PageHeader title="Tablón" subtitle="Anuncios y votaciones del edificio" />
      <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap:12 }}>

        {/* Botón crear */}
        {!creando ? (
          <button onClick={() => setCreando(true)} style={{ width:'100%', padding:'14px', borderRadius:999, background:'var(--gold-faint)', border:'1px dashed rgba(224,176,94,0.35)', color:'var(--gold)', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <Plus size={16} strokeWidth={2}/> Nuevo publicación
          </button>
        ) : (
          <Card style={{ padding:'18px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <SectionLabel>Nueva publicación</SectionLabel>
              <button onClick={() => setCreando(false)} style={{ color:'var(--text-faint)', padding:4 }}><X size={16}/></button>
            </div>

            {/* Tipo */}
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              {TIPOS.map(t => (
                <button key={t.id} onClick={() => setTipo(t.id)} style={{ flex:1, padding:'10px 6px', borderRadius:12, background: tipo===t.id?`${t.color}10`:'var(--cat-bg)', border:`1px solid ${tipo===t.id?t.color+'35':'var(--cat-border)'}`, borderTop:`2px solid ${tipo===t.id?t.color+'60':'transparent'}`, transition:'all 0.2s', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <t.Icon size={14} color={tipo===t.id?t.color:'var(--text-muted)'} strokeWidth={1.5}/>
                  <p style={{ fontSize:9.5, fontWeight:700, color:tipo===t.id?t.color:'var(--text-muted)', letterSpacing:'0.05em' }}>{t.label}</p>
                </button>
              ))}
            </div>

            <input value={titulo} onChange={e=>setTitulo(e.target.value)} placeholder="Título *" style={inputStyle}/>
            <textarea value={contenido} onChange={e=>setContenido(e.target.value)} placeholder="Descripción (opcional)" rows={2} style={{ ...inputStyle, resize:'none', lineHeight:1.5 }}/>

            {/* Opciones de votación */}
            {tipo === 'votacion' && (
              <div style={{ marginBottom:8 }}>
                <p style={{ fontSize:9, letterSpacing:'0.15em', color:'var(--text-muted)', textTransform:'uppercase', fontWeight:600, marginBottom:8 }}>Opciones de voto *</p>
                {opciones.map((op, i) => (
                  <div key={i} style={{ display:'flex', gap:6, marginBottom:6 }}>
                    <input value={op} onChange={e => { const n=[...opciones]; n[i]=e.target.value; setOpciones(n) }} placeholder={`Opción ${i+1}`} style={{ ...inputStyle, marginBottom:0, flex:1 }}/>
                    {opciones.length > 2 && <button onClick={() => setOpciones(opciones.filter((_,j)=>j!==i))} style={{ color:'var(--red)', padding:'0 6px', flexShrink:0 }}><X size={14}/></button>}
                  </div>
                ))}
                {opciones.length < 5 && (
                  <button onClick={() => setOpciones([...opciones,''])} style={{ fontSize:11, color:'var(--gold)', fontWeight:600, padding:'4px 0', display:'flex', alignItems:'center', gap:4 }}>
                    <Plus size={12}/> Agregar opción
                  </button>
                )}
              </div>
            )}

            <p style={{ fontSize:9, letterSpacing:'0.15em', color:'var(--text-muted)', textTransform:'uppercase', fontWeight:600, marginBottom:8 }}>
              Fecha y hora de publicación <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(opcional, si no elegís se publica ahora)</span>
            </p>
            <input type="datetime-local" value={fechaHora} onChange={e=>setFechaHora(e.target.value)} style={{ ...inputStyle, colorScheme:'dark' }}/>

            {errorForm && <p style={{ color:'#f87171', fontSize:11, fontWeight:600, marginBottom:8 }}>{errorForm}</p>}

            <PrimaryBtn onClick={publicar} disabled={saving || !titulo.trim()}>
              {saving ? 'Publicando...' : (fechaHora && new Date(fechaHora) > new Date()) ? 'Programar publicación' : 'Publicar ahora'}
            </PrimaryBtn>
          </Card>
        )}

        <OrnamentLine opacity={0.08}/>
        <SectionLabel style={{ marginBottom:4 }}>{anuncios.length} publicaciones</SectionLabel>

        {loading && [1,2].map(i=>(
          <div key={i} style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:16, padding:'14px 16px' }}>
            <div className="skeleton" style={{ height:12, width:'60%', marginBottom:8 }}/>
            <div className="skeleton" style={{ height:10, width:'80%' }}/>
          </div>
        ))}

        {!loading && errorCarga && (
          <Card style={{ textAlign:'center', padding:'32px' }}>
            <p style={{ fontSize:13, color:'var(--red)', fontWeight:600 }}>{errorCarga}</p>
            <button onClick={fetchAnuncios} style={{ marginTop:12, fontSize:12, fontWeight:700, color:'#E0B05E', padding:'8px 18px', background:'rgba(224,176,94,0.1)', borderRadius:999 }}>Reintentar</button>
          </Card>
        )}

        {!loading && !errorCarga && anuncios.length===0 && (
          <Card style={{ textAlign:'center', padding:'32px' }}>
            <p style={{ fontSize:13, color:'var(--text-faint)' }}>Sin publicaciones todavía</p>
          </Card>
        )}

        {!loading && anuncios.map(a => {
          const color = PRIORIDAD_COLOR[a.tipo] || PRIORIDAD_COLOR[a.prioridad] || '#E0B05E'
          const TipoIcon = TIPOS.find(t=>t.id===a.tipo)?.Icon || Megaphone
          const programado = a.fecha_publicacion && new Date(a.fecha_publicacion) > new Date()
          return (
            <AccentCard key={a.id} accentColor={`${color}50`}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6, flexWrap:'wrap' }}>
                    <TipoIcon size={12} color={color} strokeWidth={1.8}/>
                    <span style={{ fontSize:8.5, fontWeight:700, color, letterSpacing:'0.08em', textTransform:'uppercase' }}>{TIPOS.find(t=>t.id===a.tipo)?.label || 'Aviso'}</span>
                    {programado && <span style={{ fontSize:8, fontWeight:700, color:'#fbbf24', background:'rgba(251,191,36,0.1)', border:'1px solid rgba(251,191,36,0.25)', borderRadius:999, padding:'2px 8px', letterSpacing:'0.05em', textTransform:'uppercase' }}>Programado</span>}
                    <span style={{ fontSize:8.5, color:'var(--text-faint)', marginLeft:'auto' }}>{formatFechaHora(a.fecha_publicacion || a.created_at)}</span>
                  </div>
                  <p style={{ fontSize:13, color:'var(--text-primary)', fontWeight:700, marginBottom:4 }}>{a.titulo}</p>
                  {a.contenido && <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.5, marginBottom:4 }}>{a.contenido}</p>}
                  {a.tipo==='votacion' && a.opciones_votacion && (
                    <div style={{ marginTop:6, display:'flex', flexWrap:'wrap', gap:4 }}>
                      {a.opciones_votacion.map((op,i) => (
                        <span key={i} style={{ fontSize:9.5, padding:'3px 10px', borderRadius:999, background:'rgba(96,165,250,0.08)', border:'1px solid rgba(96,165,250,0.2)', color:'rgba(96,165,250,0.7)', fontWeight:600 }}>{op}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => eliminar(a.id)} style={{ padding:'4px', color:'rgba(248,113,113,0.35)', flexShrink:0, marginLeft:8 }}>
                  <Trash2 size={13} strokeWidth={1.8}/>
                </button>
              </div>
            </AccentCard>
          )
        })}
      </div>
    </div>
  )
}
