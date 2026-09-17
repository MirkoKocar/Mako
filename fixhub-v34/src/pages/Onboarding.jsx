import React, { useState } from 'react'

// ---------- Contenido de cada guía, uno por rol ----------

const PASOS_VECINO = [
  { icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    titulo: 'Bienvenido a MAKO', desc: 'La plataforma de gestión de tu edificio. Todo lo que necesitás, en un solo lugar.' },
  { icon: 'M12 4v16m8-8H4',
    titulo: 'Reportá un problema', desc: 'Tocá "Reportar" para crear un aviso cuando algo no funcione. La administración lo recibe al instante y le podés hacer seguimiento.' },
  { icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.3-3.9A7.9 7.9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    titulo: 'Chat en tiempo real', desc: 'Cada aviso tiene su propio chat con la administración y el proveedor asignado. También podés escribirle un mensaje privado al admin.' },
  { icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2',
    titulo: 'Tablón de novedades', desc: 'Enterate de comunicados, avisos importantes y novedades que publica la administración de tu edificio.' },
  { icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    titulo: 'Servicios y proveedores', desc: 'Consultá las categorías de servicios disponibles y los proveedores habilitados para tu edificio.' },
  { icon: 'M5 13l4 4L19 7',
    titulo: 'Todo bajo control', desc: 'Desde "Mis avisos" ves el historial completo con su estado: nuevo, en curso o resuelto. Cuando quieras volver a ver esta guía, la encontrás en tu inicio.' },
]

const PASOS_ADMIN = [
  { icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    titulo: 'Bienvenido a MAKO', desc: 'El panel de administración de tu edificio. Gestioná avisos, vecinos, proveedores y comunicados desde un solo lugar.' },
  { icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    titulo: 'Panel de estadísticas', desc: 'Mirá de un vistazo cómo está tu edificio: avisos abiertos, tiempos de resolución y actividad reciente.' },
  { icon: 'M12 4v16m8-8H4',
    titulo: 'Gestioná los avisos', desc: 'Recibí los reclamos de los vecinos, asignales un proveedor y seguí el estado de cada uno hasta que se resuelva.' },
  { icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-4-4',
    titulo: 'Vecinos y proveedores', desc: 'Administrá el padrón de vecinos del edificio y la lista de proveedores habilitados para trabajar en él.' },
  { icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.3-3.9A7.9 7.9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    titulo: 'Comunicación directa', desc: 'Respondé el chat de cada aviso, mandá mensajes privados a un vecino puntual y publicá comunicados en el tablón.' },
  { icon: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
    titulo: 'Recordatorios y emergencias', desc: 'Programá recordatorios (pagos, mantenimiento) y tené a mano un sector de emergencias para actuar rápido.' },
  { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    titulo: 'Registro de actividad', desc: 'Todo queda auditado: quién hizo qué y cuándo. Si administrás más de un edificio, podés cambiar entre ellos cuando quieras. Volvés a ver esta guía tocando "Ver guía" en tu inicio.' },
]

const PASOS_PROVEEDOR = [
  { icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    titulo: 'Bienvenido a MAKO', desc: 'Tu espacio de trabajo con los edificios que administrás. Recibí trabajos, coordiná visitas y llevá tu historial ordenado.' },
  { icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.3-3.9A7.9 7.9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    titulo: 'Recibí y respondé avisos', desc: 'Cuando te asignan un trabajo, te llega acá con su propio chat para coordinar directamente con el vecino y la administración.' },
  { icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    titulo: 'Tu agenda', desc: 'Organizá tus visitas y trabajos programados por fecha, para no perderte ninguno.' },
  { icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2',
    titulo: 'Historial de trabajos', desc: 'Todo lo que ya resolviste queda guardado, para que tengas registro de tu actividad en cada edificio.' },
  { icon: 'M5 13l4 4L19 7',
    titulo: 'Todo en un solo lugar', desc: 'Mensajes, agenda e historial sin cambiar de app. Cuando quieras repasar esta guía, la encontrás tocando "Ver guía" en tu inicio.' },
]

const CONTENIDO_ROL = { vecino: PASOS_VECINO, admin: PASOS_ADMIN, proveedor: PASOS_PROVEEDOR }

export default function Onboarding({ onFinish, rol = 'vecino' }) {
  const pasos = CONTENIDO_ROL[rol] || PASOS_VECINO
  const [paso, setPaso] = useState(0)
  const [dir, setDir] = useState(1) // 1 = avanzando, -1 = retrocediendo (para la animación de slide)
  const actual = pasos[paso]
  const esUltimo = paso === pasos.length - 1

  const ir = (nuevoPaso) => {
    setDir(nuevoPaso > paso ? 1 : -1)
    setPaso(nuevoPaso)
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '48px 32px 36px', background: '#0A1428', maxWidth: 430, margin: '0 auto', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        @keyframes onbSlideIn  { from { opacity:0; transform: translateX(var(--slideFrom)) scale(0.98); } to { opacity:1; transform: translateX(0) scale(1); } }
        @keyframes onbIconPop  { 0% { opacity:0; transform: scale(0.4) rotate(-8deg); } 60% { opacity:1; transform: scale(1.08) rotate(2deg); } 100% { opacity:1; transform: scale(1) rotate(0deg); } }
        @keyframes onbRingSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes onbFloat    { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes onbShimmer  { 0%,100% { opacity:0.35 } 50% { opacity:1 } }
      `}</style>

      {/* Fondo, brillo sutil centrado, sin manchas */}
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(circle at 50% 30%, rgba(255,255,255,0.03) 0%, transparent 55%)', pointerEvents:'none' }}/>

      <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', position:'relative', zIndex:1 }}>
        <button onClick={onFinish} style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px', borderRadius: 999, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>Saltar</button>
      </div>

      <div key={paso} style={{
        textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        position:'relative', zIndex:1, width:'100%',
        '--slideFrom': dir > 0 ? '26px' : '-26px',
        animation: 'onbSlideIn 0.45s cubic-bezier(.25,.8,.35,1) forwards'
      }}>
        <div style={{ position: 'relative', marginBottom: 32, animation: 'onbFloat 3.6s ease-in-out infinite' }}>
          {/* Anillo giratorio decorativo detrás del ícono */}
          <svg width="104" height="104" viewBox="0 0 104 104" style={{ position:'absolute', top:-12, left:-12, animation:'onbRingSpin 14s linear infinite', opacity:0.5 }}>
            <circle cx="52" cy="52" r="50" fill="none" stroke="rgba(224,176,94,0.25)" strokeWidth="1" strokeDasharray="3 7" />
          </svg>
          <div style={{
            width: 80, height: 80, background: 'linear-gradient(135deg, rgba(224,176,94,0.15) 0%, rgba(224,176,94,0.05) 100%)',
            border: '1px solid rgba(224,176,94,0.2)', borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'onbIconPop 0.5s cubic-bezier(.34,1.56,.64,1) forwards'
          }}>
            <svg width="30" height="30" fill="none" stroke="#E0B05E" strokeWidth="1.4" strokeLinecap="round" viewBox="0 0 24 24"><path d={actual.icon}/></svg>
          </div>
          {[{top:-5,left:-5,borderTop:'2px solid rgba(224,176,94,0.4)',borderLeft:'2px solid rgba(224,176,94,0.4)'},
            {top:-5,right:-5,borderTop:'2px solid rgba(224,176,94,0.4)',borderRight:'2px solid rgba(224,176,94,0.4)'},
            {bottom:-5,left:-5,borderBottom:'2px solid rgba(224,176,94,0.4)',borderLeft:'2px solid rgba(224,176,94,0.4)'},
            {bottom:-5,right:-5,borderBottom:'2px solid rgba(224,176,94,0.4)',borderRight:'2px solid rgba(224,176,94,0.4)'},
          ].map((s,i) => <div key={i} style={{ position:'absolute', width:12, height:12, ...s }} />)}
        </div>
        <p className="font-serif" style={{ fontSize: 9, letterSpacing: '0.5em', color: '#E0B05E', marginBottom: 14, animation:'onbShimmer 2.2s ease-in-out infinite' }}>✦ ✦ ✦</p>
        <h2 className="font-serif" style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.1 }}>{actual.titulo}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 280 }}>{actual.desc}</p>
      </div>

      <div style={{ width: '100%', position:'relative', zIndex:1 }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
          {pasos.map((_, i) => (
            <button
              key={i}
              onClick={() => ir(i)}
              aria-label={`Ir al paso ${i + 1}`}
              style={{ padding:6, background:'none', border:'none' }}
            >
              <div style={{ width: i === paso ? 20 : 6, height: 6, borderRadius: 999, background: i === paso ? 'linear-gradient(90deg,#E0B05E,#D49A45)' : 'var(--border)', transition: 'all 0.3s', boxShadow: i === paso ? '0 0 8px rgba(224,176,94,0.4)' : 'none' }} />
            </button>
          ))}
        </div>
        {!esUltimo ? (
          <button onClick={() => ir(paso + 1)} style={{ width: '100%', background: 'rgba(224,176,94,0.07)', border: '1.5px solid rgba(224,176,94,0.65)', borderRadius: 14, padding: '15px', fontSize: 13, fontWeight: 700, color: '#E9C784', letterSpacing: '0.18em', textTransform: 'uppercase', boxShadow: '0 0 0 1px rgba(224,176,94,0.08) inset, 0 10px 28px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            Siguiente <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>→</span>
          </button>
        ) : (
          <button onClick={onFinish} style={{ width: '100%', background: 'rgba(224,176,94,0.07)', border: '1.5px solid rgba(224,176,94,0.65)', borderRadius: 14, padding: '15px', fontSize: 13, fontWeight: 700, color: '#E9C784', letterSpacing: '0.18em', textTransform: 'uppercase', boxShadow: '0 0 0 1px rgba(224,176,94,0.08) inset, 0 10px 28px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            Ingresar a MAKO <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>→</span>
          </button>
        )}
      </div>
    </div>
  )
}
