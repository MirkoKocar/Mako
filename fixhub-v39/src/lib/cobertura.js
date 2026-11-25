// Cobertura de proveedores por rubro: cuántos hay cargados de cada especialidad y cuántos exige el edificio como mínimo
// (por defecto 2: así, si uno dice "no puedo", siempre hay otro de respaldo). El servidor vuelve a chequear al derivar.
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export const MIN_POR_DEFECTO = 2
export const RUBRO_SIN_MINIMO = 'Otro'
const cache = new Map()   // edificioId -> { t, data }  (30 s, para no repetir la consulta en cada tarjeta)

export function invalidarCobertura(edificioId) { cache.delete(edificioId) }

async function pedir(edificioId) {
  const [{ data: ps }, { data: ed }] = await Promise.all([
    supabase.from('proveedores').select('especialidad').eq('edificio_id', edificioId).is('eliminado_at', null).limit(500),
    supabase.from('edificios').select('min_proveedores_especialidad').eq('id', edificioId).limit(1),   // si la parte 6 del SQL no está, devuelve error y queda el valor por defecto
  ])
  const porRubro = {}
  for (const p of ps || []) porRubro[p.especialidad] = (porRubro[p.especialidad] || 0) + 1
  return { porRubro, min: ed?.[0]?.min_proveedores_especialidad ?? MIN_POR_DEFECTO }
}

export function useCobertura(edificioId) {
  const [d, setD] = useState(() => cache.get(edificioId)?.data || { porRubro: {}, min: MIN_POR_DEFECTO, listo: false })
  useEffect(() => {
    if (!edificioId) return
    const c = cache.get(edificioId)
    if (c && Date.now() - c.t < 30000) { setD(c.data); return }
    let vivo = true
    pedir(edificioId).then(data => { const x = { ...data, listo: true }; cache.set(edificioId, { t: Date.now(), data: x }); if (vivo) setD(x) }).catch(() => {})
    return () => { vivo = false }
  }, [edificioId])
  return d
}

// ¿A este rubro le faltan proveedores para llegar al mínimo?  { n, min, falta, sinNinguno }
export function estadoRubro(cob, rubro) {
  const n = cob.porRubro[rubro] || 0
  const exige = rubro !== RUBRO_SIN_MINIMO
  return { n, min: cob.min, falta: exige ? Math.max(0, cob.min - n) : 0, sinNinguno: exige && n === 0 }
}
