import React, { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { BottomNav, PalaceFrame, NavLockContext } from './components/Palace'
import { registerFCMToken, onForegroundMessage } from './firebase'
import { supabase } from './supabase'

import Welcome              from './pages/Welcome'
import Auth                 from './pages/Auth'
import Login                from './pages/Login'
import NotifBanner from './components/NotifBanner'

const Onboarding         = lazy(() => import('./pages/Onboarding'))
const HomeVecino         = lazy(() => import('./pages/HomeVecino'))
const HomeAdmin          = lazy(() => import('./pages/HomeAdmin'))
const HomeProveedor      = lazy(() => import('./pages/HomeProveedor'))
const NuevoAviso         = lazy(() => import('./pages/NuevoAviso'))
const Avisos             = lazy(() => import('./pages/Avisos'))
const Chat               = lazy(() => import('./pages/Chat'))
const TablonVecino       = lazy(() => import('./pages/TablonVecino'))
const ChatAdmin          = lazy(() => import('./pages/ChatAdmin'))
const Configuracion      = lazy(() => import('./pages/Configuracion'))
const AdminAvisos        = lazy(() => import('./pages/AdminAvisos'))
const AdminProveedores   = lazy(() => import('./pages/AdminProveedores'))
const AdminStats         = lazy(() => import('./pages/AdminStats'))
const AdminTablon        = lazy(() => import('./pages/AdminTablon'))
const AdminMensajesPrivados = lazy(() => import('./pages/AdminMensajesPrivados'))
const AdminRecordatorios = lazy(() => import('./pages/AdminRecordatorios'))
const AdminVecinos       = lazy(() => import('./pages/AdminVecinos'))
const AdminEmergencias   = lazy(() => import('./pages/AdminEmergencias'))
const AdminMas           = lazy(() => import('./pages/AdminMas'))
const ActivityLog        = lazy(() => import('./pages/ActivityLog'))
const ProveedorAgenda    = lazy(() => import('./pages/ProveedorAgenda'))
const ProveedorHistorial = lazy(() => import('./pages/ProveedorHistorial'))
const InfraDashboard     = lazy(() => import('./pages/InfraDashboard'))
const AdminEdificios     = lazy(() => import('./pages/AdminEdificios'))

const SESSION_KEY    = 'fixhub_session_v9'
const ONBOARDING_KEY = 'fixhub_onboarding_seen_v2' // { "rol:edificioId": true }

function haVistoGuia(rol, edificioId) {
  if (!edificioId) return false
  try {
    const vistos = JSON.parse(localStorage.getItem(ONBOARDING_KEY)) || {}
    return !!vistos[`${rol}:${edificioId}`]
  } catch { return false }
}
function marcarGuiaVista(rol, edificioId) {
  if (!edificioId) return
  try {
    const vistos = JSON.parse(localStorage.getItem(ONBOARDING_KEY)) || {}
    vistos[`${rol}:${edificioId}`] = true
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(vistos))
  } catch {}
}

function PageLoader() {
  return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ display:'flex', gap:6 }}>
        {[0,1,2].map(i=>(
          <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:'rgba(224,176,94,0.6)', animation:`bounce 1.1s ${i*0.18}s ease-in-out infinite` }}/>
        ))}
      </div>
      <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-10px)}}`}</style>
    </div>
  )
}

function AppShell({ rol, children }) {
  const [navLock, setNavLockState] = useState({ locked:false, onBlockedAttempt:null })
  const setNavLock = (v) => setNavLockState(v)
  const navigate = useNavigate()
  const location = useLocation()

  // Cada vez que se abre la app (se monta el shell por primera vez en esta
  // sesión), forzar que arranque en Inicio — nunca en la última pantalla en
  // la que se había quedado (ej: Ajustes).
  useEffect(() => {
    if (location.pathname !== '/') navigate('/', { replace: true })
  }, [])

  return (
    <NavLockContext.Provider value={{ ...navLock, setNavLock }}>
      <div className="scroll-content">
        <PalaceFrame />
        <NotifBanner />
        <Suspense fallback={<PageLoader />}>{children}</Suspense>
      </div>
      <BottomNav rol={rol} />
    </NavLockContext.Provider>
  )
}

// ¿El navegador soporta la API de notificaciones? (iOS Safari sin instalar como PWA, por ej., no la soporta)
const NOTIF_SUPPORTED = typeof window !== 'undefined' && 'Notification' in window

function AppInner() {
  const [showWelcome, setShowWelcome]   = useState(true)
  const [infraMode, setInfraMode]       = useState(false)
  const [authUser, setAuthUser]         = useState(null)      // usuario real (email/contraseña) de Supabase Auth
  const [authChecked, setAuthChecked]   = useState(false)      // ya sabemos si hay sesión de auth o no
  const [buscandoPerfil, setBuscandoPerfil] = useState(false)  // reconstruyendo la sesión desde perfiles
  const [session, setSession]           = useState(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
  })
  const [showOnboarding, setShowOnboarding]     = useState(false)
  const [showEdificios, setShowEdificios]         = useState(false)
  const [mensajeBanner, setMensajeBanner]         = useState(null) // toast de mensaje entrante en primer plano

  // Chequear si ya hay una sesión real de Supabase Auth (email/contraseña) guardada
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthUser(data?.session?.user || null)
      setAuthChecked(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setAuthUser(sess?.user || null)
    })
    return () => sub?.subscription?.unsubscribe()
  }, [])

  // Si hay cuenta real pero todavía no tenemos el edificio/rol vinculado (session
  // vacía), buscamos en 'perfiles' si esta cuenta ya lo vinculó antes. Si lo
  // encontramos, reconstruimos la sesión sola, sin volver a pedir el código.
  useEffect(() => {
    const buscar = async () => {
      if (!authUser || session) return
      setBuscandoPerfil(true)
      try {
        const { data: perfil, error: eP } = await supabase.from('perfiles').select('*').eq('auth_user_id', authUser.id).limit(1)
        if (eP) throw eP
        const p = perfil?.[0]
        if (!p) { setBuscandoPerfil(false); return } // cuenta nueva, todavía no vinculó edificio — va a Login

        if (p.rol === 'admin') {
          const { data: edificios, error: eE } = await supabase.from('edificios').select('*').eq('pin_admin', p.pin).order('nombre')
          if (eE) throw eE
          const activos = (edificios || []).filter(e => e.estado_pago !== 'moroso')
          if (activos.length) {
            const nueva = { rol:'admin', pin:p.pin, edificios: activos, edificio:activos[0], nombre:'Administrador', id:activos[0].id }
            localStorage.setItem(SESSION_KEY, JSON.stringify(nueva)); setSession(nueva)
          }
          // Si todos sus edificios están morosos, no reconstruimos la sesión:
          // la persona vuelve al login de código y ahí ve el mensaje explicando por qué.
        } else {
          const tabla = p.rol === 'vecino' ? 'vecinos' : 'proveedores'
          const [{ data: persona, error: ePer }, { data: edificio, error: eEd }] = await Promise.all([
            supabase.from(tabla).select('*').eq('id', p.persona_id).limit(1),
            supabase.from('edificios').select('*').eq('id', p.edificio_id).limit(1),
          ])
          if (ePer || eEd) throw (ePer || eEd)
          if (persona?.[0] && edificio?.[0] && edificio[0].estado_pago !== 'moroso') {
            const nueva = { ...persona[0], edificio: edificio[0], rol: p.rol }
            localStorage.setItem(SESSION_KEY, JSON.stringify(nueva)); setSession(nueva)
          }
          // Si el edificio está moroso, no reconstruimos la sesión — vuelve
          // al login de código, donde el mensaje explica por qué.
        }
      } catch (err) {
        // Si falla la reconstrucción de la sesión (sin conexión, error del
        // servidor, etc.) no dejamos a la persona colgada: la mandamos al
        // login de código para que pueda reintentar en vez de ver una
        // pantalla de carga infinita.
        console.error('Error reconstruyendo sesión:', err)
      }
      setBuscandoPerfil(false)
    }
    buscar()
  }, [authUser?.id])

  // Estado REAL del permiso de notificaciones del navegador (no un flag guardado
  // que se puede desincronizar). Se re-chequea al volver a la pestaña por si el
  // usuario lo cambió desde la configuración del sistema.
  const [permState, setPermState] = useState(() => NOTIF_SUPPORTED ? Notification.permission : 'unsupported')

  useEffect(() => {
    if (!NOTIF_SUPPORTED) return
    const check = () => setPermState(Notification.permission)
    check()
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  // Apenas hay sesión, disparamos UNA vez el cartel NATIVO del sistema/navegador
  // (Notification.requestPermission()) — el mismo cartel gris que usa cualquier
  // app (ej. B612). No dibujamos nada propio encima: es el sistema el que lo muestra.
  useEffect(() => {
    if (session && NOTIF_SUPPORTED && Notification.permission === 'default') {
      Notification.requestPermission().then(setPermState)
    }
  }, [session?.id])

  // Registrar el token FCM automáticamente en cuanto haya sesión + permiso concedido
  useEffect(() => {
    if (session && permState === 'granted') {
      registerFCMToken(session.id, session.rol, session.edificio?.id)
    }
  }, [session?.id, session?.edificio?.id, permState])

  useEffect(() => {
    const light      = localStorage.getItem('fixhub_lightmode') === 'true'
    const brightness = localStorage.getItem('fixhub_brightness') || '100'
    if (light) document.body.classList.add('light-mode')
    document.body.style.filter = `brightness(${brightness}%)`
  }, [])

  // Escuchar notificaciones en primer plano
  useEffect(() => {
    const unsub = onForegroundMessage(payload => {
      const { title, body } = payload.notification || {}
      setMensajeBanner(`${title}: ${body}`)
      setTimeout(() => setMensajeBanner(null), 5000)
    })
    return () => unsub?.()
  }, [])

  const handleLogin = (userData) => {
    if (userData._infra) { setInfraMode(true); return }
    localStorage.setItem(SESSION_KEY, JSON.stringify(userData))
    setSession(userData)
    if (userData.rol === 'admin') setShowEdificios(true)
    else if (!haVistoGuia(userData.rol, userData.edificio?.id)) setShowOnboarding(true)
  }

  const handleLogout = async () => {
    localStorage.removeItem(SESSION_KEY)
    await supabase.auth.signOut()
    setSession(null); setInfraMode(false)
    setShowEdificios(false); setShowWelcome(true)
  }

  // Volver a la pantalla de código SIN cerrar la sesión real (email/contraseña).
  // Útil para quien prueba varios roles con la misma cuenta — un vecino común
  // nunca ve este botón, así que no le cambia nada.
  const handleSalirDelEdificio = () => {
    localStorage.removeItem(SESSION_KEY)
    setSession(null)
    setShowEdificios(false)
    setShowOnboarding(false)
  }

  const handleSelectEdificio = (edif) => {
    const updated = { ...session, edificio: edif }
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated))
    setSession(updated)
    setShowEdificios(false)
    if (!haVistoGuia('admin', edif.id)) setShowOnboarding(true)
  }

  const MensajeBannerEl = mensajeBanner ? (
    <div style={{ position:'fixed', top:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:430, background:'#11203B', borderBottom:'1px solid rgba(224,176,94,0.2)', padding:'12px 20px', zIndex:9998, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:7, height:7, borderRadius:'50%', background:'#E0B05E', boxShadow:'0 0 8px rgba(224,176,94,0.6)' }}/>
        <p style={{ fontSize:12, color:'#F2E0C9', fontWeight:500 }}>{mensajeBanner}</p>
      </div>
      <button onClick={() => setMensajeBanner(null)} style={{ color:'rgba(180,190,205,0.4)', fontSize:16 }}>✕</button>
    </div>
  ) : null

  // INFRA
  if (infraMode) return (
    <div className="scroll-content">
      <Suspense fallback={<PageLoader />}>
        <InfraDashboard onExit={() => { setInfraMode(false); setShowWelcome(true) }} />
      </Suspense>
    </div>
  )

  // Welcome
  if (showWelcome) return (
    <div className="scroll-content">
      <Welcome onContinue={() => setShowWelcome(false)} />
    </div>
  )

  // Esperando saber si hay sesión real guardada (evita parpadeo)
  if (!authChecked) return (
    <div className="scroll-content" style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh' }}>
      <PageLoader />
    </div>
  )

  // Cuenta real (email/contraseña)
  if (!authUser) return (
    <div className="scroll-content">
      <Auth onAuthed={setAuthUser} />
    </div>
  )

  // Ya hay cuenta, pero todavía estamos viendo si ya vinculó un edificio antes
  if (buscandoPerfil) return (
    <div className="scroll-content" style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh' }}>
      <PageLoader />
    </div>
  )

  // Cuenta real sin edificio vinculado todavía → pedir el código (una sola vez)
  if (!session) return (
    <div className="scroll-content">
      <PalaceFrame />
      <Login onLogin={handleLogin} authUserId={authUser.id} />
    </div>
  )

  // Admin — pantalla de edificios
  if (session.rol === 'admin' && showEdificios) return (
    <div className="scroll-content">
      <Suspense fallback={<PageLoader />}>
        <AdminEdificios session={session} onSelectEdificio={handleSelectEdificio} onLogout={handleLogout} onSalirDelEdificio={handleSalirDelEdificio} />
      </Suspense>
    </div>
  )

  // Guía obligatoria (primera vez en este edificio, según el rol)
  if (showOnboarding) return (
    <div className="scroll-content">
      <Suspense fallback={<PageLoader />}>
        <Onboarding rol={session?.rol} onFinish={() => { marcarGuiaVista(session?.rol, session?.edificio?.id); setShowOnboarding(false) }} />
      </Suspense>
    </div>
  )

  const { rol } = session

  if (rol === 'vecino') return (
    <>
      {MensajeBannerEl}
      <AppShell rol="vecino">
        <Routes>
          <Route path="/"           element={<HomeVecino user={session} />} />
          <Route path="/aviso"      element={<NuevoAviso user={session} />} />
          <Route path="/avisos"     element={<Avisos user={session} />} />
          <Route path="/tablon"     element={<TablonVecino user={session} />} />
          <Route path="/chat-admin" element={<ChatAdmin user={session} />} />
          <Route path="/chat/:avisoId" element={<Chat user={session} />} />
          <Route path="/config"     element={<Configuracion user={session} onLogout={handleLogout} onSalirDelEdificio={handleSalirDelEdificio} />} />
          <Route path="/guia"       element={<Onboarding rol="vecino" onFinish={() => window.history.back()} />} />
          <Route path="*"           element={<Navigate to="/" />} />
        </Routes>
      </AppShell>
    </>
  )

  if (rol === 'admin') return (
    <>
      {MensajeBannerEl}
      <AppShell rol="admin">
        <Routes>
          <Route path="/"                    element={<HomeAdmin user={session} onCambiarEdificio={() => setShowEdificios(true)} />} />
          <Route path="/admin/avisos"        element={<AdminAvisos user={session} />} />
          <Route path="/admin/proveedores"   element={<AdminProveedores user={session} />} />
          <Route path="/admin/stats"         element={<AdminStats user={session} />} />
          <Route path="/admin/tablon"        element={<AdminTablon user={session} />} />
          <Route path="/admin/mensajes"      element={<AdminMensajesPrivados user={session} />} />
          <Route path="/admin/recordatorios" element={<AdminRecordatorios user={session} />} />
          <Route path="/admin/vecinos"       element={<AdminVecinos user={session} />} />
          <Route path="/admin/emergencias"   element={<AdminEmergencias user={session} />} />
          <Route path="/admin/actividad"     element={<ActivityLog user={session} />} />
          <Route path="/admin/mas"           element={<AdminMas user={session} />} />
          <Route path="/admin/aviso/:avisoId" element={<Chat user={session} />} />
          <Route path="/config"              element={<Configuracion user={session} onLogout={handleLogout} onSalirDelEdificio={handleSalirDelEdificio} />} />
          <Route path="/guia"                element={<Onboarding rol="admin" onFinish={() => window.history.back()} />} />
          <Route path="*"                    element={<Navigate to="/" />} />
        </Routes>
      </AppShell>
    </>
  )

  if (rol === 'proveedor') return (
    <>
      {MensajeBannerEl}
      <AppShell rol="proveedor">
        <Routes>
          <Route path="/"                      element={<HomeProveedor user={session} />} />
          <Route path="/proveedor/mensajes"    element={<HomeProveedor user={session} />} />
          <Route path="/proveedor/chat/:avisoId" element={<Chat user={session} />} />
          <Route path="/proveedor/agenda"      element={<ProveedorAgenda user={session} />} />
          <Route path="/proveedor/historial"   element={<ProveedorHistorial user={session} />} />
          <Route path="/config"                element={<Configuracion user={session} onLogout={handleLogout} onSalirDelEdificio={handleSalirDelEdificio} />} />
          <Route path="/guia"                  element={<Onboarding rol="proveedor" onFinish={() => window.history.back()} />} />
          <Route path="*"                      element={<Navigate to="/" />} />
        </Routes>
      </AppShell>
    </>
  )

  return <Navigate to="/" />
}

export default function App() {
  return <AppInner />
}
