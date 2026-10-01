import React, { useEffect, useState } from 'react'
import { urlFirmada } from '../lib/adjuntos'
import { FileText } from 'lucide-react'

function Item({ a }) {
  const [url, setUrl] = useState(null)
  const [falla, setFalla] = useState(false)
  useEffect(() => { let vivo = true; urlFirmada(a.path).then(u => { if (!vivo) return; u ? setUrl(u) : setFalla(true) }); return () => { vivo = false } }, [a.path])
  const caja = { width: '100%', aspectRatio: '1', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }
  if (falla) return <div style={caja}><p style={{ fontSize: 9, color: 'var(--text-faint)' }}>No disponible</p></div>
  if (!url) return <div style={caja} className="skeleton" />
  if ((a.tipo || '').startsWith('video/')) return <video src={url} controls playsInline preload="metadata" style={{ ...caja, objectFit: 'cover' }} />
  if (a.tipo === 'application/pdf') return <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...caja, flexDirection: 'column', gap: 6, textDecoration: 'none' }}><FileText size={22} color="#E0B05E"/><span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Abrir PDF</span></a>
  return <a href={url} target="_blank" rel="noopener noreferrer" style={caja}><img src={url} alt="Adjunto" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></a>
}

export default function Adjuntos({ items = [], titulo }) {
  if (!items?.length) return null
  return (
    <div style={{ marginTop: 10 }}>
      {titulo && <p style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 700, marginBottom: 6 }}>{titulo}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {items.map((a, i) => <Item key={a.path || i} a={a} />)}
      </div>
    </div>
  )
}

export function ImagenChat({ src }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { let vivo = true; urlFirmada(src).then(u => vivo && setUrl(u)); return () => { vivo = false } }, [src])
  if (!url) return <div className="skeleton" style={{ width: '100%', height: 120, borderRadius: 12 }} />
  return <img src={url} alt="Foto adjunta" style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 12 }} />
}
