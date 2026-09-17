import React from 'react'
import { useNavigate } from 'react-router-dom'
import { PalaceFrame, PageHeader, BottomNav } from '../components/Palace'
import { Megaphone, Vote, ClipboardCheck, Bell, Users, Phone, MapPin, Activity, BarChart3, Settings, ChevronRight, MessageCircle } from 'lucide-react'

const items = [
  { label:'Tablón de anuncios', sub:'Publicar comunicados', path:'/admin/tablon', Icon:Megaphone },
  { label:'Mensajes privados', sub:'Chats con vecinos', path:'/admin/mensajes', Icon:MessageCircle },
  { label:'Recordatorios', sub:'Mantenimiento preventivo', path:'/admin/recordatorios', Icon:Bell },
  { label:'Vecinos registrados', sub:'Listado del edificio', path:'/admin/vecinos', Icon:Users },
  { label:'Emergencias', sub:'Contactos del edificio', path:'/admin/emergencias', Icon:Phone },
  { label:'Actividad del edificio', sub:'Timeline cronológico', path:'/admin/actividad', Icon:Activity },
  { label:'Estadísticas', sub:'Métricas detalladas', path:'/admin/stats', Icon:BarChart3 },
  { label:'Configuración', sub:'Ajustes y sesión', path:'/config', Icon:Settings },
]

export default function AdminMas({ user }) {
  const navigate = useNavigate()
  return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title="Más opciones" subtitle="Herramientas de gestión" />
      <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap:8 }}>
        {items.map(({ label, sub, path, Icon }) => (
          <div key={path} onClick={() => navigate(path)} style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:16, padding:'14px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:14, position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:14, right:14, height:1, background:'linear-gradient(to right,transparent,rgba(224,176,94,0.1),transparent)' }}/>
            <div style={{ width:36, height:36, borderRadius:10, background:'var(--border)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Icon size={16} color="var(--border-strong)" strokeWidth={1.5}/>
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{label}</p>
              <p style={{ fontSize:10, color:'var(--text-faint)', marginTop:2, fontWeight:500 }}>{sub}</p>
            </div>
            <ChevronRight size={14} color="rgba(224,176,94,0.25)" strokeWidth={2}/>
          </div>
        ))}
      </div>
    </div>
  )
}
