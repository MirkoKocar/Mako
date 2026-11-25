// Teléfonos argentinos -> E.164 con el 9 de los celulares: +549 + área + número (10 dígitos después del 549).
// Acepta: "11 2233-4455", "011 15 2233 4455", "+54 9 11 2233 4455", "5411...", "549 11...", "(0221) 15-555-1234", etc.
// Devuelve null si no se puede interpretar como un celular argentino.
function normalizarTelefonoAR(entrada) {
  let d = String(entrada ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('54')) {
    d = d.slice(2)
    if (d.startsWith('9')) d = d.slice(1)
  }
  if (d.startsWith('0')) d = d.slice(1)               // 0 del prefijo interurbano
  if (d.length === 12) {                              // sobra el "15" del celular: área (2 a 4 dígitos) + 15 + número
    for (const largoArea of [2, 3, 4]) {
      if (d.slice(largoArea, largoArea + 2) === '15') {
        const sin = d.slice(0, largoArea) + d.slice(largoArea + 2)
        if (sin.length === 10) { d = sin; break }
      }
    }
  }
  if (d.length !== 10 || !/^[1-3]/.test(d)) return null   // los códigos de área argentinos empiezan con 1, 2 o 3
  return '549' + d                                    // sin el "+": se guarda así en la base; el driver le agrega el "+"
}

const aE164 = (n) => { const t = normalizarTelefonoAR(n); return t ? '+' + t : null }

module.exports = { normalizarTelefonoAR, aE164 }
