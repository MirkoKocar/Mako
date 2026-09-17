import React, { useEffect, useState, useRef, useContext, createContext } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Home, Plus, ClipboardList, Wrench, Settings,
  LayoutDashboard, BarChart3, MoreHorizontal,
  MessageSquare, Calendar, History,
  ChevronLeft, X, Send, Check, Bell, Phone, LogOut,
  Building2, Users, Trash2, Shield, Sun, Moon, BellOff, Info, RefreshCw,
  Megaphone, CheckCheck, Camera, Image, Pencil, CornerUpLeft
} from 'lucide-react'

// Contexto para bloquear la navegación inferior mientras el usuario está
// en un paso crítico (ej: eligiendo proveedor de un aviso recién creado).
// Cualquier página puede tomar el lock con setNavLock({ locked:true, onBlockedAttempt: fn })
// y liberarlo con setNavLock({ locked:false, onBlockedAttempt:null }) al desmontarse.
export const NavLockContext = createContext({ locked:false, onBlockedAttempt:null, setNavLock:()=>{} })

export const PalaceFrame = () => (
  <div className="blob-container">
    <div className="blob blob-1"/>
    <div className="blob blob-2"/>
    <div className="blob blob-3"/>
    <div className="blob blob-4"/>
  </div>
)

export const OrnamentLine = ({opacity=0.15}) => (
  <div style={{display:'flex',alignItems:'center',gap:10,opacity}}>
    <div style={{height:'1.5px',flex:1,background:'linear-gradient(to right,transparent,var(--ornament-color,var(--gold-dim)))'}}/>
    <span className="font-serif" style={{fontSize:9,color:'var(--ornament-color,var(--gold))',fontWeight:700}}>✦</span>
    <div style={{height:'1.5px',flex:1,background:'linear-gradient(to left,transparent,var(--ornament-color,var(--gold-dim)))'}}/>
  </div>
)

export const SectionLabel = ({children,style={}}) => (
  <p style={{fontSize:9,letterSpacing:'0.22em',color:'var(--text-muted)',textTransform:'uppercase',fontWeight:600,...style}}>{children}</p>
)

export const Card = ({children,style={},onClick}) => (
  <div onClick={onClick} className="card-shadow" style={{
    background:'var(--bg-card)',border:'1px solid var(--border)',
    borderRadius:18,padding:'15px 16px',cursor:onClick?'pointer':'default',...style
  }}>{children}</div>
)

export const AccentCard = ({children,style={},onClick,accentColor='rgba(224,176,94,0.4)'}) => (
  <div onClick={onClick} className="card-shadow" style={{
    background:'var(--bg-card)',border:'1px solid var(--border)',
    borderLeft:`3px solid ${accentColor}`,borderRadius:16,padding:'13px 16px',
    cursor:onClick?'pointer':'default',...style
  }}>{children}</div>
)

export const PrimaryBtn = ({children,onClick,disabled,style={}}) => (
  <button onClick={onClick} disabled={disabled} style={{
    width:'100%',
    background:disabled?'rgba(224,176,94,0.25)':'linear-gradient(135deg,#E0B05E 0%,#C9923A 100%)',
    border:'none',borderRadius:999,padding:'15px',
    fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:700,
    color:'#0A1428',letterSpacing:'0.02em',
    boxShadow:disabled?'none':'0 4px 18px rgba(224,176,94,0.28)',
    opacity:disabled?0.6:1,...style
  }}>{children}</button>
)

export const GhostBtn = ({children,onClick,style={}}) => (
  <button onClick={onClick} style={{
    width:'100%',background:'var(--bg-card)',border:'1px solid var(--border-strong)',
    borderRadius:999,padding:'13px',
    fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:600,
    color:'var(--text-secondary)',...style
  }}>{children}</button>
)

export const StatusBadge = ({estado}) => {
  const map={nuevo:['#f87171','Nuevo'],en_curso:['#fbbf24','En curso'],resuelto:['#34d399','Resuelto']}
  const [c,label]=map[estado]||['#A0AEC0',estado]
  return <span style={{fontSize:9,fontWeight:700,padding:'4px 11px',borderRadius:999,background:`${c}18`,color:c,whiteSpace:'nowrap',letterSpacing:'0.04em',textTransform:'uppercase',border:`1px solid ${c}28`}}>{label}</span>
}

export const UrgenciaBadge = ({urgencia}) => {
  const map={baja:['#34d399','Baja'],media:['#fbbf24','Media'],alta:['#f87171','Alta']}
  const [c,label]=map[urgencia]||['#A0AEC0',urgencia]
  return <span style={{fontSize:9,fontWeight:700,padding:'4px 11px',borderRadius:999,background:`${c}12`,color:c,letterSpacing:'0.04em',textTransform:'uppercase'}}>{label}</span>
}

export const SkeletonCard = ({lines=2}) => (
  <div className="card-shadow" style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:18,padding:'15px 16px'}}>
    {Array.from({length:lines}).map((_,i)=>(
      <div key={i} className="skeleton" style={{height:12,width:i===0?'70%':'45%',marginBottom:i<lines-1?8:0}}/>
    ))}
  </div>
)

export const AnimCounter = ({value,color='var(--text-primary)',size=32}) => {
  const [display,setDisplay]=useState(0)
  useEffect(()=>{
    let start=0;const end=parseInt(value)||0
    if(!end){setDisplay(0);return}
    const step=Math.ceil(end/20)
    const timer=setInterval(()=>{start+=step;if(start>=end){setDisplay(end);clearInterval(timer)}else setDisplay(start)},40)
    return ()=>clearInterval(timer)
  },[value])
  return <p className="font-serif" style={{fontSize:size,color,lineHeight:1}}>{display}</p>
}

export const PageHeader = ({title,subtitle,onBack,extra}) => (
  <div style={{padding:'20px 20px 18px'}}>
    {onBack&&(
      <button onClick={onBack} style={{
        color:'var(--text-muted)',fontSize:11,
        letterSpacing:'0.06em',display:'inline-flex',alignItems:'center',gap:5,
        background:'var(--bg-card)',padding:'7px 14px',borderRadius:999,
        border:'1px solid var(--border)',fontWeight:600,marginBottom:22
      }}>
        <ChevronLeft size={13}/> Volver
      </button>
    )}
    <div style={{textAlign:'center',paddingTop:onBack?0:24}}>
      <p className="animate-ornament" style={{color:'var(--gold)',fontSize:9,letterSpacing:'0.5em',marginBottom:10,opacity:0.6}}>✦ ✦ ✦</p>
      <h1 className="font-serif" style={{fontSize:26,color:'var(--text-primary)',lineHeight:1.15,marginBottom:subtitle?4:0}}>{title}</h1>
      {subtitle&&<p style={{fontSize:10,color:'var(--text-muted)',letterSpacing:'0.07em',fontWeight:500}}>{subtitle}</p>}
      {extra&&<div style={{marginTop:10}}>{extra}</div>}
      <div style={{marginTop:12}}><OrnamentLine/></div>
    </div>
  </div>
)

export const ActionBtn = ({label,sub,onClick,accent=false}) => (
  <div onClick={onClick} style={{
    background:accent?'var(--gold-faint)':'var(--bg-card)',
    border:`1px solid ${accent?'var(--gold-dim)':'var(--border)'}`,
    borderRadius:16,padding:'16px 15px',cursor:'pointer',
    display:'flex',flexDirection:'column',gap:4,position:'relative',overflow:'hidden'
  }}>
    <p style={{fontSize:13,fontWeight:700,color:accent?'var(--gold)':'var(--text-primary)',lineHeight:1.2}}>{label}</p>
    {sub&&<p style={{fontSize:9.5,color:'var(--text-muted)',fontWeight:500}}>{sub}</p>}
  </div>
)

const navConfigs = {
  vecino:[
    {path:'/',         label:'Inicio',    Icon:Home},
    {path:'/aviso',    label:'Reportar',  Icon:Plus},
    {path:'/avisos',   label:'Avisos',    Icon:ClipboardList},
    {path:'/tablon',   label:'Tablón',    Icon:Megaphone},
    {path:'/config',   label:'Ajustes',   Icon:Settings},
  ],
  admin:[
    {path:'/',                  label:'Panel',    Icon:LayoutDashboard},
    {path:'/admin/avisos',      label:'Avisos',   Icon:ClipboardList},
    {path:'/admin/proveedores', label:'Servicios',Icon:Wrench},
    {path:'/admin/stats',       label:'Métricas', Icon:BarChart3},
    {path:'/admin/mas',         label:'Más',      Icon:MoreHorizontal},
  ],
  proveedor:[
    {path:'/',                    label:'Inicio',   Icon:Home},
    {path:'/proveedor/mensajes',  label:'Mensajes', Icon:MessageSquare},
    {path:'/proveedor/agenda',    label:'Agenda',   Icon:Calendar},
    {path:'/proveedor/historial', label:'Historial',Icon:History},
    {path:'/config',              label:'Ajustes',  Icon:Settings},
  ]
}

export const BottomNav = ({rol='vecino'}) => {
  const navigate=useNavigate()
  const location=useLocation()
  const { locked, onBlockedAttempt } = useContext(NavLockContext)
  const items=navConfigs[rol]||navConfigs.vecino
  const containerRef=useRef(null)
  const [indStyle,setIndStyle]=useState({left:0,width:0,opacity:0})
  const activeIndex=items.findIndex(i=>i.path===location.pathname)

  const handleNavClick = (path) => {
    if (locked) { onBlockedAttempt?.(); return }
    navigate(path)
  }

  useEffect(()=>{
    if(!containerRef.current||activeIndex===-1)return
    const btn=containerRef.current.children[activeIndex]
    if(btn) setIndStyle({left:btn.offsetLeft+btn.offsetWidth/2-18,width:36,opacity:1})
  },[activeIndex,location.pathname])

  return (
    <nav className="bottom-nav">
      <div style={{position:'absolute',top:0,left:0,right:0,height:3,overflow:'hidden'}}>
        <div style={{
          position:'absolute',top:0,height:'100%',borderRadius:999,
          background:'linear-gradient(90deg,#E0B05E,#C9923A)',
          boxShadow:'0 0 10px rgba(224,176,94,0.5)',
          transition:'left 0.38s cubic-bezier(.22,1,.36,1),width 0.38s',
          ...indStyle
        }}/>
      </div>
      <div ref={containerRef} style={{display:'flex',justifyContent:'space-around',alignItems:'center'}}>
        {items.map(({path,label,Icon})=>{
          const active=location.pathname===path
          return (
            <button key={path} onClick={()=>handleNavClick(path)} style={{
              display:'flex',flexDirection:'column',alignItems:'center',gap:3,
              padding:'4px 8px',minWidth:44,
              color: active?'var(--nav-active)':'var(--nav-icon)',
              opacity: (locked && !active) ? 0.4 : 1,
              transition:'opacity 0.2s',
            }}>
              <div style={{width:32,height:32,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',background:active?'rgba(224,176,94,0.12)':'transparent',transition:'background 0.2s'}}>
                <Icon size={17} strokeWidth={active?2:1.5}/>
              </div>
              <span style={{fontSize:7.5,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase'}}>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export const NotifBanner = ({message, onClose}) => (
  <div className="slide-down" style={{
    position:'sticky', top:0, zIndex:200, padding:'12px 20px',
    background:'var(--bg2)', backdropFilter:'blur(20px)',
    borderBottom:'1px solid var(--border-strong)',
    display:'flex', justifyContent:'space-between', alignItems:'center'
  }}>
    <div style={{display:'flex', alignItems:'center', gap:10}}>
      <div style={{width:8, height:8, borderRadius:'50%', background:'var(--gold)', flexShrink:0, boxShadow:'0 0 10px rgba(224,176,94,0.6)'}}/>
      <p style={{fontSize:13, color:'var(--text-primary)', fontWeight:500}}>{message}</p>
    </div>
    <button onClick={onClose} style={{color:'var(--text-muted)', padding:'0 4px'}}><X size={16}/></button>
  </div>
)

export const DiamondRow = ({count=3, opacity=0.18}) => (
  <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:10, opacity, margin:'4px 0'}}>
    {Array.from({length:count}).map((_,i)=>(
      <div key={i} style={{width:6, height:6, border:'1.5px solid var(--ornament-color,var(--gold))', transform:'rotate(45deg)'}}/>
    ))}
  </div>
)

export { Home, Plus, ClipboardList, Wrench, Settings, LayoutDashboard, BarChart3, MoreHorizontal, MessageSquare, Calendar, History, ChevronLeft, X, Send, Check, Bell, Phone, LogOut, Building2, Users, Trash2, Shield, Sun, Moon, BellOff, Info, RefreshCw, Megaphone, CheckCheck, Camera, Image, Pencil, CornerUpLeft }
