import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { PalaceFrame, OrnamentLine, DiamondRow, Card, AccentCard, StatusBadge, BottomNav, SectionLabel, SkeletonCard, NotifBanner, ActionBtn } from '../components/Palace'

function getSaludo() {
  const h = new Date().getHours()
  if (h >= 6 && h < 13) return 'Buenos días'
  if (h >= 13 && h < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function HomeVecino({ user }) {
  const navigate = useNavigate()
  const [avisos, setAvisos] = useState([])
  const [anuncios, setAnuncios] = useState([])
  const [emergencias, setEmergencias] = useState([])
  const [loading, setLoading] = useState(true)
  const [notif, setNotif] = useState(null)

  useEffect(() => {
    const fetch = async () => {
      const ahora = new Date().toISOString()
      const [avRes, anRes, emRes] = await Promise.all([
        supabase.from('avisos').select('*').eq('vecino_id', user.id).order('created_at', { ascending: false }).limit(3),
        supabase.from('anuncios').select('*').eq('edificio_id', user.edificio.id).lte('fecha_publicacion', ahora).order('created_at', { ascending: false }).limit(2),
        supabase.from('emergencias').select('*').eq('edificio_id', user.edificio.id).limit(4),
      ])
      setAvisos(avRes.data || [])
      setAnuncios(anRes.data || [])
      setEmergencias(emRes.data || [])
      setLoading(false)
    }
    fetch()
    const channel = supabase.channel(`notif-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'avisos', filter: `vecino_id=eq.${user.id}` },
        payload => {
          const labels = { en_curso: 'En curso', resuelto: 'Resuelto' }
          if (labels[payload.new.estado]) {
            setNotif(`Tu aviso pasó a "${labels[payload.new.estado]}"`)
            setTimeout(() => setNotif(null), 5000)
          }
          setAvisos(prev => prev.map(a => a.id === payload.new.id ? payload.new : a))
        })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user.id])

  return (
    <div className="page page-enter">
      <PalaceFrame />
      {notif && <NotifBanner message={notif} onClose={() => setNotif(null)} />}
      <div style={{ position: 'relative', padding: '52px 20px 24px', textAlign: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(180deg,rgba(224,176,94,0.05) 0%,transparent 100%)', borderBottomLeftRadius: '50% 20px', borderBottomRightRadius: '50% 20px', pointerEvents: 'none' }}/>
        <p className="animate-ornament" style={{ fontSize: 9, letterSpacing: '0.45em', color: 'rgba(224,176,94,0.45)', marginBottom: 8, fontWeight: 600 }}>✦ ✦ ✦</p>
        <p style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 4, fontWeight: 600 }}>{getSaludo()}</p>
        <h1 className="font-serif" style={{ fontSize: 30, color: 'var(--text-primary)', lineHeight: 1.05 }}>{user.nombre.split(' ')[0]}.</h1>
        <p style={{ fontSize: 9.5, color: 'var(--text-faint)', letterSpacing: '0.1em', marginTop: 4, fontWeight: 500 }}>Depto {user.departamento} · {user.edificio.nombre}</p>
        <div style={{ marginTop: 14 }}><OrnamentLine /></div>
      </div>

      {anuncios.length > 0 && (
        <div style={{ padding: '0 20px 16px' }}>
          <SectionLabel style={{ marginBottom: 9 }}>Tablón</SectionLabel>
          {anuncios.map(a => (
            <AccentCard key={a.id} accentColor={a.prioridad === 'urgente' ? '#f87171' : 'rgba(224,176,94,0.4)'} style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700 }}>{a.titulo}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>{a.contenido}</p>
            </AccentCard>
          ))}
        </div>
      )}

      <div style={{ padding: '0 20px 20px' }}>
        <SectionLabel style={{ marginBottom: 11 }}>Acceso rápido</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <ActionBtn label="Reportar" sub="Nuevo aviso" onClick={() => navigate('/aviso')} />
          <ActionBtn label="Servicios" sub="Categorías y proveedores" onClick={() => navigate('/servicios')} />
          <ActionBtn label="Mis avisos" sub="Historial" onClick={() => navigate('/avisos')} />
          <ActionBtn label="Tablón" sub="Novedades del edificio" onClick={() => navigate('/tablon')} />
          <ActionBtn label="Chat con el admin" sub="Mensaje privado" onClick={() => navigate('/chat-admin')} />
        </div>
      </div>

      {emergencias.length > 0 && (
        <div style={{ padding: '0 20px 16px' }}>
          <SectionLabel style={{ marginBottom: 9 }}>Emergencias</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {emergencias.map(e => (
              <a key={e.id} href={`tel:${e.telefono}`} style={{ display: 'block', textDecoration: 'none', background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.14)', borderRadius: 14, padding: '12px 14px' }}>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 3 }}>{e.nombre}</p>
                <p style={{ fontSize: 14, color: '#f87171', fontFamily: "'DM Serif Display',serif" }}>{e.telefono}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '0 20px 4px' }}><DiamondRow count={3} opacity={0.11} /></div>

      <div style={{ padding: '12px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <SectionLabel>Últimos avisos</SectionLabel>
          <button onClick={() => navigate('/avisos')} style={{ fontSize: 9, color: 'rgba(224,176,94,0.55)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>Ver todos →</button>
        </div>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><SkeletonCard /><SkeletonCard lines={1} /></div>
        ) : avisos.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '22px' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Sin avisos recientes</p>
            <button onClick={() => navigate('/aviso')} style={{ marginTop: 8, fontSize: 10, color: 'rgba(224,176,94,0.55)', fontWeight: 700 }}>Crear aviso →</button>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {avisos.map(a => {
              const stateIdx = ['nuevo', 'en_curso', 'resuelto'].indexOf(a.estado)
              return (
                <AccentCard key={a.id} onClick={() => navigate(`/chat/${a.id}`)} accentColor={a.estado === 'nuevo' ? '#f87171' : a.estado === 'en_curso' ? '#fbbf24' : '#34d399'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700, flex: 1, minWidth: 0, marginRight: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titulo}</p>
                    <StatusBadge estado={a.estado} />
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['nuevo', 'en_curso', 'resuelto'].map((e, i) => (
                      <div key={e} style={{ flex: 1, height: 3, borderRadius: 999, background: i <= stateIdx ? (e === 'resuelto' ? 'rgba(52,211,153,0.65)' : e === 'en_curso' ? 'rgba(251,191,36,0.6)' : 'rgba(248,113,113,0.55)') : 'rgba(255,255,255,0.06)' }} />
                    ))}
                  </div>
                </AccentCard>
              )
            })}
          </div>
        )}
      </div>
      <div style={{ padding: '14px 20px 0', textAlign: 'center' }}>
        <button onClick={() => navigate('/guia')} style={{ fontSize: 9, color: 'var(--text-faint)', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600 }}>Ver guía →</button>
      </div>
    </div>
  )
}
