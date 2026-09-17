import React, { useState, useEffect, useCallback, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { notifyNuevoAviso } from '../firebase'
import { PalaceFrame, PageHeader, PrimaryBtn, OrnamentLine, SectionLabel, AccentCard, Card, GhostBtn, NavLockContext } from '../components/Palace'
import { Droplets, Zap, Flame, Building2, Sparkles, Shield, Layers, Wifi, FileQuestion, ChevronRight, AlertTriangle } from 'lucide-react'

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

function DiamondRating({ valor }) {
  const stars = Math.max(1, Math.round((valor / 100) * 5))
  return (
    <div style={{ display:'flex', gap:4 }}>
      {[1,2,3,4,5].map(i => (
        <div key={i} style={{ width:6, height:6, transform:'rotate(45deg)', background: i<=stars?'rgba(224,176,94,0.7)':'transparent', border:`1px solid ${i<=stars?'rgba(224,176,94,0.5)':'var(--border)'}` }}/>
      ))}
    </div>
  )
}

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
            <p style={{ fontSize:10, color:'var(--text-muted)', fontWeight:500 }}>Va directo al administrador para su aprobación</p>
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
              <p style={{ fontSize:10, color:'var(--text-muted)', marginTop:2 }}>Requiere aprobación del admin</p>
            </div>
            <ChevronRight size={14} color="var(--text-faint)" strokeWidth={2}/>
          </div>
        </AccentCard>
      </div>
    </div>
  )
}

// STEP 3: detalle del reporte
function StepDetalle({ servicio, problema, user, onBack, onSuccess, existingAviso }) {
  const [urgencia, setUrgencia]     = useState(existingAviso?.urgencia || 'media')
  const [descripcion, setDescripcion] = useState(existingAviso?.descripcion || '')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const esOtro = problema === 'Otro' || servicio.esOtro

  // Verificar aviso duplicado (si estamos editando el aviso que ya
  // creamos nosotros mismos al volver del paso de proveedor, no cuenta
  // como duplicado contra sí mismo)
  useEffect(() => {
    const check = async () => {
      if (esOtro) return
      try {
        let q = supabase.from('avisos')
          .select('id, titulo').eq('vecino_id', user.id)
          .eq('categoria', servicio.id).neq('estado', 'resuelto')
        if (existingAviso?.id) q = q.neq('id', existingAviso.id)
        const { data, error: e } = await q.limit(1)
        if (e) { console.error('Error chequeando avisos duplicados:', e); return }
        if (data?.length) setError(`Ya tenés un aviso activo de ${servicio.id}: "${data[0].titulo}". Resolvé ese primero.`)
      } catch (err) {
        console.error('Error chequeando avisos duplicados:', err)
      }
    }
    check()
  }, [])

  const handleSubmit = async () => {
    if (esOtro && !descripcion.trim()) { setError('Describí el problema para que el admin pueda evaluarlo.'); return }
    if (error) return
    setLoading(true)

    const titulo = esOtro
      ? (servicio.esOtro ? 'Consulta especial' : `Otro problema de ${servicio.id}`)
      : problema

    const datos = {
      titulo, descripcion: descripcion.trim(),
      categoria: servicio.id === 'Otro' ? 'Otro' : servicio.id,
      urgencia, estado: 'nuevo',
      vecino_id: user.id, edificio_id: user.edificio.id,
      pendiente_aprobacion: esOtro,
    }

    try {
      // Si ya habíamos creado este aviso (volvimos del paso de elegir
      // proveedor para editar algo) actualizamos esa misma fila en vez de
      // crear un reporte duplicado.
      const query = existingAviso?.id
        ? supabase.from('avisos').update(datos).eq('id', existingAviso.id)
        : supabase.from('avisos').insert(datos)
      const { data: aviso, error: e } = await query.select().single()

      if (e || !aviso) { setError('No se pudo enviar el aviso. Probá de nuevo.'); setLoading(false); return }

      // El aviso al Tablón (si el vecino lo tildó) ya NO se publica acá.
      // Se publica recién en StepProveedor, cuando el reclamo pasa a estar
      // realmente en curso (se le asigna un proveedor y se le manda el
      // primer mensaje) — antes se publicaba apenas se creaba el reporte,
      // aunque todavía no hubiera nadie trabajando en él.

      setLoading(false)
      onSuccess(aviso, esOtro)
    } catch (err) {
      setError('No se pudo conectar. Revisá tu conexión e intentá de nuevo.')
      setLoading(false)
    }
  }

  const inputStyle = { width:'100%', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:14, padding:'12px 16px', color:'var(--input-color)', fontSize:14, fontFamily:"'DM Sans',sans-serif" }

  return (
    <div className="page page-enter">
      <PalaceFrame />
      <PageHeader
        title={esOtro ? 'Consulta especial' : problema}
        subtitle={servicio.id !== 'Otro' ? servicio.id : 'Para el administrador'}
        onBack={onBack}
      />
      <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap:16 }}>

        {/* Info categoría */}
        <div style={{ padding:'11px 16px', background:`${servicio.color || 'rgba(224,176,94,0.1)'}12`, border:`1px solid ${servicio.color || 'rgba(224,176,94,0.3)'}28`, borderRadius:14, display:'flex', alignItems:'center', gap:10 }}>
          {servicio.Icon && <servicio.Icon size={16} color={servicio.color || 'var(--gold)'} strokeWidth={1.5}/>}
          <p style={{ fontSize:12, color:'var(--text-secondary)', fontWeight:600 }}>{servicio.id} — {esOtro ? 'Requiere aprobación del admin' : problema}</p>
        </div>

        {esOtro && (
          <div style={{ padding:'11px 16px', background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.2)', borderRadius:14, display:'flex', alignItems:'center', gap:10 }}>
            <AlertTriangle size={15} color="#fbbf24" strokeWidth={1.8}/>
            <p style={{ fontSize:11, color:'rgba(251,191,36,0.8)', fontWeight:500, lineHeight:1.5 }}>
              Este aviso irá al administrador. Él decidirá si es viable y asignará el proveedor correspondiente.
            </p>
          </div>
        )}

        {/* Urgencia */}
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
        </div>

        {/* Descripción */}
        <div>
          <SectionLabel style={{ marginBottom:8 }}>
            Descripción {esOtro ? <span style={{ color:'var(--red)', fontWeight:700 }}> *obligatorio</span> : <span style={{ color:'var(--text-faint)', fontWeight:400, textTransform:'none', letterSpacing:0 }}>(opcional)</span>}
          </SectionLabel>
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
            placeholder={esOtro ? 'Describí el problema en detalle para que el admin pueda evaluarlo...' : 'Detalles adicionales (opcional)...'}
            rows={3} style={{ ...inputStyle, resize:'none', lineHeight:1.5, borderRadius:14 }}/>
        </div>

        {error && (
          <div style={{ padding:'11px 14px', background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:12 }}>
            <p style={{ color:'var(--red)', fontSize:11, fontWeight:600 }}>{error}</p>
          </div>
        )}

        <OrnamentLine opacity={0.08}/>
        <PrimaryBtn onClick={handleSubmit} disabled={loading || (!!error && !esOtro)}>
          {loading ? 'Enviando...' : esOtro ? 'Enviar al administrador' : 'Continuar y elegir proveedor'}
        </PrimaryBtn>
      </div>
    </div>
  )
}

// STEP 4: elegir proveedor
function StepProveedor({ aviso, user, categoria, onBack, onCancelar }) {
  const navigate = useNavigate()
  const { setNavLock } = useContext(NavLockContext)
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading]         = useState(true)
  const [errorCarga, setErrorCarga]   = useState('')
  const [bloqueado, setBloqueado]     = useState(false)
  const [cancelando, setCancelando]   = useState(false)

  useEffect(() => {
    const fetch = async () => {
      setLoading(true); setErrorCarga('')
      try {
        const { data, error: e } = await supabase.from('proveedores').select('*')
          .eq('edificio_id', user.edificio.id)
          .eq('especialidad', categoria)
          .order('ranking', { ascending:false })
        if (e) throw e
        setProveedores(data || [])
      } catch (err) {
        setErrorCarga('No se pudo cargar la lista de proveedores. Revisá tu conexión.')
      }
      setLoading(false)
    }
    fetch()

    // Bloquear el nav inferior mientras estemos en este paso
    setNavLock({
      locked: true,
      onBlockedAttempt: () => {
        setBloqueado(true)
        if (navigator.vibrate) navigator.vibrate(50)
      },
    })

    // Bloquear también el botón físico/gesto de "volver" del navegador:
    // agregamos una entrada extra al historial y, si el usuario intenta
    // salir con ese botón, la volvemos a poner en su lugar.
    window.history.pushState({ pasoAviso:'proveedor' }, '')
    const onPopState = () => {
      window.history.pushState({ pasoAviso:'proveedor' }, '')
      setBloqueado(true)
      if (navigator.vibrate) navigator.vibrate(50)
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
      setNavLock({ locked:false, onBlockedAttempt:null })
    }
  }, [])

  const [errorSeleccion, setErrorSeleccion] = useState('')

  const handleSelect = async (prov) => {
    setErrorSeleccion('')
    try {
      const { error: e } = await supabase.from('avisos').update({ proveedor_id:prov.id }).eq('id', aviso.id)
      if (e) throw e
      setNavLock({ locked:false, onBlockedAttempt:null })
      await notifyNuevoAviso({ avisoId: aviso.id, titulo: aviso.titulo, edificioId: user.edificio.id, proveedorId: prov.id })
      navigate(`/chat/${aviso.id}`, { state:{ mensajeInicial: aviso.titulo }, replace:true })
    } catch (err) {
      setErrorSeleccion('No se pudo asignar el proveedor. Probá de nuevo.')
    }
  }

  // "Volver" (flechita del header): un paso atrás, instantáneo. El aviso
  // ya creado en el paso anterior se conserva — si vuelve a tocar
  // "Continuar" ahí, se actualiza ese mismo aviso en vez de crear uno
  // duplicado. Antes esta flecha ejecutaba lo mismo que cancelar, y por
  // eso tardaba y borraba el reporte sin avisar.
  const handleVolverPaso = () => {
    setNavLock({ locked:false, onBlockedAttempt:null })
    onBack()
  }

  // "Cancelar este reporte" (botón de abajo, es una acción distinta y
  // explícita): borra el aviso de verdad y resetea el wizard al primer paso.
  // Antes navegaba a '/aviso', pero como ya estábamos en esa misma ruta,
  // React no reiniciaba la pantalla — quedaba pegado en este mismo paso.
  const handleCancelar = () => {
    if (cancelando) return
    setCancelando(true)
    setNavLock({ locked:false, onBlockedAttempt:null })
    onCancelar()
    supabase.from('avisos').delete().eq('id', aviso.id).then(({ error }) => {
      if (error) console.error('No se pudo borrar el aviso cancelado:', error)
    })
  }

  if (loading) return (
    <div className="page page-enter" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
      <p style={{ color:'var(--text-muted)', fontSize:12 }}>Buscando proveedores...</p>
    </div>
  )

  return (
    <div className="page page-enter">
      <PalaceFrame />
      <PageHeader title="Elegí un proveedor" subtitle={categoria} onBack={handleVolverPaso} />
      <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap:10 }}>

        {bloqueado && (
          <div style={{ padding:'12px 16px', background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:14 }}>
            <p style={{ fontSize:12, color:'var(--red)', fontWeight:600 }}>No podés salir de esta pantalla con el gesto de volver. Usá la flecha de arriba para editar el reporte, o "Cancelar este reporte" abajo para salir del todo.</p>
          </div>
        )}

        <p style={{ fontSize:10, color:'var(--text-faint)', fontWeight:400 }}>Ordenados por preferencia del edificio. Los datos de contacto son privados.</p>

        {(errorCarga || errorSeleccion) && (
          <div style={{ padding:'12px 16px', background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:14 }}>
            <p style={{ fontSize:12, color:'var(--red)', fontWeight:600 }}>{errorCarga || errorSeleccion}</p>
          </div>
        )}

        {errorCarga ? (
          <Card style={{ textAlign:'center', padding:'24px' }}>
            <PrimaryBtn onClick={() => window.location.reload()}>Reintentar</PrimaryBtn>
          </Card>
        ) : proveedores.length === 0 ? (
          <Card style={{ textAlign:'center', padding:'24px' }}>
            <p style={{ fontSize:13, color:'var(--text-muted)', fontWeight:500 }}>No hay proveedores de {categoria} disponibles.</p>
            <p style={{ fontSize:11, color:'var(--text-faint)', marginTop:6 }}>El administrador fue notificado y asignará uno apenas tenga uno disponible.</p>
          </Card>
        ) : (
          proveedores.map(p => (
            <AccentCard key={p.id} accentColor={p.disponible?'rgba(52,211,153,0.4)':'var(--border)'} onClick={() => p.disponible && handleSelect(p)} style={{ opacity:p.disponible?1:0.5, cursor:p.disponible?'pointer':'default' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <p style={{ fontSize:14, color:'var(--text-primary)', fontWeight:700 }}>{p.nombre}</p>
                  <div style={{ marginTop:5 }}><DiamondRating valor={p.ranking||50}/></div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <span style={{ fontSize:9, fontWeight:700, color:p.disponible?'#34d399':'var(--red)', letterSpacing:'0.08em', textTransform:'uppercase' }}>{p.disponible?'Disponible':'Ocupado'}</span>
                  {p.disponible && <p style={{ fontSize:10, color:'rgba(224,176,94,0.6)', marginTop:4, fontWeight:600 }}>Tocar para contactar →</p>}
                </div>
              </div>
            </AccentCard>
          ))
        )}

        <OrnamentLine opacity={0.08}/>
        <GhostBtn onClick={handleCancelar} style={{ opacity:cancelando?0.6:1, pointerEvents:cancelando?'none':'auto' }}>
          {cancelando ? 'Cancelando...' : '← Cancelar este reporte'}
        </GhostBtn>
      </div>
    </div>
  )
}

export default function NuevoAviso({ user }) {
  const navigate = useNavigate()
  const [step, setStep]           = useState(1)
  const [servicio, setServicio]   = useState(null)
  const [problema, setProblema]   = useState(null)
  const [avisoCreado, setAvisoCreado] = useState(null)

  const handleCategoriaSelect = (s) => {
    setServicio(s)
    if (s.esOtro) { setProblema('Otro'); setStep(3) }
    else setStep(2)
  }

  const handleProblemaSelect = (p) => {
    setProblema(p)
    setStep(3)
  }

  const handleSuccess = (aviso, esOtro) => {
    if (esOtro) {
      navigate('/avisos')
    } else {
      setAvisoCreado(aviso)
      setStep(4)
    }
  }

  if (step === 1) return <StepCategoria onSelect={handleCategoriaSelect} />
  if (step === 2) return <StepProblema servicio={servicio} onSelect={handleProblemaSelect} onBack={() => setStep(1)} />
  if (step === 3) return <StepDetalle servicio={servicio} problema={problema} user={user} existingAviso={avisoCreado} onBack={() => servicio.esOtro ? setStep(1) : setStep(2)} onSuccess={handleSuccess} />
  if (step === 4) return <StepProveedor aviso={avisoCreado} user={user} categoria={servicio.id} onBack={() => setStep(3)} onCancelar={() => { setServicio(null); setProblema(null); setAvisoCreado(null); setStep(1) }} />

  return null
}
