import { useCobertura, invalidarCobertura, estadoRubro, RUBRO_SIN_MINIMO } from '../lib/cobertura'
import { validarNombre, validarTelefono, validarCelularAR, normalizarTelefonoAR, formatoTelefonoAR } from '../lib/validar'
import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { PalaceFrame, PageHeader, Card, PrimaryBtn, BottomNav } from '../components/Palace'

// Validación de FORMATO del teléfono (no confirma que exista de verdad, solo
// detecta errores de tipeo evidentes): formato internacional E.164, entre 10
// y 15 dígitos en total. Para Argentina en particular, el formato correcto
// con código de país es 54 9 + código de área + número (13 dígitos en total,
// ej: 5491122334455).
function telefonoValido(numero) {
  const digitos = String(numero).replace(/\D/g, '')
  if (!digitos) return true // vacío = opcional, no rompe el guardado
  if (digitos.length < 10 || digitos.length > 15) return false
  if (digitos.startsWith('54') && digitos.length !== 13) return false // AR con código de país: siempre 13 dígitos
  return true
}

export default function AdminProveedores({ user }) {
  const navigate = useNavigate()
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const location = useLocation()
  const categoriaPedida = location.state?.categoria || ''
  const [showForm, setShowForm] = useState(!!categoriaPedida)
  const [nombre, setNombre] = useState('')
  const [especialidad, setEspecialidad] = useState(categoriaPedida)
  const [telefono, setTelefono] = useState('')
  const [saving, setSaving] = useState(false)
  const cob = useCobertura(user.edificio.id)
  const [optin, setOptin] = useState(false)   // consentimiento: el proveedor aceptó recibir avisos por WhatsApp
  const [errorTelefono, setErrorTelefono] = useState('')
  const [errorCarga, setErrorCarga] = useState('')
  const [errorAccion, setErrorAccion] = useState('')

  const ESPECIALIDADES = ['Plomería','Electricidad','Gas','Ascensor','Limpieza','Seguridad','Estructura','Internet','Otro']

  useEffect(() => {
    const fetch = async () => {
      setLoading(true); setErrorCarga('')
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

  // Proveedores cargados antes de v38: el admin confirma el consentimiento (la fecha la sella la base)
  const registrarConsentimiento = async (p) => {
    if (!window.confirm(`¿Confirmás que ${p.nombre} aceptó recibir avisos de trabajo por WhatsApp?`)) return
    if (!normalizarTelefonoAR(p.telefono)) { setErrorAccion('El teléfono de este proveedor no es un celular argentino válido. Cargalo de nuevo.'); return }
    const { data, error } = await supabase.from('proveedores').update({ whatsapp_optin_at: new Date().toISOString(), telefono: normalizarTelefonoAR(p.telefono) }).eq('id', p.id).select().single()
    if (error || !data) { setErrorAccion('No se pudo registrar el consentimiento.'); return }
    setProveedores(prev => prev.map(x => x.id === p.id ? data : x))
  }

  const agregar = async () => {
    const errNom = validarNombre(nombre)
    if (errNom) { setErrorAccion(errNom); return }
    if (!especialidad) { setErrorAccion('Elegí una especialidad.'); return }
    if (proveedores.some(p => p.nombre.trim().toLowerCase() === nombre.trim().toLowerCase())) { setErrorAccion('Ya cargaste un proveedor con ese nombre. Usá un nombre distinto (ej: agregá el apellido).'); return }
    const errTel = validarCelularAR(telefono)
    if (errTel) { setErrorTelefono(errTel + ' Lo necesitamos para mandarle el link de los trabajos por WhatsApp.'); return }
    if (!optin) { setErrorAccion('Tildá la casilla: sin el consentimiento del proveedor no se le pueden mandar avisos por WhatsApp.'); return }
    setErrorTelefono(''); setErrorAccion('')
    setSaving(true)
    try {
      const { data, error } = await supabase.from('proveedores').insert({
        nombre: nombre.trim().replace(/\s+/g, ' '), especialidad, telefono: normalizarTelefonoAR(telefono),
        whatsapp_optin_at: new Date().toISOString(),   // la fecha y el admin los sella la base
        edificio_id: user.edificio.id, disponible: true, ranking: 50
      }).select().single()
      if (error || !data) throw error || new Error('sin datos')
      setProveedores(prev => [...prev, data]); invalidarCobertura(user.edificio.id)
      setNombre(''); setEspecialidad(''); setTelefono(''); setOptin(false); setShowForm(false)
      if (categoriaPedida) { navigate(-1); return }   // volvió desde un reporte: lo devolvemos a la tarjeta para que derive
    } catch (err) {
      setErrorAccion('No se pudo agregar el proveedor. Probá de nuevo.')
    }
    setSaving(false)
  }

  const cambiarRanking = async (id, delta) => {
    const anterior = proveedores
    const p = proveedores.find(p => p.id === id)
    const nuevo = Math.max(0, Math.min(100, (p.ranking || 50) + delta))
    setProveedores(prev => prev.map(p => p.id === id ? { ...p, ranking: nuevo } : p)
      .sort((a, b) => (b.ranking || 0) - (a.ranking || 0)))
    try {
      const { error } = await supabase.from('proveedores').update({ ranking: nuevo }).eq('id', id)
      if (error) throw error
      invalidarCobertura(user.edificio.id)
    } catch (err) {
      setProveedores(anterior)
      setErrorAccion('No se pudo actualizar el ranking. Probá de nuevo.')
    }
  }

  const eliminar = async (id) => {
    const anterior = proveedores
    setProveedores(prev => prev.filter(p => p.id !== id))
    try {
      const { error } = await supabase.from('proveedores').delete().eq('id', id)
      if (error) throw error
    } catch (err) {
      setProveedores(anterior)
      setErrorAccion('No se pudo eliminar el proveedor. Probá de nuevo.')
    }
  }

  return (
    <div className="page">
      <PalaceFrame />
      <PageHeader title="Proveedores" subtitle="Gestión y rankings" onBack={() => navigate('/')} extra={
        <button onClick={() => setShowForm(!showForm)} style={{
          marginTop: 10, padding: '7px 18px', borderRadius: 20,
          background: 'var(--input-bg)', border: '1px solid var(--border)',
          color: '#D9CBB0', fontSize: 11, letterSpacing: '0.06em'
        }}>
          {showForm ? 'Cancelar' : '+ Agregar proveedor'}
        </button>
      } />

      {showForm && (
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Card style={{ padding: '16px' }}>
            <p className="font-cormorant" style={{ fontSize: 16, color: 'var(--text-primary)', marginBottom: 12 }}>Nuevo proveedor</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre completo"
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text-primary)', fontSize: 14 }} />
              <select value={especialidad} onChange={e => setEspecialidad(e.target.value)}
                style={{ width: '100%', background: '#0B1A2E', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: especialidad ? 'var(--text-primary)' : 'var(--text-faint)', fontSize: 14 }}>
                <option value="">Especialidad...</option>
                {ESPECIALIDADES.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              <input value={telefono} onChange={e => { setTelefono(e.target.value); setErrorTelefono('') }} placeholder="Celular (ej: 11 2233-4455)"
                style={{ width: '100%', background: 'var(--input-bg)', border: `1px solid ${errorTelefono ? 'rgba(248,113,113,0.5)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 14px', color: 'var(--text-primary)', fontSize: 14 }} />
              {errorTelefono ? (
                <p style={{ fontSize: 10, color: '#f87171', marginTop: -4 }}>{errorTelefono}</p>
              ) : (
                <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: -4 }}>{telefono && normalizarTelefonoAR(telefono) ? `Se guarda como ${formatoTelefonoAR(telefono)}. ` : ''}Con este número le va a llegar un WhatsApp con el link de cada trabajo.</p>
              )}
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                <input type="checkbox" checked={optin} onChange={e => { setOptin(e.target.checked); setErrorAccion('') }} style={{ width: 20, height: 20, flexShrink: 0, marginTop: 1 }} />
                Confirmo que este proveedor aceptó recibir avisos de trabajo por WhatsApp
              </label>
              {errorAccion && <p style={{ fontSize: 10, color: '#f87171', marginTop: -4 }}>{errorAccion}</p>}
              <PrimaryBtn onClick={agregar} disabled={saving}>{saving ? 'Guardando...' : 'Agregar'}</PrimaryBtn>
            </div>
          </Card>
        </div>
      )}

      {(() => {
        // Mínimo de proveedores por rubro: así, si uno dice "no puedo", la app le pasa el trabajo a otro sola
        const conteo = {}
        for (const p of proveedores) conteo[p.especialidad] = (conteo[p.especialidad] || 0) + 1
        const rubros = Object.keys(conteo).filter(r => r !== RUBRO_SIN_MINIMO)
        const incompletos = rubros.filter(r => conteo[r] < cob.min)
        if (!rubros.length) return null
        return (
          <div style={{ padding: '0 20px 12px' }}>
            <Card style={{ padding: 14, borderColor: incompletos.length ? 'rgba(251,191,36,0.35)' : 'rgba(52,211,153,0.3)' }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: incompletos.length ? '#fbbf24' : '#34d399' }}>
                {incompletos.length ? `⚠️ Te faltan proveedores de respaldo (mínimo ${cob.min} por rubro)` : `✓ Todos los rubros tienen al menos ${cob.min} proveedores`}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {rubros.map(r => (
                  <button key={r} onClick={() => { setEspecialidad(r); setShowForm(true) }} style={{ fontSize: 10.5, fontWeight: 700, padding: '5px 10px', borderRadius: 999, border: `1px solid ${conteo[r] < cob.min ? 'rgba(251,191,36,0.4)' : 'var(--border)'}`, background: conteo[r] < cob.min ? 'rgba(251,191,36,0.08)' : 'transparent', color: conteo[r] < cob.min ? '#fbbf24' : 'var(--text-muted)' }}>
                    {r} {conteo[r]}/{cob.min}{conteo[r] < cob.min ? ' · cargar' : ''}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.4 }}>Sin el mínimo no se pueden derivar trabajos de ese rubro. Si un proveedor dice "no puedo", la app le asigna el trabajo sola a otro del mismo rubro y te avisa.</p>
            </Card>
          </div>
        )
      })()}

      <div className="grid-auto" style={{ padding: '0 20px' }}>
        {errorCarga && (
          <Card style={{ textAlign: 'center', padding: '20px' }}>
            <p style={{ fontSize: 12, color: '#f87171', fontWeight: 600 }}>{errorCarga}</p>
          </Card>
        )}
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, padding: '30px 0' }}>Cargando...</p>
        ) : proveedores.map((p, i) => (
          <Card key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--border)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="font-cormorant" style={{ fontSize: 20, color: '#D9CBB0', fontWeight: 600 }}>{i + 1}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{p.nombre}</p>
              <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>{p.especialidad} · {formatoTelefonoAR(p.telefono)}</p>
              {p.whatsapp_optout_at
                ? <p style={{ fontSize: 10, color: '#f87171', marginTop: 2 }}>🔕 Pidió BAJA de WhatsApp (puede reactivar respondiendo ALTA)</p>
                : p.whatsapp_optin_at
                  ? <p style={{ fontSize: 10, color: '#34d399', marginTop: 2 }}>✓ WhatsApp autorizado</p>
                  : <button onClick={() => registrarConsentimiento(p)} style={{ fontSize: 10, color: '#E0B05E', textDecoration: 'underline', marginTop: 2, textAlign: 'left' }}>Sin consentimiento de WhatsApp · registrarlo</button>}
              {/* Ranking bar — visible solo al admin */}
              <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2 }}>
                  <div style={{ width: `${p.ranking || 0}%`, height: '100%', background: 'var(--border-strong)', borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>{p.ranking || 0}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              <button onClick={() => cambiarRanking(p.id, 10)} style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.15)', color: '#34d399', fontSize: 14 }}>↑</button>
              <button onClick={() => cambiarRanking(p.id, -10)} style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.12)', color: '#f87171', fontSize: 14 }}>↓</button>
            </div>
            <button onClick={() => eliminar(p.id)} style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.1)', color: 'rgba(248,113,113,0.5)', fontSize: 14, flexShrink: 0 }}>×</button>
          </Card>
        ))}
      </div>
    </div>
  )
}
