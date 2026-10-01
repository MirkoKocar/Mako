import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, AccentCard, Card, OrnamentLine, BottomNav, SectionLabel, PrimaryBtn } from '../components/Palace'

const ESPECIALIDADES = ['Todos','Plomería','Electricidad','Gas','Ascensor','Limpieza','Seguridad','Estructura','Internet']

function DiamondRating({ valor }) {
  const stars = Math.max(1, Math.round((valor / 100) * 5))
  return (
    <div style={{display:'flex',gap:4,alignItems:'center'}}>
      {[1,2,3,4,5].map(i=>(
        <div key={i} style={{width:6,height:6,transform:'rotate(45deg)',background:i<=stars?'rgba(224,176,94,0.7)':'transparent',border:`1px solid ${i<=stars?'rgba(224,176,94,0.5)':'var(--border)'}`,transition:'all 0.2s'}}/>
      ))}
    </div>
  )
}

export default function Proveedores({ user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const categoriaFiltro = location.state?.categoria || 'Todos'
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [filtro, setFiltro] = useState(categoriaFiltro)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data, error } = await supabase.from('proveedores').select('*')
          .eq('edificio_id', user.edificio.id).order('ranking', { ascending: false })
        if (error) throw error
        setProveedores(data || [])
      } catch (err) {
        setErrorCarga('No se pudo cargar la lista de proveedores. Revisá tu conexión.')
      }
      setLoading(false)
    }
    fetch()
  }, [user.edificio.id])

  const filtrados = filtro === 'Todos' ? proveedores : proveedores.filter(p => p.especialidad === filtro)

  if (selected) return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title={selected.nombre} subtitle={selected.especialidad} onBack={() => setSelected(null)} />
      <div style={{padding:'0 20px',display:'flex',flexDirection:'column',gap:12}}>

        <div style={{textAlign:'center',padding:'6px 0 14px'}}>
          <span style={{fontSize:9,letterSpacing:'0.18em',textTransform:'uppercase',padding:'6px 18px',borderRadius:999,background:selected.disponible?'rgba(52,211,153,0.1)':'rgba(248,113,113,0.08)',border:`1px solid ${selected.disponible?'rgba(52,211,153,0.25)':'rgba(248,113,113,0.18)'}`,color:selected.disponible?'#34d399':'#f87171',fontWeight:700}}>
            {selected.disponible?'Disponible ahora':'No disponible'}
          </span>
        </div>

        <OrnamentLine opacity={0.1}/>

        <AccentCard accentColor="rgba(224,176,94,0.3)">
          <SectionLabel style={{marginBottom:6}}>Especialidad</SectionLabel>
          <p style={{fontSize:14,color:'var(--text-primary)',fontWeight:500}}>{selected.especialidad}</p>
        </AccentCard>

        <AccentCard accentColor="rgba(224,176,94,0.3)">
          <SectionLabel style={{marginBottom:10}}>Valoración</SectionLabel>
          <DiamondRating valor={selected.ranking || 50} />
        </AccentCard>

        {selected.descripcion && (
          <AccentCard accentColor="rgba(224,176,94,0.2)">
            <SectionLabel style={{marginBottom:8}}>Sobre el proveedor</SectionLabel>
            <p style={{fontSize:13,color:'rgba(180,190,205,0.5)',lineHeight:1.6}}>{selected.descripcion}</p>
          </AccentCard>
        )}

        <OrnamentLine opacity={0.08}/>

        {selected.disponible ? (
          <div>
            <p style={{fontSize:11,color:'var(--text-muted)',textAlign:'center',marginBottom:14,lineHeight:1.6}}>
              Para contactar a {selected.nombre.split(' ')[0]}, completá primero un aviso. Tu mensaje se enviará directamente desde el chat.
            </p>
            <PrimaryBtn onClick={() => navigate('/aviso', { state: { proveedor_id: selected.id, proveedor_nombre: selected.nombre, categoria: selected.especialidad } })}>
              Crear aviso y contactar
            </PrimaryBtn>
          </div>
        ) : (
          <div style={{textAlign:'center',padding:'14px',border:'1px solid rgba(248,113,113,0.12)',borderRadius:14}}>
            <p style={{fontSize:12,color:'rgba(248,113,113,0.45)',fontWeight:500}}>No disponible en este momento</p>
          </div>
        )}
      </div>

    </div>
  )

  return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title="Servicios" subtitle="Proveedores del edificio" />

      <div style={{padding:'0 20px 18px',display:'flex',gap:7,overflowX:'auto'}}>
        {ESPECIALIDADES.map(e=>(
          <button key={e} onClick={()=>setFiltro(e)} style={{padding:'6px 14px',borderRadius:999,whiteSpace:'nowrap',flexShrink:0,background:filtro===e?'rgba(224,176,94,0.14)':'transparent',border:`1px solid ${filtro===e?'rgba(224,176,94,0.35)':'var(--border)'}`,color:filtro===e?'#E0B05E':'var(--text-muted)',fontSize:10,fontWeight:700,letterSpacing:'0.06em',transition:'all 0.2s'}}>{e}</button>
        ))}
      </div>

      <div style={{padding:'0 20px',display:'flex',flexDirection:'column',gap:10}}>
        {loading ? (
          <p style={{textAlign:'center',color:'var(--text-faint)',fontSize:12,padding:'30px 0'}}>Cargando...</p>
        ) : errorCarga ? (
          <Card style={{textAlign:'center',padding:'28px'}}>
            <p style={{fontSize:12,color:'#f87171',fontWeight:600}}>{errorCarga}</p>
          </Card>
        ) : filtrados.length === 0 ? (
          <Card style={{textAlign:'center',padding:'28px'}}>
            <p style={{fontSize:12,color:'var(--text-faint)'}}>Sin proveedores en esta categoría</p>
          </Card>
        ) : filtrados.map((p, i) => (
          <AccentCard key={p.id} onClick={() => setSelected(p)}
            accentColor={p.disponible?'rgba(52,211,153,0.35)':'var(--border)'}>
            <div style={{display:'flex',gap:14,alignItems:'center'}}>
              <div style={{width:44,height:44,flexShrink:0,borderRadius:14,background:`linear-gradient(135deg,rgba(224,176,94,0.14),rgba(224,176,94,0.05))`,border:'1px solid rgba(224,176,94,0.15)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span className="font-serif" style={{fontSize:22,color:'rgba(224,176,94,0.7)'}}>{p.nombre.charAt(0)}</span>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                  <p style={{fontSize:14,color:'var(--text-primary)',fontWeight:700}}>{p.nombre}</p>
                  <span style={{fontSize:8.5,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:p.disponible?'rgba(52,211,153,0.7)':'rgba(248,113,113,0.5)'}}>{p.disponible?'Disponible':'Ocupado'}</span>
                </div>
                <p style={{fontSize:10,color:'var(--text-muted)',marginBottom:6,fontWeight:500}}>{p.especialidad}</p>
                <DiamondRating valor={p.ranking||50}/>
              </div>
            </div>
          </AccentCard>
        ))}
      </div>

    </div>
  )
}
