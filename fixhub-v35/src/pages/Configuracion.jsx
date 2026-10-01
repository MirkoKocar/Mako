import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'
import { PalaceFrame, PageHeader, Card, AccentCard, OrnamentLine, SectionLabel } from '../components/Palace'
import { Sun, Moon, Bell, BellOff, LogOut, DoorOpen, Trash2 } from 'lucide-react'

const SESSION_KEY = 'fixhub_session_v9'

export default function Configuracion({ user, onLogout, onSalirDelEdificio }) {
  const navigate = useNavigate()
  const [lightMode, setLightMode]   = useState(() => localStorage.getItem('fixhub_lightmode') === 'true')
  const [brightness, setBrightness] = useState(() => parseInt(localStorage.getItem('fixhub_brightness') || '100'))
  const [notifOn, setNotifOn]       = useState(() => localStorage.getItem('fixhub_notif') !== 'false')

  useEffect(() => {
    document.body.classList.toggle('light-mode', lightMode)
    localStorage.setItem('fixhub_lightmode', lightMode)
  }, [lightMode])

  useEffect(() => {
    document.body.style.filter = `brightness(${brightness}%)`
    localStorage.setItem('fixhub_brightness', brightness)
  }, [brightness])

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY)
    document.body.classList.remove('light-mode')
    document.body.style.filter = ''
    onLogout()
  }

  const [borrando, setBorrando]     = useState(false)
  const [confirmTxt, setConfirmTxt] = useState('')
  const [eliminando, setEliminando] = useState(false)
  const [errorElim, setErrorElim]   = useState('')

  const eliminarCuenta = async () => {
    if (confirmTxt.trim().toUpperCase() !== 'ELIMINAR') { setErrorElim('Escribí la palabra ELIMINAR para confirmar.'); return }
    setEliminando(true); setErrorElim('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/eliminar-cuenta', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ confirmacion: 'ELIMINAR' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErrorElim(data.error || 'No se pudo eliminar la cuenta.'); setEliminando(false); return }
      localStorage.clear()
      await supabase.auth.signOut().catch(() => {})
      window.location.replace('/')
    } catch (e) {
      setErrorElim('No se pudo conectar. Revisá tu conexión e intentá de nuevo.'); setEliminando(false)
    }
  }

  const rolLabel = { vecino:'Vecino', admin:'Administrador', proveedor:'Proveedor' }[user.rol]

  return (
    <div className="page page-enter">
      <PalaceFrame />
      <PageHeader title="Configuración" subtitle="Ajustes de la app" onBack={() => navigate(-1)} />

      <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap:12 }}>

        {/* Perfil */}
        <Card style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{
            width:48, height:48, borderRadius:14,
            background:'var(--gold-faint)',
            border:'1px solid rgba(224,176,94,0.25)',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
          }}>
            <span className="font-serif" style={{ fontSize:22, color:'var(--gold)' }}>{user.nombre?.charAt(0)||'?'}</span>
          </div>
          <div>
            <p style={{ fontSize:14, color:'var(--text-primary)', fontWeight:700 }}>{user.nombre}</p>
            <p style={{ fontSize:10, color:'var(--text-muted)', marginTop:2, fontWeight:500 }}>
              {rolLabel} · {user.edificio?.nombre}
              {user.departamento ? ` · Depto ${user.departamento}` : ''}
            </p>
          </div>
        </Card>

        <OrnamentLine opacity={0.1}/>
        <SectionLabel style={{ marginBottom:4 }}>Apariencia</SectionLabel>

        {/* Toggle modo claro/oscuro */}
        <AccentCard accentColor={lightMode?'rgba(176,123,42,0.5)':'rgba(96,165,250,0.4)'}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              {lightMode
                ? <Sun  size={16} color="var(--gold)"  strokeWidth={1.5}/>
                : <Moon size={16} color="var(--blue)"  strokeWidth={1.5}/>
              }
              <div>
                <p style={{ fontSize:13, color:'var(--text-primary)', fontWeight:700 }}>
                  Modo {lightMode ? 'claro' : 'oscuro'}
                </p>
                <p style={{ fontSize:10, color:'var(--text-muted)', marginTop:2, fontWeight:500 }}>Cambiar tema visual</p>
              </div>
            </div>
            <button
              onClick={() => setLightMode(!lightMode)}
              style={{
                width:46, height:26, borderRadius:999,
                background:lightMode?'rgba(176,123,42,0.55)':'rgba(96,165,250,0.4)',
                border:'none', position:'relative', transition:'background 0.3s', flexShrink:0
              }}
            >
              <div style={{
                width:20, height:20, borderRadius:'50%', background:'#FFFFFF',
                position:'absolute', top:3, left:lightMode?23:3,
                transition:'left 0.3s', boxShadow:'0 2px 6px rgba(0,0,0,0.25)'
              }}/>
            </button>
          </div>
        </AccentCard>

        {/* Brillo */}
        <Card>
          <p style={{ fontSize:13, color:'var(--text-primary)', fontWeight:700, marginBottom:12 }}>Brillo</p>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600 }}>50%</span>
            <input
              type="range" min="50" max="105" value={brightness}
              onChange={e => setBrightness(e.target.value)}
              style={{ flex:1, accentColor:'var(--gold)', cursor:'pointer' }}
            />
            <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600 }}>105%</span>
          </div>
          <p style={{ fontSize:10, color:'var(--text-faint)', marginTop:8, textAlign:'center' }}>Actual: {brightness}%</p>
        </Card>

        <OrnamentLine opacity={0.1}/>
        <SectionLabel style={{ marginBottom:4 }}>Notificaciones</SectionLabel>

        <AccentCard accentColor={notifOn?'rgba(52,211,153,0.4)':'var(--border-strong)'}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              {notifOn
                ? <Bell    size={16} color="var(--green)" strokeWidth={1.5}/>
                : <BellOff size={16} color="var(--text-muted)" strokeWidth={1.5}/>
              }
              <div>
                <p style={{ fontSize:13, color:'var(--text-primary)', fontWeight:700 }}>Notificaciones</p>
                <p style={{ fontSize:10, color:'var(--text-muted)', marginTop:2, fontWeight:500 }}>Alertas de cambios de estado</p>
              </div>
            </div>
            <button
              onClick={() => { setNotifOn(!notifOn); localStorage.setItem('fixhub_notif', !notifOn) }}
              style={{
                width:46, height:26, borderRadius:999,
                background:notifOn?'rgba(52,211,153,0.55)':'rgba(248,113,113,0.35)',
                border:'none', position:'relative', transition:'background 0.3s', flexShrink:0
              }}
            >
              <div style={{
                width:20, height:20, borderRadius:'50%', background:'#FFFFFF',
                position:'absolute', top:3, left:notifOn?23:3,
                transition:'left 0.3s', boxShadow:'0 2px 6px rgba(0,0,0,0.25)'
              }}/>
            </button>
          </div>
        </AccentCard>

        <OrnamentLine opacity={0.1}/>
        <SectionLabel style={{ marginBottom:4 }}>Información</SectionLabel>

        <Card>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              ['Versión', 'MAKO v11.0'],
              ['Edificio', user.edificio?.nombre],
              ['Código',   user.edificio?.codigo_acceso],
            ].map(([label,val]) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between' }}>
                <p style={{ fontSize:12, color:'var(--text-muted)',    fontWeight:500 }}>{label}</p>
                <p style={{ fontSize:12, color:'var(--text-secondary)', fontWeight:600 }}>{val}</p>
              </div>
            ))}
          </div>
        </Card>

        {onSalirDelEdificio && (
          <button
            onClick={onSalirDelEdificio}
            style={{
              width:'100%', background:'transparent',
              border:'1px solid var(--border)', borderRadius:999,
              padding:'14px', fontSize:13, fontWeight:600, color:'var(--text-secondary)',
              marginTop:8, display:'flex', alignItems:'center', justifyContent:'center', gap:8
            }}
          >
            <DoorOpen size={15} strokeWidth={2}/> Salir del edificio
          </button>
        )}

        <button
          onClick={handleLogout}
          style={{
            width:'100%', background:'rgba(248,113,113,0.07)',
            border:'1px solid rgba(248,113,113,0.25)', borderRadius:999,
            padding:'14px', fontSize:14, fontWeight:700, color:'var(--red)',
            marginTop:8, display:'flex', alignItems:'center', justifyContent:'center', gap:8
          }}
        >
          <LogOut size={16} strokeWidth={2}/> Cerrar sesión
        </button>

        {!borrando ? (
          <button onClick={() => { setBorrando(true); setErrorElim(''); setConfirmTxt('') }} style={{ width:'100%', marginTop:6, padding:'12px', fontSize:12, color:'var(--text-faint)', display:'flex', alignItems:'center', justifyContent:'center', gap:7, textDecoration:'underline' }}>
            <Trash2 size={13}/> Eliminar mi cuenta
          </button>
        ) : (
          <div style={{ marginTop:8, padding:'16px', borderRadius:16, background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.3)' }}>
            <p style={{ fontSize:13, fontWeight:800, color:'#f87171' }}>Eliminar mi cuenta</p>
            <p style={{ fontSize:11.5, color:'var(--text-secondary)', lineHeight:1.55, marginTop:6 }}>
              {user.rol === 'vecino' && 'Se borran tu acceso, tus mensajes, reservas, votos y tu teléfono. Tus reclamos quedan en el historial del consorcio (los necesita para justificar gastos), pero sin tu nombre ni contacto.'}
              {user.rol === 'proveedor' && 'Se borran tu acceso, tu teléfono y tu agenda. Los trabajos que hiciste quedan en el historial del consorcio para respaldar los gastos, con el nombre del proveedor.'}
              {user.rol === 'admin' && 'Se borra tu acceso de administrador. El edificio, sus vecinos y su historial NO se borran: otro administrador con el PIN del edificio puede seguir gestionándolo.'}
              {' '}Esta acción no se puede deshacer.
            </p>
            <input value={confirmTxt} onChange={e => { setConfirmTxt(e.target.value); setErrorElim('') }} placeholder="Escribí ELIMINAR para confirmar" autoCapitalize="characters"
              style={{ width:'100%', marginTop:10, background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:12, padding:'11px 14px', color:'var(--text-primary)', fontSize:14 }} />
            {errorElim && <p style={{ fontSize:11.5, color:'#f87171', fontWeight:600, marginTop:8 }}>{errorElim}</p>}
            <div style={{ display:'flex', gap:8, marginTop:10 }}>
              <button onClick={() => setBorrando(false)} disabled={eliminando} style={{ padding:'12px 16px', fontSize:12, color:'var(--text-muted)' }}>Cancelar</button>
              <button onClick={eliminarCuenta} disabled={eliminando || confirmTxt.trim().toUpperCase() !== 'ELIMINAR'} style={{ flex:1, padding:'12px', borderRadius:999, fontSize:13, fontWeight:800, background:'rgba(248,113,113,0.18)', border:'1px solid rgba(248,113,113,0.5)', color:'#f87171', opacity:(eliminando || confirmTxt.trim().toUpperCase() !== 'ELIMINAR') ? 0.5 : 1 }}>{eliminando ? 'Eliminando...' : 'Eliminar definitivamente'}</button>
            </div>
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'center', gap:18, marginTop:14 }}>
          <a href="/privacidad.html" target="_blank" rel="noopener" style={{ fontSize:10.5, color:'var(--text-faint)', textDecoration:'underline' }}>Privacidad</a>
          <a href="/terminos.html" target="_blank" rel="noopener" style={{ fontSize:10.5, color:'var(--text-faint)', textDecoration:'underline' }}>Términos</a>
        </div>

        <p style={{ textAlign:'center', fontSize:9, color:'var(--text-faint)', letterSpacing:'0.3em', textTransform:'uppercase', paddingBottom:8, marginTop:6 }}>— MAKO · 2026 —</p>
      </div>
    </div>
  )
}
