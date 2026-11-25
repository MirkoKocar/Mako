// npm run probar-whatsapp -- 11 2233 4455
// Manda UN WhatsApp de prueba con el mismo código que usa la app (plantilla "recordatorio_trabajo").
// En sandbox (TWILIO_SANDBOX=true) el celular tiene que haberse unido antes mandando "join <palabra>" al número del sandbox.
// Lee el archivo .env (si existe) sin librerías. Las variables del sistema tienen prioridad.
const fs = require('fs')
const path = require('path')
function cargarEnv() {
  const f = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(f)) return false
  for (const linea of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m || linea.trim().startsWith('#')) continue
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return true
}
cargarEnv()
const numero = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ')
if (!numero) { console.log('Uso: npm run probar-whatsapp -- 11 2233 4455'); process.exit(1) }
const { aE164 } = require('../netlify/functions/lib/common')
const e164 = aE164(numero)
if (!e164) { console.log('❌ No entiendo ese número como celular argentino. Probá con código de área: 11 2233 4455'); process.exit(1) }
const { enviarPlantilla, proveedorActivo } = require('../netlify/functions/lib/whatsapp')
console.log(`Enviando por ${proveedorActivo()} a ${e164} …`)
enviarPlantilla({ numero, plantilla: 'recordatorio_trabajo', variables: ['Prueba', 'Prueba de conexión'], sufijoBoton: 'PRUEBA' })
  .then(r => { if (r.ok) console.log(`✅ Enviado. SID: ${r.sid}\n   Si no te llega: mirá Twilio → Monitor → Logs → Messaging, y que el número esté unido al sandbox / la plantilla aprobada.`); else { console.log('❌ No se pudo enviar: ' + r.error); process.exitCode = 1 } })
