import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { Card, AccentCard, SectionLabel, PrimaryBtn, OrnamentLine } from '../components/Palace'
import { Bell, Send, Trash2, ChevronLeft, Plus, X } from 'lucide-react'

const ROLES = [
  { id:'vecino',    label:'Vecinos' },
  { id:'admin',     label:'Admins'  },
  { id:'proveedor', label:'Proveedores' },
]

export default function InfraNotificaciones({ onBack }) {
  const [edificios, setEdificios] = useState([])
  const [personas, setPersonas]   = useState([]) // vecinos+admins+proveedores, para elegir individualmente
  const [busquedaPersona, setBusquedaPersona] = useState('')
  const [programadas, setProgramadas] = useState([])
  const [creando, setCreando]     = useState(false)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [errorCarga, setErrorCarga] = useState('')
  const [errorForm, setErrorForm] = useState('')

  // Form
  const [titulo, setTitulo]         = useState('')
  const [cuerpo, setCuerpo]         = useState('')
  const [rolesElegidos, setRolesElegidos] = useState(['vecino','admin','proveedor'])
  const [edificiosElegidos, setEdificiosElegidos] = useState([]) // vacío = todos
  const [personasElegidas, setPersonasElegidas] = useState([])
  const [fechaHora, setFechaHora]   = useState('')
  const [scope, setScope]           = useState('todos') // 'todos' | 'edificios' | 'roles' | 'personas'

  useEffect(() => {
    const fetch = async () => {
      setLoading(true); setErrorCarga('')
      try {
        const [{ data:edifs, error:e1 }, { data:prog, error:e2 }, { data:vecs, error:e3 }, { data:provs, error:e4 }] = await Promise.all([
          supabase.from('edificios').select('id,nombre').order('nombre'),
          supabase.from('notificaciones_programadas').select('*').order('programada_para', { ascending:false }).limit(20),
          supabase.from('vecinos').select('id,nombre,departamento,edificio_id'),
          supabase.from('proveedores').select('id,nombre,especialidad,edificio_id'),
        ])
        if (e1 || e2 || e3 || e4) throw (e1 || e2 || e3 || e4)
        setEdificios(edifs||[])
        setProgramadas(prog||[])
        const listaPersonas = [
          ...(vecs||[]).map(v => ({ id:v.id, nombre:v.nombre, sub:`Depto ${v.departamento||'—'}`, rol:'vecino', edificio_id:v.edificio_id })),
          ...(provs||[]).map(p => ({ id:p.id, nombre:p.nombre, sub:p.especialidad||'Proveedor', rol:'proveedor', edificio_id:p.edificio_id })),
        ]
        setPersonas(listaPersonas)
      } catch (err) {
        setErrorCarga('No se pudo cargar el panel de notificaciones. Revisá tu conexión.')
      }
      setLoading(false)
    }
    fetch()
  }, [])

  const togglePersona = (id) => setPersonasElegidas(prev => prev.includes(id) ? prev.filter(p=>p!==id) : [...prev, id])

  const personasFiltradas = personas.filter(p => {
    if (busquedaPersona.trim() && !p.nombre.toLowerCase().includes(busquedaPersona.trim().toLowerCase())) return false
    if (edificiosElegidos.length && !edificiosElegidos.includes(p.edificio_id)) return false
    return true
  })

  const toggleRol = (rol) => setRolesElegidos(prev => prev.includes(rol) ? prev.filter(r=>r!==rol) : [...prev, rol])
  const toggleEdificio = (id) => setEdificiosElegidos(prev => prev.includes(id) ? prev.filter(e=>e!==id) : [...prev, id])

  const programar = async () => {
    if (!titulo.trim() || !cuerpo.trim() || !fechaHora) return
    if (scope==='personas' && personasElegidas.length===0) return
    setSaving(true); setErrorForm('')

    const payload = {
      titulo: titulo.trim(), cuerpo: cuerpo.trim(),
      roles: scope==='personas' ? null : (rolesElegidos.length > 0 ? rolesElegidos : null),
      edificio_ids: (scope==='edificios' && edificiosElegidos.length>0) ? edificiosElegidos : null,
      vecino_ids: scope==='personas' ? personasElegidas : null,
      programada_para: new Date(fechaHora).toISOString(),
    }

    try {
      const { data, error } = await supabase.from('notificaciones_programadas').insert(payload).select().single()
      if (error || !data) throw error || new Error('sin datos')
      setProgramadas(prev=>[data, ...prev])
      setTitulo(''); setCuerpo(''); setFechaHora('')
      setRolesElegidos(['vecino','admin','proveedor']); setEdificiosElegidos([]); setPersonasElegidas([]); setScope('todos')
      setCreando(false)
    } catch (err) {
      setErrorForm('No se pudo programar la notificación. Probá de nuevo.')
    }
    setSaving(false)
  }

  const eliminar = async (id) => {
    const anterior = programadas
    setProgramadas(prev=>prev.filter(p=>p.id!==id))
    try {
      const { error } = await supabase.from('notificaciones_programadas').delete().eq('id', id)
      if (error) throw error
    } catch (err) {
      setProgramadas(anterior)
    }
  }

  const formatFecha = (iso) => new Date(iso).toLocaleString('es-AR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })

  const inputStyle = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(217,203,176,0.14)', borderRadius:12, padding:'10px 14px', color:'#F2E0C9', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', marginBottom:8 }

  return (
    <div style={{ minHeight:'100vh', background:'#060D1C', fontFamily:"'DM Sans',sans-serif", padding:'48px 20px 40px' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={onBack} style={{ color:'rgba(180,190,205,0.4)', padding:4 }}><ChevronLeft size={20}/></button>
        <div>
          <p style={{ fontSize:8, letterSpacing:'0.5em', color:'rgba(224,176,94,0.35)', textTransform:'uppercase', fontWeight:700 }}>INFRA</p>
          <h1 className="font-serif" style={{ fontSize:20, color:'#F2E0C9' }}>Notificaciones</h1>
        </div>
      </div>

      {/* Botón crear */}
      {!creando ? (
        <button onClick={()=>setCreando(true)} style={{ width:'100%', padding:'14px', borderRadius:999, background:'rgba(224,176,94,0.07)', border:'1px dashed rgba(224,176,94,0.3)', color:'#E0B05E', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:16 }}>
          <Plus size={16}/> Nueva notificación programada
        </button>
      ) : (
        <div style={{ background:'#11203B', border:'1px solid rgba(224,176,94,0.15)', borderRadius:20, padding:'20px', marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <p style={{ fontSize:9, letterSpacing:'0.2em', color:'rgba(224,176,94,0.5)', textTransform:'uppercase', fontWeight:700 }}>Nueva notificación</p>
            <button onClick={()=>setCreando(false)} style={{ color:'rgba(180,190,205,0.3)', padding:4 }}><X size={16}/></button>
          </div>

          <input value={titulo} onChange={e=>setTitulo(e.target.value)} placeholder="Título *" style={inputStyle}/>
          <textarea value={cuerpo} onChange={e=>setCuerpo(e.target.value)} placeholder="Mensaje *" rows={3} style={{ ...inputStyle, resize:'none', lineHeight:1.5 }}/>

          {/* Fecha y hora */}
          <p style={{ fontSize:9, letterSpacing:'0.15em', color:'rgba(180,190,205,0.3)', textTransform:'uppercase', fontWeight:600, marginBottom:6 }}>Fecha y hora de envío *</p>
          <input type="datetime-local" value={fechaHora} onChange={e=>setFechaHora(e.target.value)}
            style={{ ...inputStyle, colorScheme:'dark' }}/>

          {/* Scope */}
          <p style={{ fontSize:9, letterSpacing:'0.15em', color:'rgba(180,190,205,0.3)', textTransform:'uppercase', fontWeight:600, marginBottom:8 }}>Enviar a</p>
          <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
            {[['todos','Todos'],['edificios','Por edificio'],['roles','Por rol'],['personas','Personas específicas']].map(([s,l])=>(
              <button key={s} onClick={()=>setScope(s)} style={{ flex:'1 1 40%', padding:'8px 4px', borderRadius:10, fontSize:10, fontWeight:700, background:scope===s?'rgba(224,176,94,0.12)':'transparent', border:`1px solid ${scope===s?'rgba(224,176,94,0.3)':'rgba(217,203,176,0.1)'}`, color:scope===s?'#E0B05E':'rgba(180,190,205,0.3)' }}>{l}</button>
            ))}
          </div>

          {/* Roles (no aplica cuando se eligen personas puntuales) */}
          {scope!=='personas' && (
            <>
              <p style={{ fontSize:9, letterSpacing:'0.15em', color:'rgba(180,190,205,0.3)', textTransform:'uppercase', fontWeight:600, marginBottom:8 }}>Roles</p>
              <div style={{ display:'flex', gap:6, marginBottom:12 }}>
                {ROLES.map(r=>(
                  <button key={r.id} onClick={()=>toggleRol(r.id)} style={{ flex:1, padding:'8px 4px', borderRadius:10, fontSize:10, fontWeight:700, background:rolesElegidos.includes(r.id)?'rgba(96,165,250,0.1)':'transparent', border:`1px solid ${rolesElegidos.includes(r.id)?'rgba(96,165,250,0.3)':'rgba(217,203,176,0.1)'}`, color:rolesElegidos.includes(r.id)?'#60a5fa':'rgba(180,190,205,0.3)' }}>{r.label}</button>
                ))}
              </div>
              {ROLES.find(r=>r.id==='admin') && rolesElegidos.includes('admin') && (
                <p style={{ fontSize:9.5, color:'rgba(180,190,205,0.25)', marginTop:-6, marginBottom:12, lineHeight:1.5 }}>
                  Nota: para admins, la unidad más específica es "por edificio" (cada edificio tiene un admin propio).
                </p>
              )}
            </>
          )}

          {/* Edificios: sirve como scope propio, o como filtro previo al elegir personas */}
          {(scope==='edificios' || scope==='personas') && (
            <>
              <p style={{ fontSize:9, letterSpacing:'0.15em', color:'rgba(180,190,205,0.3)', textTransform:'uppercase', fontWeight:600, marginBottom:8 }}>
                Edificios {scope==='personas' && <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(opcional, filtra la lista de personas)</span>}
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12, maxHeight:160, overflowY:'auto' }}>
                {edificios.map(e=>(
                  <button key={e.id} onClick={()=>toggleEdificio(e.id)} style={{ padding:'8px 12px', borderRadius:10, textAlign:'left', fontSize:12, fontWeight:600, background:edificiosElegidos.includes(e.id)?'rgba(52,211,153,0.08)':'transparent', border:`1px solid ${edificiosElegidos.includes(e.id)?'rgba(52,211,153,0.25)':'rgba(217,203,176,0.08)'}`, color:edificiosElegidos.includes(e.id)?'#34d399':'rgba(180,190,205,0.4)', flexShrink:0 }}>
                    {edificiosElegidos.includes(e.id)?'✓ ':''}{e.nombre}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Personas específicas: vecinos y proveedores (los admins se identifican por edificio) */}
          {scope==='personas' && (
            <>
              <p style={{ fontSize:9, letterSpacing:'0.15em', color:'rgba(180,190,205,0.3)', textTransform:'uppercase', fontWeight:600, marginBottom:8 }}>
                Elegí las personas ({personasElegidas.length} seleccionada{personasElegidas.length!==1?'s':''})
              </p>
              <input value={busquedaPersona} onChange={e=>setBusquedaPersona(e.target.value)} placeholder="Buscar por nombre..." style={inputStyle}/>
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12, maxHeight:240, overflowY:'auto' }}>
                {personasFiltradas.length===0 && (
                  <p style={{ fontSize:11, color:'rgba(180,190,205,0.25)', textAlign:'center', padding:'12px 0' }}>Sin resultados</p>
                )}
                {personasFiltradas.map(p=>(
                  <button key={`${p.rol}-${p.id}`} onClick={()=>togglePersona(p.id)} style={{ padding:'8px 12px', borderRadius:10, textAlign:'left', display:'flex', justifyContent:'space-between', alignItems:'center', background:personasElegidas.includes(p.id)?'rgba(96,165,250,0.08)':'transparent', border:`1px solid ${personasElegidas.includes(p.id)?'rgba(96,165,250,0.25)':'rgba(217,203,176,0.08)'}`, flexShrink:0 }}>
                    <span>
                      <span style={{ fontSize:12, fontWeight:600, color:personasElegidas.includes(p.id)?'#60a5fa':'rgba(180,190,205,0.5)' }}>{personasElegidas.includes(p.id)?'✓ ':''}{p.nombre}</span>
                      <span style={{ fontSize:9.5, color:'rgba(180,190,205,0.25)', display:'block', marginTop:1 }}>{p.sub} · {p.rol==='vecino'?'Vecino':'Proveedor'}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {errorForm && <p style={{ fontSize:11, color:'#f87171', fontWeight:600, marginBottom:10 }}>{errorForm}</p>}

          <button onClick={programar} disabled={saving||!titulo.trim()||!cuerpo.trim()||!fechaHora} style={{ width:'100%', background:(!titulo.trim()||!cuerpo.trim()||!fechaHora)?'rgba(224,176,94,0.1)':'linear-gradient(135deg,#E0B05E,#C9923A)', border:'none', borderRadius:999, padding:'14px', fontSize:14, fontWeight:700, color:(!titulo.trim()||!cuerpo.trim()||!fechaHora)?'rgba(180,190,205,0.3)':'#0A1428', display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity:saving?0.6:1 }}>
            <Send size={15} strokeWidth={2}/> {saving?'Programando...':'Programar envío'}
          </button>
        </div>
      )}

      {/* Lista */}
      <p style={{ fontSize:9, letterSpacing:'0.22em', color:'rgba(180,190,205,0.3)', textTransform:'uppercase', fontWeight:600, marginBottom:10 }}>
        {programadas.length} notificaciones programadas
      </p>

      {loading && <p style={{ textAlign:'center', color:'rgba(180,190,205,0.2)', fontSize:12, padding:'20px 0' }}>Cargando...</p>}
      {!loading && errorCarga && <p style={{ textAlign:'center', color:'#f87171', fontSize:12, fontWeight:600, padding:'20px 0' }}>{errorCarga}</p>}

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {programadas.map(p => (
          <div key={p.id} style={{ background:'rgba(255,255,255,0.02)', border:`1px solid ${p.enviada?'rgba(52,211,153,0.2)':'rgba(224,176,94,0.1)'}`, borderLeft:`3px solid ${p.enviada?'rgba(52,211,153,0.5)':'rgba(224,176,94,0.4)'}`, borderRadius:14, padding:'12px 14px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:12, color:'rgba(242,224,201,0.85)', fontWeight:700 }}>{p.titulo}</p>
                <p style={{ fontSize:10, color:'rgba(180,190,205,0.4)', marginTop:2, lineHeight:1.4 }}>{p.cuerpo}</p>
                <div style={{ display:'flex', gap:10, marginTop:6, flexWrap:'wrap' }}>
                  <span style={{ fontSize:9, color:p.enviada?'rgba(52,211,153,0.6)':'rgba(224,176,94,0.5)', fontWeight:700 }}>
                    {p.enviada?'✓ Enviada':'⏱ '+formatFecha(p.programada_para)}
                  </span>
                  {p.roles && <span style={{ fontSize:9, color:'rgba(96,165,250,0.5)', fontWeight:600 }}>{p.roles.join(', ')}</span>}
                  {p.vecino_ids?.length > 0 && <span style={{ fontSize:9, color:'rgba(224,176,94,0.5)', fontWeight:600 }}>{p.vecino_ids.length} persona{p.vecino_ids.length!==1?'s':''} específica{p.vecino_ids.length!==1?'s':''}</span>}
                  {p.edificio_ids?.length > 0 && <span style={{ fontSize:9, color:'rgba(52,211,153,0.5)', fontWeight:600 }}>{p.edificio_ids.length} edificio{p.edificio_ids.length!==1?'s':''}</span>}
                </div>
              </div>
              {!p.enviada && (
                <button onClick={()=>eliminar(p.id)} style={{ padding:4, color:'rgba(248,113,113,0.35)', flexShrink:0, marginLeft:8 }}>
                  <Trash2 size={13} strokeWidth={1.8}/>
                </button>
              )}
            </div>
          </div>
        ))}
        {!loading && programadas.length===0 && (
          <p style={{ textAlign:'center', color:'rgba(180,190,205,0.15)', fontSize:12, padding:'20px 0' }}>Sin notificaciones programadas todavía.</p>
        )}
      </div>
    </div>
  )
}
