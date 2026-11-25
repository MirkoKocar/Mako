import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, Card, AccentCard, OrnamentLine, SectionLabel } from '../components/Palace'
import { ThumbsUp, Megaphone, Vote, Bell } from 'lucide-react'

const TIPO_CONFIG = {
  aviso:    { label:'Aviso',    color:'#E0B05E', Icon:Megaphone },
  votacion: { label:'Votación', color:'#60a5fa', Icon:Vote      },
  anuncio:  { label:'Urgente',  color:'#f87171', Icon:Bell      },
}

export default function TablonVecino({ user }) {
  const [anuncios, setAnuncios]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [reacciones, setReacciones] = useState({})
  const [conteos, setConteos]     = useState({})
  const [misVotos, setMisVotos]   = useState({})
  const [conteoVotos, setConteoVotos] = useState({})

  const cargar = async () => {
    setLoading(true); setErrorCarga('')
    try {
      const { data:anns, error: eAnn } = await supabase.from('anuncios').select('*')
        .eq('edificio_id', user.edificio.id)
        .lte('fecha_publicacion', new Date().toISOString())
        .order('fecha_publicacion', { ascending:false })
      if (eAnn) throw eAnn

      if (anns?.length) {
        const ids = anns.map(a=>a.id)
        const [{ data:reacs, error: eR }, { data:votes, error: eV }] = await Promise.all([
          supabase.from('reacciones_anuncio').select('anuncio_id,vecino_id').in('anuncio_id', ids),
          supabase.from('votos_tablon').select('anuncio_id,vecino_id,opcion').in('anuncio_id', ids),
        ])
        if (eR || eV) throw (eR || eV)
        const misR={}, cuentasR={}, misV={}, cuentasV={}
        reacs?.forEach(r => {
          cuentasR[r.anuncio_id]=(cuentasR[r.anuncio_id]||0)+1
          if (r.vecino_id===user.id) misR[r.anuncio_id]=true
        })
        votes?.forEach(v => {
          if (!cuentasV[v.anuncio_id]) cuentasV[v.anuncio_id]={}
          cuentasV[v.anuncio_id][v.opcion]=(cuentasV[v.anuncio_id][v.opcion]||0)+1
          if (v.vecino_id===user.id) misV[v.anuncio_id]=v.opcion
        })
        setReacciones(misR); setConteos(cuentasR)
        setMisVotos(misV);   setConteoVotos(cuentasV)
      }
      setAnuncios(anns||[])
    } catch (err) {
      setErrorCarga('No se pudo cargar el tablón. Revisá tu conexión.')
    }
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const toggleReaccion = async (anuncioId) => {
    const ya = reacciones[anuncioId]
    setReacciones(p=>({...p,[anuncioId]:!ya}))
    setConteos(p=>({...p,[anuncioId]:(p[anuncioId]||0)+(ya?-1:1)}))
    try {
      const { error } = ya
        ? await supabase.from('reacciones_anuncio').delete().eq('anuncio_id',anuncioId).eq('vecino_id',user.id)
        : await supabase.from('reacciones_anuncio').insert({ anuncio_id:anuncioId, vecino_id:user.id, tipo:'like' })
      if (error) throw error
    } catch (err) {
      // Revertimos el cambio visual si no se pudo guardar de verdad
      setReacciones(p=>({...p,[anuncioId]:ya}))
      setConteos(p=>({...p,[anuncioId]:(p[anuncioId]||0)+(ya?1:-1)}))
    }
  }

  const votar = async (anuncioId, opcion) => {
    if (misVotos[anuncioId]) return // ya votó
    setMisVotos(p=>({...p,[anuncioId]:opcion}))
    setConteoVotos(p=>({ ...p, [anuncioId]:{ ...(p[anuncioId]||{}), [opcion]:((p[anuncioId]?.[opcion])||0)+1 } }))
    try {
      const { error } = await supabase.from('votos_tablon').insert({ anuncio_id:anuncioId, vecino_id:user.id, opcion })
      if (error) throw error
    } catch (err) {
      // Revertir: el voto no se guardó, dejar que lo vuelva a intentar
      setMisVotos(p=>{ const c={...p}; delete c[anuncioId]; return c })
      setConteoVotos(p=>({ ...p, [anuncioId]:{ ...(p[anuncioId]||{}), [opcion]:Math.max(0,((p[anuncioId]?.[opcion])||1)-1) } }))
    }
  }

  const formatFechaHora = (iso) => {
    const d = new Date(iso)
    return d.toLocaleDateString('es-AR',{day:'numeric',month:'short'}) + ' ' +
           d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})
  }

  return (
    <div className="page page-enter">
      <PalaceFrame />
      <PageHeader title="Tablón" subtitle="Novedades del edificio"/>
      <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap:14 }}>

        {loading && [1,2].map(i=>(
          <div key={i} style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:18, padding:'18px 16px' }}>
            <div className="skeleton" style={{ height:12, width:'60%', marginBottom:10 }}/>
            <div className="skeleton" style={{ height:10, width:'80%' }}/>
          </div>
        ))}

        {!loading && errorCarga && (
          <Card style={{ textAlign:'center', padding:'40px 20px' }}>
            <p style={{ fontSize:13, color:'var(--red)', fontWeight:600 }}>{errorCarga}</p>
            <button onClick={cargar} style={{ marginTop:14, fontSize:12, fontWeight:700, color:'#E0B05E', padding:'8px 18px', background:'rgba(224,176,94,0.1)', borderRadius:999 }}>Reintentar</button>
          </Card>
        )}

        {!loading && !errorCarga && anuncios.length===0 && (
          <Card style={{ textAlign:'center', padding:'40px 20px' }}>
            <Megaphone size={32} color="var(--text-faint)" strokeWidth={1} style={{ margin:'0 auto 12px' }}/>
            <p style={{ fontSize:14, color:'var(--text-muted)', fontWeight:600 }}>Sin publicaciones por ahora</p>
            <p style={{ fontSize:11, color:'var(--text-faint)', marginTop:6 }}>El administrador publicará avisos y votaciones acá.</p>
          </Card>
        )}

        {!loading && anuncios.map(a => {
          const cfg = TIPO_CONFIG[a.tipo] || TIPO_CONFIG.aviso
          const reacciono = reacciones[a.id]
          const conteo    = conteos[a.id]||0
          const miVoto    = misVotos[a.id]
          const votosCuenta = conteoVotos[a.id]||{}
          const totalVotos  = Object.values(votosCuenta).reduce((s,v)=>s+v,0)

          return (
            <div key={a.id} style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderLeft:`3px solid ${cfg.color}60`, borderRadius:18, padding:'16px', position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:0, left:16, right:16, height:1, background:`linear-gradient(to right,transparent,${cfg.color}15,transparent)` }}/>

              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <cfg.Icon size={12} color={cfg.color} strokeWidth={1.8}/>
                  <span style={{ fontSize:8.5, fontWeight:700, color:cfg.color, letterSpacing:'0.08em', textTransform:'uppercase' }}>{cfg.label}</span>
                </div>
                <span style={{ fontSize:9, color:'var(--text-faint)' }}>{formatFechaHora(a.created_at)}</span>
              </div>

              <p style={{ fontSize:14, color:'var(--text-primary)', fontWeight:700, marginBottom:a.contenido?6:12, lineHeight:1.3 }}>{a.titulo}</p>
              {a.contenido && <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6, marginBottom:12 }}>{a.contenido}</p>}

              {/* Votación */}
              {a.tipo==='votacion' && a.opciones_votacion && (
                <div style={{ marginBottom:12 }}>
                  <OrnamentLine opacity={0.08}/>
                  <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:12 }}>
                    {a.opciones_votacion.map((op, i) => {
                      const votos = votosCuenta[op]||0
                      const pct   = totalVotos>0 ? Math.round((votos/totalVotos)*100) : 0
                      const elegida = miVoto===op
                      return (
                        <button key={i} onClick={() => votar(a.id, op)} disabled={!!miVoto}
                          style={{ width:'100%', padding:'11px 14px', borderRadius:12, textAlign:'left', background: elegida?'rgba(96,165,250,0.1)':'var(--cat-bg)', border:`1px solid ${elegida?'rgba(96,165,250,0.35)':'var(--cat-border)'}`, cursor:miVoto?'default':'pointer', position:'relative', overflow:'hidden' }}>
                          {miVoto && <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${pct}%`, background:'rgba(96,165,250,0.06)', transition:'width 0.5s' }}/>}
                          <div style={{ position:'relative', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <p style={{ fontSize:12, fontWeight:700, color:elegida?'#60a5fa':'var(--text-secondary)' }}>{op}</p>
                            {miVoto && <p style={{ fontSize:10, fontWeight:700, color:'rgba(96,165,250,0.6)' }}>{pct}% · {votos}</p>}
                          </div>
                        </button>
                      )
                    })}
                    {miVoto && <p style={{ fontSize:9.5, color:'var(--text-faint)', textAlign:'center', fontWeight:500 }}>Votaste: <span style={{ color:'#60a5fa', fontWeight:700 }}>{miVoto}</span> · {totalVotos} votos totales</p>}
                    {!miVoto && <p style={{ fontSize:9.5, color:'var(--text-faint)', textAlign:'center' }}>Tocá una opción para votar</p>}
                  </div>
                </div>
              )}

              <OrnamentLine opacity={0.06}/>

              {/* Acciones */}
              {a.tipo !== 'votacion' && (
                <div style={{ display:'flex', gap:10, marginTop:12 }}>
                  <button onClick={()=>toggleReaccion(a.id)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:999, background:reacciono?'rgba(52,211,153,0.1)':'var(--bg-card)', border:`1px solid ${reacciono?'rgba(52,211,153,0.35)':'var(--border)'}`, transition:'all 0.2s' }}>
                    <ThumbsUp size={14} color={reacciono?'#34d399':'var(--text-muted)'} strokeWidth={reacciono?2:1.5} fill={reacciono?'rgba(52,211,153,0.3)':'none'}/>
                    {conteo>0 && <span style={{ fontSize:11, fontWeight:700, color:reacciono?'#34d399':'var(--text-muted)' }}>{conteo}</span>}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
