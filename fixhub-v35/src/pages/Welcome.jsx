import React, { useEffect, useState } from 'react'

export default function Welcome({ onContinue }) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    // Texto aparece a 2s, botón a 2.8s
    const t1 = setTimeout(() => setPhase(1), 2000)
    const t2 = setTimeout(() => setPhase(2), 2800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <div style={{
      height:'100dvh', display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      padding:'32px 32px 48px', background:'#0A1428',
      position:'relative', overflow:'hidden'
    }}>
      <style>{`
        @keyframes drawPath { from{stroke-dashoffset:var(--dash)} to{stroke-dashoffset:0} }
        @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes glow     { 0%,100%{filter:drop-shadow(0 0 3px rgba(224,176,94,0.25))} 50%{filter:drop-shadow(0 0 8px rgba(224,176,94,0.55))} }
        @keyframes floatY   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
      `}</style>

      {/* Fondo plano, sin textura ni manchas */}
      <div style={{position:'absolute', inset:0, background:'radial-gradient(circle at 50% 38%, rgba(255,255,255,0.035) 0%, transparent 60%)', pointerEvents:'none'}}/>

      {/* Ícono animado — casa amigable, trazo redondeado */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',marginBottom:8}}>
        <svg width="210" height="210" viewBox="0 0 200 200" fill="none"
          style={{animation:'glow 3.2s ease-in-out 3.6s infinite'}}>

          {/* Techo redondeado */}
          <path d="M38 92 Q100 34 162 92"
            stroke="#E0B05E" strokeWidth="2" strokeLinecap="round"
            style={{'--dash':190,strokeDasharray:190,strokeDashoffset:190,
              animation:'drawPath 1s cubic-bezier(.65,0,.35,1) 0.2s forwards'}}/>

          {/* Cuerpo de la casa, esquinas redondeadas */}
          <path d="M50 92 L50 150 Q50 158 58 158 L142 158 Q150 158 150 150 L150 92"
            stroke="#E0B05E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{'--dash':280,strokeDasharray:280,strokeDashoffset:280,
              animation:'drawPath 1s cubic-bezier(.65,0,.35,1) 1.1s forwards'}}/>

          {/* Ventana redonda tipo ojo de buey */}
          <circle cx="100" cy="112" r="16"
            stroke="#E0B05E" strokeWidth="1.6"
            style={{'--dash':101,strokeDasharray:101,strokeDashoffset:101,
              animation:'drawPath 0.6s ease 2.1s forwards',opacity:0.85}}/>
          <path d="M91 112 L109 112 M100 103 L100 121"
            stroke="#E0B05E" strokeWidth="1.2" strokeLinecap="round"
            style={{'--dash':36,strokeDasharray:36,strokeDashoffset:36,
              animation:'drawPath 0.4s ease 2.6s forwards',opacity:0.65}}/>

          {/* Puerta con arco */}
          <path d="M84 158 L84 140 Q84 130 100 130 Q116 130 116 140 L116 158"
            stroke="#E0B05E" strokeWidth="1.8" strokeLinecap="round"
            style={{'--dash':100,strokeDasharray:100,strokeDashoffset:100,
              animation:'drawPath 0.7s ease 2.3s forwards'}}/>

          {/* Piso */}
          <path d="M20 158 L180 158"
            stroke="#E0B05E" strokeWidth="1.4" strokeLinecap="round"
            style={{'--dash':160,strokeDasharray:160,strokeDashoffset:160,
              animation:'drawPath 0.6s ease 2.9s forwards',opacity:0.4}}/>

          {/* Arbolito, trazo amistoso */}
          <g style={{opacity:0,animation:'fadeIn 0.6s ease 3.1s forwards'}}>
            <path d="M164 158 L164 138" stroke="#E0B05E" strokeWidth="1.6" strokeLinecap="round"/>
            <circle cx="164" cy="126" r="12" stroke="#E0B05E" strokeWidth="1.6"/>
          </g>

          {/* Sol, con leve flotación */}
          <g style={{opacity:0,animation:'fadeIn 0.6s ease 3.3s forwards, floatY 4s ease-in-out 3.9s infinite'}}>
            <circle cx="46" cy="46" r="7" stroke="#E0B05E" strokeWidth="1.5"/>
            <path d="M46 33v-5M46 64v-5M33 46h-5M64 46h-5M36.5 36.5l-3.5-3.5M55.5 55.5l3.5 3.5M55.5 36.5l3.5-3.5M36.5 55.5l-3.5 3.5"
              stroke="#E0B05E" strokeWidth="1.4" strokeLinecap="round"/>
          </g>

          {/* Puntitos decorativos */}
          <circle cx="30"  cy="100" r="1.6" fill="#E0B05E" style={{opacity:0,animation:'fadeIn 0.4s ease 3s forwards'}}/>
          <circle cx="172" cy="100" r="1.6" fill="#E0B05E" style={{opacity:0,animation:'fadeIn 0.4s ease 3.1s forwards'}}/>
        </svg>
      </div>

      {/* Texto y botón */}
      <div style={{
        textAlign:'center', width:'100%',
        opacity: phase>=1 ? 1 : 0,
        transition:'opacity 0.7s ease, transform 0.7s ease',
        transform: phase>=1 ? 'translateY(0)' : 'translateY(14px)'
      }}>
        <p style={{fontSize:9,letterSpacing:'0.45em',color:'rgba(224,176,94,0.45)',textTransform:'uppercase',marginBottom:14,fontWeight:600}}>✦ &nbsp; ✦ &nbsp; ✦</p>
        <h1 className="font-logo" style={{
          fontSize:56, color:'var(--text-primary)', lineHeight:1, marginBottom:10,
          letterSpacing:'0.08em', fontWeight:700
        }}>
          MAKO
        </h1>
        <p style={{
          fontSize:12, color:'rgba(224,176,94,0.78)', letterSpacing:'0.55em',
          textTransform:'uppercase', marginBottom:28, fontWeight:600, paddingLeft:'0.55em'
        }}>
          Consorcios
        </p>
        <div style={{
          opacity: phase>=2 ? 1 : 0,
          transition:'opacity 0.5s ease, transform 0.5s ease',
          transform: phase>=2 ? 'translateY(0)' : 'translateY(8px)'
        }}>
          <button onClick={onContinue} style={{
            width:'100%',
            background:'rgba(224,176,94,0.07)',
            border:'1.5px solid rgba(224,176,94,0.65)',
            borderRadius:14, padding:'16px',
            fontSize:13, fontWeight:700, color:'#E9C784', letterSpacing:'0.18em',
            textTransform:'uppercase',
            boxShadow:'0 0 0 1px rgba(224,176,94,0.08) inset, 0 10px 28px rgba(0,0,0,0.35)',
            display:'flex', alignItems:'center', justifyContent:'center', gap:10
          }}>
            Ingresar a MAKO
            <span aria-hidden="true" style={{fontSize:15,lineHeight:1}}>→</span>
          </button>
        </div>
      </div>
    </div>
  )
}
