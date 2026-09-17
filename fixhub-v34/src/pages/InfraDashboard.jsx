import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { supabase } from '../supabase'
import { Card, AccentCard, OrnamentLine, SectionLabel, AnimCounter, PrimaryBtn } from '../components/Palace'
import { Building2, Users, Wrench, ClipboardList, Trash2, LogOut, AlertCircle, RefreshCw } from 'lucide-react'
import InfraNotificaciones from './InfraNotificaciones'

function ConfirmModal({ message, onConfirm, onCancel }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return ReactDOM.createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onCancel() }} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.82)', backdropFilter:'blur(8px)', zIndex:99999, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#11203B', border:'1px solid rgba(248,113,113,0.3)', borderRadius:20, padding:28, width:'100%', maxWidth:360 }}>
        <p style={{ fontSize:15, color:'#F2E0C9', fontWeight:700, marginBottom:10, textAlign:'center' }}>¿Estás seguro?</p>
        <p style={{ fontSize:12, color:'rgba(200,210,225,0.7)', textAlign:'center', marginBottom:24, lineHeight:1.6 }}>{message}</p>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onCancel} style={{ flex:1, padding:'13px', borderRadius:999, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', color:'rgba(242,224,201,0.7)', fontWeight:600, fontSize:13, cursor:'pointer' }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex:1, padding:'13px', borderRadius:999, background:'rgba(248,113,113,0.15)', border:'1px solid rgba(248,113,113,0.4)', color:'#f87171', fontWeight:700, fontSize:13, cursor:'pointer' }}>Eliminar</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function InfraDashboard({ onExit }) {
  const [data, setData]             = useState({ edificios:[], vecinos:[], proveedores:[], avisos:[] })
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab]               = useState('overview')
  const [newEdificio, setNewEdificio] = useState({ nombre:'', direccion:'', codigo_acceso:'', pin_admin:'' })
  const [saving, setSaving]         = useState(false)
  const [msg, setMsg]               = useState({ text:'', ok:true })
  const [pendingDelete, setPendingDelete] = useState(null)

  const cambiarEstadoPago = async (edificioId, nuevoEstado) => {
    const anterior = data.edificios
    setData(prev => ({ ...prev, edificios: prev.edificios.map(e => e.id === edificioId ? { ...e, estado_pago: nuevoEstado } : e) }))
    try {
      const { error } = await supabase.from('edificios').update({ estado_pago: nuevoEstado }).eq('id', edificioId)
      if (error) throw error
    } catch (err) {
      setData(prev => ({ ...prev, edificios: anterior }))
      setMsg({ text:'No se pudo actualizar el estado de pago. Probá de nuevo.', ok:false })
    }
  }

  const fetchAll = async (silent=false) => {
    if (!silent) setLoading(true); else setRefreshing(true)
    const [edRes, vRes, pRes, avRes] = await Promise.all([
      supabase.from('edificios').select('*').order('created_at', { ascending:false }),
      supabase.from('vecinos').select('id, nombre, departamento, edificio_id, edificios(nombre)').order('created_at', { ascending:false }),
      supabase.from('proveedores').select('id, nombre, especialidad, disponible, ranking, edificio_id, edificios(nombre)').order('ranking', { ascending:false }),
      supabase.from('avisos').select('id, titulo, estado, edificio_id, vecino_id, proveedor_id, edificios(nombre), vecinos(nombre,departamento)').order('created_at', { ascending:false }).limit(200),
    ])
    setData({ edificios:edRes.data||[], vecinos:vRes.data||[], proveedores:pRes.data||[], avisos:avRes.data||[] })
    setLoading(false); setRefreshing(false)
  }

  useEffect(() => { fetchAll() }, [])

  const addEdificio = async () => {
    const nombre   = newEdificio.nombre.trim()
    const direccion= newEdificio.direccion.trim()
    const codigo   = newEdificio.codigo_acceso.trim().toUpperCase()
    const pin      = newEdificio.pin_admin.trim()
    if (!nombre || !codigo) { setMsg({ text:'Completá nombre y código de acceso.', ok:false }); return }
    if (pin && (pin.length !== 6 || !/^\d+$/.test(pin))) { setMsg({ text:'El PIN debe tener exactamente 6 dígitos numéricos.', ok:false }); return }
    setSaving(true); setMsg({ text:'', ok:true })
    const { data:ed, error } = await supabase.from('edificios').insert({ nombre, direccion, codigo_acceso:codigo, pin_admin:pin||null }).select().single()
    if (error) {
      const isDupe = error.code==='23505' || error.message?.includes('unique')
      setMsg({ text:isDupe?'Ese código ya existe.':'Error: '+error.message, ok:false })
      setSaving(false); return
    }
    await fetchAll(true)
    setNewEdificio({ nombre:'', direccion:'', codigo_acceso:'', pin_admin:'' })
    setMsg({ text:`"${ed.nombre}" agregado con código ${ed.codigo_acceso}.`, ok:true })
    setTimeout(() => setMsg({ text:'', ok:true }), 4000)
    setSaving(false)
  }

  const safeDelete    = (table, col, val)  => supabase.from(table).delete().eq(col, val).then(()=>{}).catch(()=>{})
  const safeDeleteIn  = (table, col, vals) => vals?.length ? supabase.from(table).delete().in(col, vals).then(()=>{}).catch(()=>{}) : Promise.resolve()

  const handleDelete = async () => {
    if (!pendingDelete) return
    const { type, id } = pendingDelete
    try {
      if (type === 'vecino') {
        const { data:av } = await supabase.from('avisos').select('id').eq('vecino_id', id)
        const ids = (av||[]).map(a=>a.id)
        await safeDeleteIn('mensajes','aviso_id', ids)
        await safeDeleteIn('avisos','id', ids)
        await safeDelete('mensajes','vecino_id', id)
        await safeDelete('visitas','vecino_id', id)
        await safeDelete('votos','vecino_id', id)
        await safeDelete('respuestas_encuesta','vecino_id', id)
        await supabase.from('vecinos').delete().eq('id', id)

      } else if (type === 'proveedor') {
        await safeDelete('mensajes','proveedor_id', id)
        await safeDelete('agenda_proveedor','proveedor_id', id)
        await supabase.from('avisos').update({ proveedor_id:null }).eq('proveedor_id', id)
        await supabase.from('proveedores').delete().eq('id', id)

      } else if (type === 'edificio') {
        const { data:avs  } = await supabase.from('avisos').select('id').eq('edificio_id', id)
        const { data:vecs } = await supabase.from('vecinos').select('id').eq('edificio_id', id)
        const { data:provs} = await supabase.from('proveedores').select('id').eq('edificio_id', id)
        const avisoIds  = (avs  ||[]).map(a=>a.id)
        const vecinoIds = (vecs ||[]).map(v=>v.id)
        const provIds   = (provs||[]).map(p=>p.id)
        await safeDeleteIn('mensajes','aviso_id',    avisoIds)
        await safeDeleteIn('mensajes','vecino_id',   vecinoIds)
        await safeDeleteIn('mensajes','proveedor_id',provIds)
        await safeDeleteIn('avisos','id', avisoIds)
        await safeDeleteIn('votos','vecino_id', vecinoIds)
        await safeDeleteIn('respuestas_encuesta','vecino_id', vecinoIds)
        await safeDeleteIn('visitas','vecino_id', vecinoIds)
        await safeDeleteIn('agenda_proveedor','proveedor_id', provIds)
        await safeDelete('anuncios','edificio_id', id)
        await safeDelete('recordatorios','edificio_id', id)
        await safeDelete('emergencias','edificio_id', id)
        await safeDelete('votaciones','edificio_id', id)
        await safeDelete('encuestas','edificio_id', id)
        await safeDelete('visitas','edificio_id', id)
        await safeDelete('agenda_proveedor','edificio_id', id)
        await supabase.from('proveedores').delete().eq('edificio_id', id)
        await supabase.from('vecinos').delete().eq('edificio_id', id)
        const { error:finalError } = await supabase.from('edificios').delete().eq('id', id)
        if (finalError) throw new Error(finalError.message)

      } else if (type === 'aviso') {
        await safeDelete('mensajes','aviso_id', id)
        await supabase.from('avisos').delete().eq('id', id)
      }
      await fetchAll(true)
      setPendingDelete(null)
    } catch(err) {
      console.error('Error al eliminar:', err)
      setMsg({ text:`Error: ${err.message}`, ok:false })
      setPendingDelete(null)
    }
  }

  const avisosPorEdificio = data.edificios.map(e => ({
    id:e.id, nombre:e.nombre,
    total:    data.avisos.filter(a=>a.edificio_id===e.id).length,
    resueltos:data.avisos.filter(a=>a.edificio_id===e.id&&a.estado==='resuelto').length
  })).sort((a,b)=>b.total-a.total)

  const tabs = [
    { id:'overview',    label:'Resumen'     },
    { id:'edificios',   label:'Edificios'   },
    { id:'vecinos',     label:'Vecinos'     },
    { id:'proveedores', label:'Proveedores' },
    { id:'avisos',      label:'Avisos'      },
    { id:'stats',       label:'Stats'       },
    { id:'notificaciones', label:'Notifs'     },
  ]

  const inputStyle = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(217,203,176,0.14)', borderRadius:12, padding:'11px 14px', color:'#F2E0C9', fontSize:13, fontFamily:"'DM Sans',sans-serif", marginBottom:8, outline:'none' }
  const estadoColor = { nuevo:'#f87171', en_curso:'#fbbf24', resuelto:'#34d399' }

  return (
    <div style={{ minHeight:'100vh', background:'#060D1C', fontFamily:"'DM Sans',sans-serif", position:'relative' }}>
      {pendingDelete && <ConfirmModal message={`Vas a eliminar "${pendingDelete.nombre}". Esta acción no se puede deshacer.`} onConfirm={handleDelete} onCancel={() => setPendingDelete(null)} />}

      {/* Header */}
      <div style={{ padding:'48px 20px 16px', textAlign:'center', borderBottom:'1px solid rgba(224,176,94,0.1)' }}>
        <p style={{ fontSize:8, letterSpacing:'0.6em', color:'rgba(224,176,94,0.35)', textTransform:'uppercase', fontWeight:700, marginBottom:6 }}>MODO INFRAESTRUCTURA</p>
        <h1 className="font-serif" style={{ fontSize:22, color:'#F2E0C9' }}>Panel Global</h1>
        <p style={{ fontSize:9.5, color:'rgba(180,190,205,0.28)', marginTop:3 }}>Acceso total al sistema MAKO</p>
        <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:10 }}>
          <button onClick={() => fetchAll(true)} disabled={refreshing} style={{ fontSize:9, color:'rgba(52,211,153,0.55)', letterSpacing:'0.1em', textTransform:'uppercase', fontWeight:700, padding:'6px 14px', border:'1px solid rgba(52,211,153,0.2)', borderRadius:999, display:'inline-flex', alignItems:'center', gap:5, background:'none', opacity:refreshing?0.5:1 }}>
            <RefreshCw size={10} style={{ animation:refreshing?'spin 1s linear infinite':undefined }}/> {refreshing?'Actualizando...':'Actualizar'}
          </button>
          <button onClick={onExit} style={{ fontSize:9, color:'rgba(248,113,113,0.55)', letterSpacing:'0.1em', textTransform:'uppercase', fontWeight:700, padding:'6px 16px', border:'1px solid rgba(248,113,113,0.2)', borderRadius:999, display:'inline-flex', alignItems:'center', gap:5, background:'none' }}>
            <LogOut size={10}/> Salir INFRA
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid rgba(217,203,176,0.08)', overflowX:'auto' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex:'0 0 auto', padding:'12px 14px', fontSize:9, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', whiteSpace:'nowrap', color:tab===t.id?'#E0B05E':'rgba(180,190,205,0.3)', background:'none', border:'none', borderBottom:`2px solid ${tab===t.id?'#E0B05E':'transparent'}`, cursor:'pointer' }}>{t.label}</button>
        ))}
      </div>

      {msg.text && (
        <div style={{ margin:'12px 20px 0', display:'flex', alignItems:'center', gap:6 }}>
          {!msg.ok && <AlertCircle size={13} color="#f87171"/>}
          <p style={{ color:msg.ok?'#34d399':'#f87171', fontSize:11, fontWeight:600 }}>{msg.text}</p>
        </div>
      )}

      <div style={{ padding:'20px', paddingBottom:40 }}>
        {loading && (
          <div style={{ textAlign:'center', padding:'60px 0' }}>
            <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
              {[0,1,2].map(i=><div key={i} style={{ width:7, height:7, borderRadius:'50%', background:'rgba(224,176,94,0.5)', animation:`bounce 1.1s ${i*0.18}s ease-in-out infinite` }}/>)}
            </div>
          </div>
        )}

        {/* OVERVIEW */}
        {!loading && tab==='overview' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[{label:'Edificios',value:data.edificios.length,color:'#E0B05E'},{label:'Vecinos',value:data.vecinos.length,color:'#60a5fa'},{label:'Proveedores',value:data.proveedores.length,color:'#34d399'},{label:'Avisos',value:data.avisos.length,color:'#fbbf24'}].map(s=>(
                <div key={s.label} style={{ background:`${s.color}06`, border:`1px solid ${s.color}18`, borderTop:`3px solid ${s.color}40`, borderRadius:16, padding:'14px 12px', textAlign:'center' }}>
                  <AnimCounter value={s.value} color={s.color} size={30}/>
                  <p style={{ fontSize:8.5, color:'rgba(180,190,205,0.3)', marginTop:5, textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:700 }}>{s.label}</p>
                </div>
              ))}
            </div>
            <OrnamentLine opacity={0.1}/>
            <SectionLabel style={{ marginBottom:8 }}>Avisos recientes</SectionLabel>
            {data.avisos.slice(0,5).map(a=>(
              <AccentCard key={a.id} accentColor={estadoColor[a.estado]||'#E0B05E'} style={{ marginBottom:7 }}>
                <p style={{ fontSize:12, color:'rgba(242,224,201,0.85)', fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.titulo}</p>
                <p style={{ fontSize:9.5, color:'rgba(180,190,205,0.3)', marginTop:2 }}>{a.edificios?.nombre} · {a.vecinos?.nombre}</p>
              </AccentCard>
            ))}
            {data.avisos.length===0 && <p style={{ fontSize:12, color:'rgba(180,190,205,0.2)', textAlign:'center', padding:'20px 0' }}>Sin avisos todavía.</p>}
          </div>
        )}

        {/* EDIFICIOS */}
        {!loading && tab==='edificios' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <Card style={{ padding:'16px' }}>
              <SectionLabel style={{ marginBottom:12 }}>Agregar edificio</SectionLabel>
              <input value={newEdificio.nombre} onChange={e=>setNewEdificio(p=>({...p,nombre:e.target.value}))} placeholder="Nombre del edificio *" style={inputStyle}/>
              <input value={newEdificio.direccion} onChange={e=>setNewEdificio(p=>({...p,direccion:e.target.value}))} placeholder="Dirección (opcional)" style={inputStyle}/>
              <input value={newEdificio.codigo_acceso} onChange={e=>setNewEdificio(p=>({...p,codigo_acceso:e.target.value.toUpperCase()}))} placeholder="Código de acceso * (ej: EDIF02)" style={{...inputStyle,letterSpacing:'0.08em',textTransform:'uppercase'}}/>
              <input value={newEdificio.pin_admin} onChange={e=>setNewEdificio(p=>({...p,pin_admin:e.target.value.replace(/\D/g,'').slice(0,6)}))} placeholder="PIN de admin — 6 dígitos (opcional)" inputMode="numeric" style={{...inputStyle,letterSpacing:'0.2em'}}/>
              <PrimaryBtn onClick={addEdificio} disabled={saving}>{saving?'Guardando...':'Agregar edificio'}</PrimaryBtn>
            </Card>
            <OrnamentLine opacity={0.08}/>
            <SectionLabel style={{ marginBottom:8 }}>{data.edificios.length} edificio{data.edificios.length!==1?'s':''}</SectionLabel>
            {data.edificios.length===0 && <p style={{ fontSize:12, color:'rgba(180,190,205,0.2)', textAlign:'center', padding:'20px 0' }}>Sin edificios todavía.</p>}
            {data.edificios.map(e=>{
              const vc=data.vecinos.filter(v=>v.edificio_id===e.id).length
              const ac=data.avisos.filter(a=>a.edificio_id===e.id).length
              const estado = e.estado_pago || 'activo'
              const estadoColor = estado==='moroso' ? '#f87171' : estado==='prueba' ? '#fbbf24' : '#34d399'
              const estadoLabel = estado==='moroso' ? 'Moroso' : estado==='prueba' ? 'Prueba' : 'Activo'
              const siguiente = estado==='activo' ? 'moroso' : estado==='moroso' ? 'prueba' : 'activo'
              return (
                <AccentCard key={e.id} accentColor="rgba(224,176,94,0.3)">
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:13, color:'#F2E0C9', fontWeight:700 }}>{e.nombre}</p>
                      {e.direccion&&<p style={{ fontSize:10, color:'rgba(180,190,205,0.35)', marginTop:2 }}>{e.direccion}</p>}
                      <div style={{ display:'flex', gap:12, marginTop:6, flexWrap:'wrap', alignItems:'center' }}>
                        <span style={{ fontSize:9.5, color:'rgba(224,176,94,0.55)', fontWeight:700 }}>{vc} vecinos</span>
                        <span style={{ fontSize:9.5, color:'rgba(180,190,205,0.35)', fontWeight:700 }}>{ac} avisos</span>
                        <span style={{ fontSize:9.5, color:'rgba(224,176,94,0.7)', fontWeight:700, letterSpacing:'0.05em' }}>{e.codigo_acceso}</span>
                        {e.pin_admin&&<span style={{ fontSize:9.5, color:'rgba(52,211,153,0.5)', fontWeight:700 }}>PIN ••••••</span>}
                      </div>
                      <button onClick={()=>cambiarEstadoPago(e.id, siguiente)} title="Tocá para cambiar el estado de pago" style={{ marginTop:8, fontSize:9, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', padding:'4px 10px', borderRadius:999, background:`${estadoColor}18`, border:`1px solid ${estadoColor}55`, color:estadoColor }}>
                        ● {estadoLabel}
                      </button>
                    </div>
                    <button onClick={()=>setPendingDelete({type:'edificio',id:e.id,nombre:e.nombre})} style={{ padding:'6px', color:'rgba(248,113,113,0.4)', cursor:'pointer', flexShrink:0, marginLeft:8 }}>
                      <Trash2 size={14} strokeWidth={1.8}/>
                    </button>
                  </div>
                </AccentCard>
              )
            })}
          </div>
        )}

        {/* VECINOS */}
        {!loading && tab==='vecinos' && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <SectionLabel style={{ marginBottom:8 }}>{data.vecinos.length} vecinos</SectionLabel>
            {data.vecinos.length===0 && <p style={{ fontSize:12, color:'rgba(180,190,205,0.2)', textAlign:'center', padding:'20px 0' }}>Sin vecinos todavía.</p>}
            {data.vecinos.map(v=>(
              <AccentCard key={v.id} accentColor="rgba(96,165,250,0.3)">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <p style={{ fontSize:13, color:'rgba(242,224,201,0.88)', fontWeight:700 }}>{v.nombre}</p>
                    <p style={{ fontSize:9.5, color:'rgba(180,190,205,0.32)', marginTop:2 }}>{v.edificios?.nombre} · Depto {v.departamento}</p>
                  </div>
                  <button onClick={()=>setPendingDelete({type:'vecino',id:v.id,nombre:v.nombre})} style={{ padding:'6px', color:'rgba(248,113,113,0.4)', cursor:'pointer', flexShrink:0 }}>
                    <Trash2 size={14} strokeWidth={1.8}/>
                  </button>
                </div>
              </AccentCard>
            ))}
          </div>
        )}

        {/* PROVEEDORES */}
        {!loading && tab==='proveedores' && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <SectionLabel style={{ marginBottom:8 }}>{data.proveedores.length} proveedores</SectionLabel>
            {data.proveedores.length===0 && <p style={{ fontSize:12, color:'rgba(180,190,205,0.2)', textAlign:'center', padding:'20px 0' }}>Sin proveedores todavía.</p>}
            {data.proveedores.map(p=>(
              <AccentCard key={p.id} accentColor="rgba(52,211,153,0.3)">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <p style={{ fontSize:13, color:'rgba(242,224,201,0.88)', fontWeight:700 }}>{p.nombre}</p>
                    <p style={{ fontSize:9.5, color:'rgba(180,190,205,0.32)', marginTop:2 }}>{p.especialidad} · {p.edificios?.nombre}</p>
                    <p style={{ fontSize:9, color:'rgba(52,211,153,0.5)', marginTop:2, fontWeight:600 }}>Ranking {p.ranking} · <span style={{ color:p.disponible?'#34d399':'#f87171' }}>{p.disponible?'Disponible':'Ocupado'}</span></p>
                  </div>
                  <button onClick={()=>setPendingDelete({type:'proveedor',id:p.id,nombre:p.nombre})} style={{ padding:'6px', color:'rgba(248,113,113,0.4)', cursor:'pointer', flexShrink:0 }}>
                    <Trash2 size={14} strokeWidth={1.8}/>
                  </button>
                </div>
              </AccentCard>
            ))}
          </div>
        )}

        {/* AVISOS */}
        {!loading && tab==='avisos' && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.15)', borderRadius:12, padding:'10px 14px', marginBottom:4 }}>
              <p style={{ fontSize:10, color:'rgba(248,113,113,0.7)', fontWeight:600, lineHeight:1.5 }}>⚠ Borrar un aviso lo elimina para todos. Usalo solo para avisos de prueba.</p>
            </div>
            <SectionLabel style={{ marginBottom:8 }}>{data.avisos.length} avisos</SectionLabel>
            {data.avisos.length===0 && <p style={{ fontSize:12, color:'rgba(180,190,205,0.2)', textAlign:'center', padding:'20px 0' }}>Sin avisos todavía.</p>}
            {data.avisos.map(a=>(
              <AccentCard key={a.id} accentColor={estadoColor[a.estado]||'#E0B05E'}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ flex:1, minWidth:0, marginRight:10 }}>
                    <p style={{ fontSize:12, color:'rgba(242,224,201,0.88)', fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.titulo}</p>
                    <p style={{ fontSize:9.5, color:'rgba(180,190,205,0.32)', marginTop:2 }}>{a.edificios?.nombre} · {a.vecinos?.nombre}</p>
                    <span style={{ fontSize:8.5, fontWeight:700, color:estadoColor[a.estado]||'#E0B05E', textTransform:'uppercase', letterSpacing:'0.06em' }}>{a.estado?.replace('_',' ')}</span>
                  </div>
                  <button onClick={()=>setPendingDelete({type:'aviso',id:a.id,nombre:a.titulo})} style={{ padding:'6px', color:'rgba(248,113,113,0.4)', cursor:'pointer', flexShrink:0 }}>
                    <Trash2 size={14} strokeWidth={1.8}/>
                  </button>
                </div>
              </AccentCard>
            ))}
          </div>
        )}

        {/* NOTIFICACIONES */}
        {!loading && tab === 'notificaciones' && (
          <InfraNotificaciones onBack={() => setTab('overview')} />
        )}

        {/* STATS */}
        {!loading && tab==='stats' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <SectionLabel style={{ marginBottom:8 }}>Avisos por edificio</SectionLabel>
            {avisosPorEdificio.map(e=>(
              <Card key={e.nombre} style={{ padding:'12px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <p style={{ fontSize:12, color:'rgba(242,224,201,0.82)', fontWeight:700 }}>{e.nombre}</p>
                  <p style={{ fontSize:11, color:'rgba(180,190,205,0.4)', fontWeight:600 }}>{e.total} avisos</p>
                </div>
                <div style={{ height:5, background:'rgba(255,255,255,0.05)', borderRadius:999 }}>
                  <div style={{ width:`${Math.min((e.total/(avisosPorEdificio[0]?.total||1))*100,100)}%`, height:'100%', background:'linear-gradient(90deg,#E0B05E,#C9923A)', borderRadius:999, transition:'width 0.6s' }}/>
                </div>
                <p style={{ fontSize:9, color:'rgba(52,211,153,0.55)', marginTop:4, fontWeight:700 }}>{e.resueltos} resueltos · {Math.round((e.resueltos/(e.total||1))*100)}% tasa</p>
              </Card>
            ))}
            <OrnamentLine opacity={0.08}/>
            <Card>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {[['Total edificios',data.edificios.length],['Total vecinos',data.vecinos.length],['Total proveedores',data.proveedores.length],['Total avisos',data.avisos.length],['Resueltos',data.avisos.filter(a=>a.estado==='resuelto').length],['Pendientes',data.avisos.filter(a=>a.estado!=='resuelto').length],['Tasa resolución',`${data.avisos.length>0?Math.round((data.avisos.filter(a=>a.estado==='resuelto').length/data.avisos.length)*100):0}%`]].map(([label,val])=>(
                  <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <p style={{ fontSize:12, color:'rgba(180,190,205,0.38)', fontWeight:500 }}>{label}</p>
                    <p style={{ fontSize:13, color:'#E0B05E', fontWeight:700 }}>{val}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
      <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-10px)}} @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
