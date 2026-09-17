import React, { useState } from 'react'

const pasos = [
  { icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', titulo: 'Bienvenido a MAKO', desc: 'La plataforma de gestión de tu edificio. Todo lo que necesitás, en un solo lugar.' },
  { icon: 'M12 4v16m8-8H4', titulo: 'Reportá problemas', desc: 'Creá un aviso cuando algo no funcione. Asigná un proveedor y seguí el estado en tiempo real.' },
  { icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', titulo: 'Reservá espacios', desc: 'SUM, gimnasio, laundry y terraza disponibles para reservar desde la app.' },
]

export default function Onboarding({ onFinish }) {
  const [paso, setPaso] = useState(0)
  const actual = pasos[paso]

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '48px 32px 36px', background: '#0A1428', maxWidth: 430, margin: '0 auto' }}>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onFinish} style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px', borderRadius: 999, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>Saltar</button>
      </div>

      <div key={paso} className="fade-up" style={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', marginBottom: 32 }}>
          <div style={{ width: 80, height: 80, background: 'linear-gradient(135deg, rgba(224,176,94,0.15) 0%, rgba(224,176,94,0.05) 100%)', border: '1px solid rgba(224,176,94,0.2)', borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="30" height="30" fill="none" stroke="#E0B05E" strokeWidth="1.4" strokeLinecap="round" viewBox="0 0 24 24"><path d={actual.icon}/></svg>
          </div>
          {[{top:-5,left:-5,borderTop:'2px solid rgba(224,176,94,0.4)',borderLeft:'2px solid rgba(224,176,94,0.4)'},
            {top:-5,right:-5,borderTop:'2px solid rgba(224,176,94,0.4)',borderRight:'2px solid rgba(224,176,94,0.4)'},
            {bottom:-5,left:-5,borderBottom:'2px solid rgba(224,176,94,0.4)',borderLeft:'2px solid rgba(224,176,94,0.4)'},
            {bottom:-5,right:-5,borderBottom:'2px solid rgba(224,176,94,0.4)',borderRight:'2px solid rgba(224,176,94,0.4)'},
          ].map((s,i) => <div key={i} style={{ position:'absolute', width:12, height:12, ...s }} />)}
        </div>
        <p className="font-cormorant animate-ornament" style={{ fontSize: 9, letterSpacing: '0.5em', color: '#E0B05E', marginBottom: 14 }}>✦ ✦ ✦</p>
        <h2 className="font-cormorant" style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.1 }}>{actual.titulo}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 280 }}>{actual.desc}</p>
      </div>

      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
          {pasos.map((_, i) => (
            <div key={i} style={{ width: i === paso ? 20 : 6, height: 6, borderRadius: 999, background: i === paso ? 'linear-gradient(90deg,#E0B05E,#D49A45)' : 'var(--border)', transition: 'all 0.3s', boxShadow: i === paso ? '0 0 8px rgba(224,176,94,0.4)' : 'none' }} />
          ))}
        </div>
        {paso < pasos.length - 1 ? (
          <button onClick={() => setPaso(p => p + 1)} style={{ width: '100%', background: 'rgba(224,176,94,0.07)', border: '1.5px solid rgba(224,176,94,0.65)', borderRadius: 14, padding: '15px', fontSize: 13, fontWeight: 700, color: '#E9C784', letterSpacing: '0.18em', textTransform: 'uppercase', boxShadow: '0 0 0 1px rgba(224,176,94,0.08) inset, 0 10px 28px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
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
