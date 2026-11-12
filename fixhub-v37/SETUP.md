# FixHub v36 — puesta en marcha

## 1. Supabase (SQL Editor → New query → pegar → Run)
Si ya tenías la v35 andando, **solo falta la parte 4**:
- `supabase_4_calificaciones.sql` (calificaciones, "resuelto por privado" y remito opcional)

Si arrancás de cero, corré las 4 en orden: `supabase_1_…`, `supabase_2_…`, `supabase_3_…`, `supabase_4_…`.
Para saber si ya pegaste la 4: `select exists(select 1 from pg_proc where proname='fh_calificar');` → `true` = ya está.

## 2. Netlify
Subí el contenido del zip. Variables que tienen que estar: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (+ las de Firebase).

## 3. Textos legales
Completá los `[COMPLETAR ...]` de `public/privacidad.html` y `public/eliminar-cuenta.html`. Que un abogado revise Términos y Privacidad.
Redes sociales: en `src/pages/Auth.jsx`, arriba, pegá tus enlaces en `REDES` (campo `url`).

## 4. Probar
- [ ] Login: sin botón de Google, con redes y términos; en PC, tablet y celular.
- [ ] Vecino: reporte sin pedir teléfono; accesos rápidos (el 5º centrado).
- [ ] Admin con un rubro SIN proveedores: Autorizar y Derivar → "Cargar proveedor" (vuelve a la tarjeta) y "Pasarle el número al vecino".
- [ ] Proveedor: Finalizar sin foto → sale el aviso "¿Seguro?" → Subir ahora / Finalizar sin foto.
- [ ] Vecino: al confirmar 1/2 puede dar estrellas y reseña; el siguiente vecino con ese proveedor ve las reseñas.

## 5. Lo que queda preparado para lo último
**WhatsApp al proveedor** — el código ya está conectado (`netlify/functions/notificar.js` y `lib/common.js`). Se activa solo al cargar en Netlify:
`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_LINK_NAME` (plantilla con una variable {{1}} para el link) y `WHATSAPP_TEMPLATE_NAME` (plantilla simple "tenés una novedad"). Hoy avisa por WhatsApp cuando se le asigna un trabajo (con el link) y cuando le escriben y no tiene notificaciones activas. Falta: crear la cuenta de WhatsApp Business en Meta y aprobar las 2 plantillas, y un recordatorio automático de "marcá como finalizado" (se agrega en `scheduled-notifications.js`).
**Play Store** — la app ya es instalable (PWA). Falta la cuenta de desarrollador de Google (pago único) y empaquetarla.
**Notificaciones a todos** — las notificaciones ya salen por el servidor; falta verificar el registro de dispositivos de cada rol en celulares reales.

## Nota sobre autorización automática
Se quitó del menú del admin. Las tablas y funciones quedan en la base, inactivas (sin reglas cargadas no se autoriza nada solo).
