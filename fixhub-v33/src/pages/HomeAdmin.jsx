import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { PalaceFrame, OrnamentLine, DiamondRow, AccentCard, Card, StatusBadge, BottomNav, SectionLabel, SkeletonCard, AnimCounter } from '../components/Palace'

function ActionBtn({ label, sub, onClick }) {
  return (
    <div onClick={onClick} style={{
      background:'var(--bg-card)', border:'1px solid var(--border)',
      borderRadius:16, padding:'15px 15px', cursor:'pointer',
      display:'flex', flexDirection:'column', gap:3, position:'relative', overflow:'hidden'
    }}>
      <div style={{ position:'absolute', top:0, left:14, right:14, height:1, background:'linear-gradient(to right,transparent,rgba(224,176,94,0.18),transparent)' }}/>
      <p style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)', fontFamily:"'DM Sans',sans-serif", lineHeight:1.2 }}>{label}</p>
      {sub && <p style={{ fontSize:9.5, color:'var(--text-faint)', fontWeight:500 }}>{sub}</p>}
    </div>
  )
}

export default function HomeAdmin({ user, onCambiarEdificio }) {
  const navigate = useNavigate()
  const [avisos, setAvisos] = useState([])
  const [stats, setStats] = useState({ nuevo:0, en_curso:0, resuelto:0, promedioDias:0 })
  const [reservas, setReservas] = useState([])
  const [recordatorios, setRecordatorios] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const [avRes, resRes, recRes] = await Promise.all([
        supabase.from('avisos').select('*, vecinos(nombre,departamento)').eq('edificio_id', user.edificio.id).order('created_at', { ascending:false }),
        supabase.from('reservas').select('*').eq('edificio_id', user.edificio.id).eq('estado','confirmada').order('fecha', { ascending:true }).limit(3),
        supabase.from('recordatorios').select('*').eq('edificio_id', user.edificio.id).eq('completado',false).order('fecha', { ascending:true }).limit(3),
      ])
      const av = avRes.data || []
      const resueltos = av.filter(a => a.estado==='resuelto')
      let promedioDias = 0
      if (resueltos.length > 0) {
        const total = resueltos.reduce((s,a) => s+(new Date(a.updated_at||a.created_at)-new Date(a.created_at))/86400000, 0)
        promedioDias = Math.round(total/resueltos.length*10)/10
      }
      setAvisos(av.slice(0, 4))
      setStats({ nuevo:av.filter(a=>a.estado==='nuevo').length, en_curso:av.filter(a=>a.estado==='en_curso').length, resuelto:av.filter(a=>a.estado==='resuelto').length, promedioDias })
      setReservas(resRes.data || [])
      setRecordatorios(recRes.data || [])
      setLoading(false)
    }
    fetch()
  }, [user.edificio.id])

  return (
    <div className="page page-enter">
      <PalaceFrame />

      <div style={{ position:'relative', padding:'52px 20px 22px', textAlign:'center', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, bottom:0, background:'linear-gradient(180deg,rgba(251,191,36,0.04) 0%,transparent 100%)', borderBottomLeftRadius:'50% 20px', borderBottomRightRadius:'50% 20px', pointerEvents:'none' }}/>
        <p className="animate-ornament" style={{ fontSize:9, letterSpacing:'0.45em', color:'rgba(224,176,94,0.4)', marginBottom:8, fontWeight:600 }}>✦ ✦ ✦</p>
        <h1 className="font-serif" style={{ fontSize:24, color:'var(--text-primary)', lineHeight:1.1 }}>Panel de Administración</h1>
        <p style={{ fontSize:9.5, color:'var(--text-faint)', letterSpacing:'0.1em', marginTop:4, fontWeight:500 }}>{user.edificio.nombre}</p>
        {onCambiarEdificio && (
          <button onClick={onCambiarEdificio} style={{ marginTop:10, fontSize:9, color:'rgba(224,176,94,0.6)', letterSpacing:'0.1em', textTransform:'uppercase', fontWeight:700, padding:'6px 14px', border:'1px solid rgba(224,176,94,0.2)', borderRadius:999, display:'inline-flex', alignItems:'center', gap:5, background:'none' }}>
            ⊞ Mis Edificios
          </button>
        )}
        <div style={{ marginTop:12 }}><OrnamentLine /></div>
      </div>

      {/* Stats */}
      <div style={{ padding:'0 20px 18px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:9 }}>
          {[{label:'Nuevos',value:stats.nuevo,color:'#f87171'},{label:'En curso',value:stats.en_curso,color:'#fbbf24'},{label:'Resueltos',value:stats.resuelto,color:'#34d399'}].map(s=>(
            <div key={s.label} style={{ background:`${s.color}07`, border:`1px solid ${s.color}18`, borderTop:`3px solid ${s.color}45`, borderRadius:16, padding:'14px 8px', textAlign:'center' }}>
              <AnimCounter value={s.value} color={s.color} size={30} />
              <p style={{ fontSize:8, color:'var(--text-faint)', letterSpacing:'0.1em', marginTop:5, textTransform:'uppercase', fontWeight:700 }}>{s.label}</p>
            </div>
          ))}
        </div>
        {stats.promedioDias > 0 && (
          <p style={{ fontSize:10, color:'var(--text-faint)', textAlign:'center', marginTop:8, fontWeight:500 }}>
            Resolución promedio: <span style={{ color:'#E0B05E', fontWeight:700 }}>{stats.promedioDias} días</span>
          </p>
        )}
      </div>

      {/* Recordatorios */}
      {recordatorios.length > 0 && (
        <div style={{ padding:'0 20px 16px' }}>
          <SectionLabel style={{ marginBottom:9 }}>Mantenimiento pendiente</SectionLabel>
          {recordatorios.map(r => {
            const dias = Math.ceil((new Date(r.fecha)-new Date())/86400000)
            const color = dias<=7?'#f87171':dias<=30?'#fbbf24':'rgba(224,176,94,0.5)'
            return (
              <AccentCard key={r.id} accentColor={color} style={{ marginBottom:7 }} onClick={() => navigate('/admin/recordatorios')}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <p style={{ fontSize:12, color:'var(--text-secondary)', fontWeight:600 }}>{r.tipo}</p>
                  <span style={{ fontSize:9, color, fontWeight:700, letterSpacing:'0.06em' }}>{dias<=0?'VENCIDO':`${dias}d`}</span>
                </div>
              </AccentCard>
            )
          })}
        </div>
      )}

      {/* Acciones — tipográficas, sin iconos de colores */}
      <div style={{ padding:'0 20px 18px' }}>
        <SectionLabel style={{ marginBottom:11 }}>Gestión</SectionLabel>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
          <ActionBtn label="Todos los avisos" sub="Gestionar reportes" onClick={() => navigate('/admin/avisos')} />
          <ActionBtn label="Proveedores" sub="Rankings y perfiles" onClick={() => navigate('/admin/proveedores')} />
          <ActionBtn label="Métricas" sub="Estadísticas" onClick={() => navigate('/admin/stats')} />
          <ActionBtn label="Más opciones" sub="Tablón, votaciones..." onClick={() => navigate('/admin/mas')} />
        </div>
      </div>

      <div style={{ padding:'0 20px' }}><DiamondRow count={3} opacity={0.09} /></div>

      {/* Reservas */}
      {reservas.length > 0 && (
        <div style={{ padding:'14px 20px 0' }}>
          <SectionLabel style={{ marginBottom:9 }}>Reservas próximas</SectionLabel>
          {reservas.map(r => (
            <AccentCard key={r.id} accentColor="rgba(224,176,94,0.3)" style={{ marginBottom:7 }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <div>
                  <p style={{ fontSize:12, color:'var(--text-primary)', fontWeight:700 }}>{r.espacio_nombre}</p>
                  <p style={{ fontSize:10, color:'var(--text-muted)', marginTop:2, fontWeight:500 }}>Depto {r.departamento} · {r.hora}</p>
                </div>
                <p style={{ fontSize:10, color:'var(--text-muted)', fontWeight:500 }}>{new Date(r.fecha).toLocaleDateString('es-AR',{day:'2-digit',month:'short'})}</p>
              </div>
            </AccentCard>
          ))}
        </div>
      )}

      {/* Avisos recientes */}
      <div style={{ padding:'14px 20px 0' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <SectionLabel>Avisos recientes</SectionLabel>
          <button onClick={() => navigate('/admin/avisos')} style={{ fontSize:9, color:'rgba(224,176,94,0.5)', letterSpacing:'0.1em', textTransform:'uppercase', fontWeight:700 }}>Ver todos →</button>
        </div>
        {loading ? <div style={{ display:'flex',flexDirection:'column',gap:8 }}><SkeletonCard /><SkeletonCard lines={1}/></div> : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {avisos.map(a => (
              <AccentCard key={a.id} onClick={() => navigate(`/admin/aviso/${a.id}`)}
                accentColor={a.estado==='nuevo'?'#f87171':a.estado==='en_curso'?'#fbbf24':'#34d399'}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ flex:1, minWidth:0, marginRight:10 }}>
                    <p style={{ fontSize:13, color:'var(--text-primary)', fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.titulo}</p>
                    <p style={{ fontSize:9.5, color:'var(--text-muted)', marginTop:2, fontWeight:500 }}>{a.vecinos?.nombre} · Depto {a.vecinos?.departamento}</p>
                  </div>
                  <StatusBadge estado={a.estado} />
                </div>
              </AccentCard>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
