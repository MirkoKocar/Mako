import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { notificar, rpc } from '../lib/flujo'
import { validarArchivo, subirAdjunto, MAX_MB, MAX_VIDEO_SEG } from '../lib/adjuntos'
import { validarTelefono, soloDigitos } from '../lib/validar'
import { PalaceFrame, PageHeader, PrimaryBtn, OrnamentLine, SectionLabel, AccentCard, Card, GhostBtn } from '../components/Palace'
import { Droplets, Zap, Flame, Building2, Sparkles, Shield, Layers, Wifi, FileQuestion, ChevronRight, AlertTriangle, Camera, CheckCircle2 } from 'lucide-react'

const SERVICIOS = [
  { id:'Plomería',    Icon:Droplets,     color:'#60a5fa', desc:'Caños, pérdidas, desagotes', esDelEdificio:false, problemas:['Pérdida de agua en canilla o inodoro','Caño roto o con goteras','Desagüe tapado','Presión baja de agua','Pérdida bajo mesada','Filtraciones en paredes'] },
  { id:'Electricidad',Icon:Zap,          color:'#fbbf24', desc:'Cortes, tableros, luces',     esDelEdificio:false, problemas:['Corte de luz en departamento','Tomacorriente que no funciona','Luz parpadeante o fundida','Tablero disparado','Cortocircuito'] },
  { id:'Gas',         Icon:Flame,        color:'#f87171', desc:'Pérdidas, calefones, calderas',esDelEdificio:false, problemas:['Olor a gas en el departamento','Calefón que no enciende','Caldera sin presión','Cocina sin llama','Revisión de instalación'] },
  { id:'Ascensor',    Icon:Building2,    color:'#a78bfa', desc:'Fallas y emergencias',         esDelEdificio:true,  problemas:['Ascensor trabado entre pisos','Puertas que no cierran','Botones sin respuesta','Ruidos extraños','Luz interior apagada'] },
  { id:'Limpieza',    Icon:Sparkles,     color:'#34d399', desc:'Áreas comunes del edificio',  esDelEdificio:true,  problemas:['Pasillo sucio o con basura','Ascensor sin limpiar','Patio en mal estado','Cochera con residuos','Terraza sucia'] },
  { id:'Seguridad',   Icon:Shield,       color:'#f87171', desc:'Portones, cámaras, cerraduras',esDelEdificio:true,  problemas:['Portón roto o sin cierre','Intercomunicador sin sonido','Cámara de seguridad caída','Cerradura del edificio dañada'] },
  { id:'Estructura',  Icon:Layers,       color:'#e2b97a', desc:'Grietas, humedad, pintura',   esDelEdificio:true,  problemas:['Grietas en pared o techo','Humedad en paredes','Pintura descascarada','Piso roto en zona común','Filtraciones de lluvia'] },
  { id:'Internet',    Icon:Wifi,         color:'#60a5fa', desc:'Conexión o fibra óptica',     esDelEdificio:false, problemas:['Sin conexión a internet','Señal muy débil','Router sin luz','Cable de red cortado'] },
]

const URGENCIAS = [
  { value:'baja',  label:'Baja',  desc:'Puede esperar', color:'#34d399' },
  { value:'media', label:'Media', desc:'Esta semana',   color:'#fbbf24' },
  { value:'alta',  label:'Alta',  desc:'Emergencia',    color:'#f87171' },
]

// STEP 1: elegir categoría
function StepCategoria({ onSelect }) {
  return (
    <div className="page page-enter">
      <PalaceFrame />
      <PageHeader title="Nuevo Reporte" subtitle="¿Qué área tiene el problema?" />
      <div style={{ padding:'0 20px 24px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
          {SERVICIOS.map(s => (
            <div key={s.id} onClick={() => onSelect(s)} style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderTop:`3px solid ${s.color}40`, borderRadius:18, padding:'16px 14px', cursor:'pointer', display:'flex', flexDirection:'column', gap:8, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:0, left:14, right:14, height:1, background:'linear-gradient(to right,transparent,rgba(224,176,94,0.1),transparent)' }}/>
              <s.Icon size={20} color={s.color} strokeWidth={1.5}/>
              <div>
                <p style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', lineHeight:1.2 }}>{s.id}</p>
                <p style={{ fontSize:9.5, color:'var(--text-muted)', marginTop:3, fontWeight:500, lineHeight:1.4 }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        {/* Botón Otro */}
        <div onClick={() => onSelect({ id:'Otro', Icon:FileQuestion, color:'#a0aec0', desc:'Problema fuera de categorías', problemas:[], esOtro:true })}
          style={{ background:'var(--bg-card)', border:'1px dashed var(--border-strong)', borderRadius:16, padding:'14px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
          <FileQuestion size={18} color="var(--text-muted)" strokeWidth={1.5}/>
          <div>
            <p style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>Otro</p>
            <p style={{ fontSize:10, color:'var(--text-muted)', fontWeight:500 }}>Lo revisa el administrador</p>
          </div>
          <ChevronRight size={14} color="var(--text-faint)" style={{ marginLeft:'auto' }}/>
        </div>
      </div>
    </div>
  )
}

// STEP 2: elegir problema dentro de la categoría
function StepProblema({ servicio, onSelect, onBack }) {
  return (
    <div className="page page-enter">
      <PalaceFrame />
      <PageHeader title={servicio.id} subtitle={servicio.desc} onBack={onBack} />
      <div style={{ padding:'0 20px 24px', display:'flex', flexDirection:'column', gap:10 }}>
        <SectionLabel style={{ marginBottom:4 }}>Elegí el problema</SectionLabel>
        {servicio.problemas.map((p, i) => (
          <AccentCard key={i} accentColor={`${servicio.color}40`} onClick={() => onSelect(p)}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <p style={{ fontSize:13, color:'var(--text-secondary)', fontWeight:500 }}>{p}</p>
              <ChevronRight size={14} color="rgba(224,176,94,0.4)" strokeWidth={2}/>
            </div>
          </AccentCard>
        ))}
        {/* Botón Otro dentro de la categoría */}
        <AccentCard accentColor="var(--border-strong)" onClick={() => onSelect('Otro')}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <p style={{ fontSize:13, color:'var(--text-secondary)', fontWeight:600 }}>Otro problema de {servicio.id}</p>
              <p style={{ fontSize:10, color:'var(--text-muted)', marginTop:2 }}>Lo revisa el administrador</p>
            </div>
            <ChevronRight size={14} color="var(--text-faint)" strokeWidth={2}/>
          </div>
        </AccentCard>
      </div>
    </div>
  )
}

// STEP 3: detalle del reporte (foto/video + descripción + urgencia)
function StepDetalle({ servicio, problema, user, onBack, onEnviado }) {
  const [urgencia, setUrgencia]       = useState('media')
  const [descripcion, setDescripcion] = useState('')
  const [telefono, setTelefono]       = useState('')
  const [archivos, setArchivos]       = useState([])
  const [loading, setLoading]         = useState(false)
  const [paso, setPaso]               = useState('')
  const [error, setError]             = useState('')
  const [duplicado, setDuplicado]     = useState('')
  const borradorRef = useRef(null)      // si algo falla a mitad de camino, reintentar reusa el mismo reporte
  const inputRef = useRef(null)
  const esOtro = problema === 'Otro' || servicio.esOtro

  useEffect(() => {
    if (esOtro) return
    supabase.from('avisos').select('id, titulo').eq('vecino_id', user.id).eq('categoria', servicio.id)
      .not('enviado_at', 'is', null).not('fase', 'in', '(cerrado,rechazado)').limit(1)
      .then(({ data, error: e }) => {
        if (e) return console.error('Error chequeando avisos duplicados:', e)
        if (data?.length) setDuplicado(`Ya tenés un reporte abierto de ${servicio.id}: "${data[0].titulo}". Esperá a que se resuelva antes de mandar otro de la misma categoría.`)
      })
  }, [])

  const elegirArchivos = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = ''
    if (!files.length) return
    if (archivos.length + files.length > 4) { setError('Podés subir hasta 4 archivos.'); return }
    for (const f of files) {
      const msg = await validarArchivo(f, { permitirVideo: true })
      if (msg) { setError(msg); return }
    }
    setError(''); setArchivos(prev => [...prev, ...files])
  }

  const handleSubmit = async () => {
    const desc = descripcion.trim()
    if (desc.length < 10) { setError('Contanos brevemente qué pasa (al menos 10 caracteres) para que el administrador pueda evaluarlo.'); return }
    if (desc.length > 1000) { setError('La descripción es demasiado larga (máximo 1000 caracteres).'); return }
    const errTel = validarTelefono(telefono)
    if (errTel) { setError(errTel); return }
    if (duplicado) return
    setLoading(true); setError('')

    const titulo = esOtro ? (servicio.esOtro ? 'Consulta especial' : `Otro problema de ${servicio.id}`) : problema
    try {
      // 1) crear el reporte (todavía invisible para el admin)
      if (!borradorRef.current) {
        setPaso('Creando reporte...')
        const { data: aviso, error: e } = await supabase.from('avisos').insert({
          titulo, descripcion: desc, categoria: servicio.id === 'Otro' ? 'Otro' : servicio.id, urgencia,
          contacto_telefono: soloDigitos(telefono) || null, vecino_id: user.id, edificio_id: user.edificio.id,
        }).select('id').single()
        if (e || !aviso) throw e || new Error('sin datos')
        borradorRef.current = { id: aviso.id, adjuntos: [] }
      }
      const b = borradorRef.current
      // 2) subir fotos/videos al almacenamiento privado
      for (let i = b.adjuntos.length; i < archivos.length; i++) {
        setPaso(`Subiendo archivo ${i + 1} de ${archivos.length}...`)
        b.adjuntos.push(await subirAdjunto(archivos[i], user.edificio.id, b.id))
      }
      if (b.adjuntos.length) {
        const { error: eA } = await supabase.from('avisos').update({ adjuntos: b.adjuntos, descripcion: desc, urgencia, contacto_telefono: soloDigitos(telefono) || null }).eq('id', b.id)
        if (eA) throw eA
      }
      // 3) enviarlo: recién ahora le llega al administrador
      setPaso('Enviando al administrador...')
      const r = await rpc('fh_enviar_reporte', { p_aviso: b.id })
      if (r.error) { setError(r.error); setLoading(false); setPaso(''); return }
      notificar({ tipo: 'nuevo_aviso', avisoId: b.id })
      onEnviado(r.data)
    } catch (err) {
      console.error(err)
      setError('No se pudo enviar el reporte. Revisá tu conexión y volvé a tocar "Enviar" — no se pierde lo que cargaste.')
    }
    setLoading(false); setPaso('')
  }

  const inputStyle = { width:'100%', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:14, padding:'12px 16px', color:'var(--input-color)', fontSize:14, fontFamily:"'DM Sans',sans-serif" }

  return (
    <div className="page page-enter">
      <PalaceFrame />
      <PageHeader title={esOtro ? 'Consulta especial' : problema} subtitle={servicio.id !== 'Otro' ? servicio.id : 'Para el administrador'} onBack={onBack} />
      <div style={{ padding:'0 20px 24px', display:'flex', flexDirection:'column', gap:16 }}>

        <div style={{ padding:'11px 16px', background:`${servicio.color || 'rgba(224,176,94,0.1)'}12`, border:`1px solid ${servicio.color || 'rgba(224,176,94,0.3)'}28`, borderRadius:14, display:'flex', alignItems:'center', gap:10 }}>
          {servicio.Icon && <servicio.Icon size={16} color={servicio.color || 'var(--gold)'} strokeWidth={1.5}/>}
          <p style={{ fontSize:12, color:'var(--text-secondary)', fontWeight:600 }}>{servicio.id} — {esOtro ? 'Lo revisa el administrador' : problema}</p>
        </div>

        <div style={{ padding:'11px 16px', background:'rgba(224,176,94,0.06)', border:'1px solid rgba(224,176,94,0.2)', borderRadius:14 }}>
          <p style={{ fontSize:11, color:'rgba(224,176,94,0.9)', fontWeight:500, lineHeight:1.5 }}>
            Tu reporte le llega primero al administrador. Si lo autoriza, se deriva al proveedor y te avisamos.
          </p>
        </div>

        <div>
          <SectionLabel style={{ marginBottom:9 }}>Urgencia</SectionLabel>
          <div style={{ display:'flex', gap:8 }}>
            {URGENCIAS.map(u => (
              <button key={u.value} onClick={() => setUrgencia(u.value)} style={{ flex:1, padding:'12px 6px', borderRadius:14, textAlign:'center', background: urgencia===u.value?`${u.color}12`:'var(--cat-bg)', border:`1px solid ${urgencia===u.value?u.color+'35':'var(--cat-border)'}`, borderTop:`3px solid ${urgencia===u.value?u.color+'60':'transparent'}`, transition:'all 0.2s' }}>
                <p style={{ fontSize:12, fontWeight:700, color:urgencia===u.value?u.color:'var(--cat-color)' }}>{u.label}</p>
                <p style={{ fontSize:9, color:'var(--text-faint)', marginTop:2 }}>{u.desc}</p>
              </button>
            ))}
          </div>
          {urgencia === 'alta' && <p style={{ fontSize:10.5, color:'#f87171', marginTop:8, lineHeight:1.45 }}>Si hay riesgo inmediato (olor fuerte a gas, inundación, chispas), además de reportarlo avisá a emergencias y cortá la llave que corresponda.</p>}
        </div>

        <div>
          <SectionLabel style={{ marginBottom:8 }}>Descripción <span style={{ color:'var(--red)', fontWeight:700 }}> *</span></SectionLabel>
          <textarea value={descripcion} onChange={e => { setDescripcion(e.target.value.slice(0,1000)); setError('') }}
            placeholder="Contá brevemente qué pasa y dónde (ej: pérdida de agua bajo la mesada de la cocina, hace 2 días)" rows={4}
            style={{ ...inputStyle, resize:'none', lineHeight:1.5 }}/>
          <p style={{ fontSize:9.5, color:'var(--text-faint)', marginTop:4, textAlign:'right' }}>{descripcion.length}/1000</p>
        </div>

        <div>
          <SectionLabel style={{ marginBottom:8 }}>Foto o video corto <span style={{ color:'var(--text-faint)', fontWeight:400, textTransform:'none', letterSpacing:0 }}>(recomendado)</span></SectionLabel>
          <input ref={inputRef} type="file" multiple accept="image/*,video/*" style={{ display:'none' }} onChange={elegirArchivos} />
          <button onClick={() => inputRef.current?.click()} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'14px', borderRadius:14, background:'var(--input-bg)', border:'1px dashed var(--border-strong)', color:'var(--text-secondary)', fontSize:13, fontWeight:700 }}>
            <Camera size={16}/> Sacar o elegir foto / video
          </button>
          <p style={{ fontSize:9.5, color:'var(--text-faint)', marginTop:5 }}>Hasta 4 archivos · video de hasta {MAX_VIDEO_SEG} segundos · máximo {MAX_MB} MB cada uno.</p>
          {archivos.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:8 }}>
              {archivos.map((f, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', borderRadius:10, background:'var(--bg-card)', border:'1px solid var(--border)' }}>
                  <p style={{ fontSize:11, color:'var(--text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{f.type.startsWith('video/') ? '🎥' : '📷'} {f.name}</p>
                  <button onClick={() => setArchivos(prev => prev.filter((_, j) => j !== i))} style={{ color:'#f87171', fontSize:11, fontWeight:700, marginLeft:8 }}>Quitar</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionLabel style={{ marginBottom:8 }}>Teléfono de contacto <span style={{ color:'var(--text-faint)', fontWeight:400, textTransform:'none', letterSpacing:0 }}>(opcional — lo ve solo el proveedor asignado)</span></SectionLabel>
          <input value={telefono} onChange={e => { setTelefono(e.target.value.replace(/[^0-9+\s()-]/g,'').slice(0,20)); setError('') }} inputMode="tel" placeholder="Ej: 5491122334455" style={inputStyle}/>
        </div>

        {(error || duplicado) && (
          <div style={{ padding:'11px 14px', background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:12 }}>
            <p style={{ color:'var(--red)', fontSize:11.5, fontWeight:600, lineHeight:1.45 }}>{error || duplicado}</p>
          </div>
        )}

        <OrnamentLine opacity={0.08}/>
        <PrimaryBtn onClick={handleSubmit} disabled={loading || !!duplicado}>
          {loading ? (paso || 'Enviando...') : 'Enviar al administrador'}
        </PrimaryBtn>
        <p style={{ fontSize:9.5, color:'var(--text-faint)', textAlign:'center', lineHeight:1.5 }}>Al enviar, aceptás que el administrador y el proveedor asignado vean tu nombre, unidad y lo que cargues acá.</p>
      </div>
    </div>
  )
}

function StepListo({ aviso, onOtro, onVer }) {
  return (
    <div className="page page-enter">
      <PalaceFrame />
      <div style={{ padding:'90px 28px 24px', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
        <CheckCircle2 size={54} color="#34d399" strokeWidth={1.4}/>
        <h2 className="font-serif" style={{ fontSize:24, color:'var(--text-primary)' }}>{aviso?.fase === 'derivado' ? '¡Reporte autorizado!' : '¡Reporte enviado!'}</h2>
        <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.6 }}>
          {aviso?.fase === 'derivado'
            ? 'Se autorizó automáticamente y ya se derivó al proveedor. Te avisamos apenas acepte.'
            : 'Le llegó al administrador. Cuando lo revise, te avisamos si lo autorizó, lo rechazó o necesita más información.'}
        </p>
        <div style={{ width:'100%', marginTop:10, display:'flex', flexDirection:'column', gap:10 }}>
          <PrimaryBtn onClick={onVer}>Ver mi reporte</PrimaryBtn>
          <GhostBtn onClick={onOtro}>Hacer otro reporte</GhostBtn>
        </div>
      </div>
    </div>
  )
}

export default function NuevoAviso({ user }) {
  const navigate = useNavigate()
  const [step, setStep]         = useState(1)
  const [servicio, setServicio] = useState(null)
  const [problema, setProblema] = useState(null)
  const [enviado, setEnviado]   = useState(null)

  const reiniciar = () => { setServicio(null); setProblema(null); setEnviado(null); setStep(1) }

  if (step === 1) return <StepCategoria onSelect={(s) => { setServicio(s); if (s.esOtro) { setProblema('Otro'); setStep(3) } else setStep(2) }} />
  if (step === 2) return <StepProblema servicio={servicio} onSelect={(p) => { setProblema(p); setStep(3) }} onBack={() => setStep(1)} />
  if (step === 3) return <StepDetalle servicio={servicio} problema={problema} user={user} onBack={() => servicio.esOtro ? setStep(1) : setStep(2)} onEnviado={(a) => { setEnviado(a); setStep(4) }} />
  if (step === 4) return <StepListo aviso={enviado} onOtro={reiniciar} onVer={() => navigate(enviado?.id ? `/chat/${enviado.id}` : '/avisos', { replace: true })} />
  return null
}
