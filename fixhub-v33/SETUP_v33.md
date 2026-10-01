# FixHub v33 — Qué cambió y cómo ponerlo en marcha

## El flujo nuevo (el que definió tu socio)
1. **Vecino reporta**: categoría → problema → urgencia, descripción, foto/video corto (hasta 4 archivos, video ≤ 60 s, ≤ 30 MB) y teléfono opcional. Ya no elige proveedor.
2. **Filtro del administrador**: le llega una push y una tarjeta: *"Consorcio X - Depto 3B: Fuga de gas en cocina. Urgencia: Alta"* con dos botones grandes: **Autorizar y Derivar** (elige proveedor) o **Rechazar / Pedir más info** (con motivo; el vecino lo ve y puede responder).
3. **Autorización automática (opcional)**: Más → *Autorización automática*. Por edificio: monto máximo, horario hábil, días hábiles, costo estimado por rubro y "urgencia ALTA se deriva directo". Fuera de las reglas (de noche, monto alto, sin proveedor) frena y te pide OK.
4. **Proveedor sin usuario ni contraseña**: al autorizar, se genera un link personal (vence a las 72 h, se invalida al reenviar/reasignar). Se manda por WhatsApp (si configurás la plantilla) y vos también podés enviarlo/copiarlo. Con un toque entra y ve dirección, contacto del vecino, descripción y fotos/video. Botones: **Aceptar trabajo / Voy en camino** o **No puedo ir** (pasa al siguiente proveedor si fue automático, o vuelve a vos).
5. **Finalizar**: monto + remito firmado (foto/PDF) o foto de cómo quedó.
6. **Cierre**: vecino y admin confirman → **Cerrado**. Queda en *Más → Historial de gastos*, con total por mes, por categoría y planilla CSV para expensas y consejo.

Los estados ya no se cambian a mano: los controla el servidor, así nadie puede saltarse pasos.

## Lo que pediste además
- **Validaciones**: contraseña (8+, letras y números), nombres, teléfonos, montos, archivos (tipo, peso, duración), largos máximos, duplicados; y las mismas reglas del lado del servidor (CHECK en la base).
- **Eliminar cuenta**: Configuración → *Eliminar mi cuenta* (escribir ELIMINAR) + página pública `/eliminar-cuenta.html` (la piden Google Play y App Store).
- **Términos y condiciones**: checkbox obligatorio al registrarse, pantalla de aceptación para cuentas existentes, versión y fecha guardadas.
- **Seguridad** (ver abajo).

## Pasos para activarlo (en este orden)
1. **Supabase → SQL Editor → New query** → pegá todo `supabase_migration_v33.sql` → Run. Se puede correr más de una vez.
2. **Netlify → Site configuration → Environment variables**. Agregá/revisá:
   - `SUPABASE_URL` (la URL de tu proyecto) y `SUPABASE_ANON_KEY` (la clave *anon/publishable*) — **nuevas**, las usan las funciones.
   - `SUPABASE_SERVICE_ROLE_KEY` (ya la tenías; nunca en el código del navegador).
   - `SITE_URL` = la URL pública de la app (ej. `https://tuapp.netlify.app`), para armar los links.
   - **`INTERNAL_FUNCTION_SECRET`: generá uno nuevo y reemplazalo.** El anterior estaba escrito en `SETUP_SEGURIDAD.md` dentro del proyecto; ya lo saqué del archivo, pero si ese zip se subió a un repositorio o se compartió, considerá ese valor filtrado. Hay que actualizar también el cron `scheduled-notifications` si lo usa.
   - WhatsApp (opcional): `WHATSAPP_TEMPLATE_LINK_NAME` = nombre de una plantilla aprobada en Meta con **una variable {{1}}** para el link. Sin esto, el link igual se puede enviar con el botón "Enviar por WhatsApp" de la tarjeta.
3. **Supabase → Authentication**: activá *Leaked password protection* y revisá que el registro exija confirmar el mail.
4. Subí el proyecto a Netlify (Deploy). Ojo: `netlify.toml` usa `base = "fixhub-v33"`; si tu repo mantiene la carpeta con otro nombre, ajustalo.
5. Completá los `[COMPLETAR ...]` de `privacidad.html` y `eliminar-cuenta.html` (email de contacto, razón social). **Pedile a un abogado que revise Términos y Privacidad** antes de publicar en tiendas.

## Seguridad: qué se corrigió
Las reglas anteriores tenían agujeros graves. Ahora:
- El PIN del admin **ya no se puede leer** desde el navegador (columna bloqueada) y se verifica en el servidor con freno de 5 intentos / 15 min.
- Nadie puede hacerse `infra` ni admin escribiendo en `perfiles` (antes se podía): ahora solo se vincula con funciones que validan código/PIN.
- Cada rol ve solo lo suyo: el vecino solo sus reportes; el proveedor solo sus trabajos (y del vecino solo nombre, unidad y teléfono de contacto mientras el trabajo está activo); el admin solo sus edificios. Los vecinos ya no ven la lista de proveedores.
- Fotos, videos y remitos van a un bucket **privado** (`adjuntos`) con links temporales; antes eran públicos y cualquiera podía subir.
- `send-push` quedó solo interno y `send-whatsapp` cerrado; las notificaciones salen por `notificar`, que decide los destinatarios en el servidor. Ya no viajan teléfonos ni tokens por el navegador.
- Cabeceras de seguridad (HSTS, anti-iframe, etc.). La CSP está en modo *solo reportar*: probá la app con la consola abierta y, si no hay bloqueos legítimos, renombrala a `Content-Security-Policy`.

## Probalo antes de publicar (checklist)
- [ ] Vecino: reportar con foto y video → al admin le llega la tarjeta.
- [ ] Admin: Autorizar y Derivar → copiar/enviar el link.
- [ ] Abrir el link **en otro navegador o celular**: entra sin contraseña y ve el trabajo. Aceptar → al admin y al vecino les llega aviso.
- [ ] "No puedo ir" (con y sin regla automática).
- [ ] Finalizar con monto + foto → confirmar como vecino y como admin → aparece en el Historial.
- [ ] Rechazar y Pedir más info → el vecino ve el motivo y puede responder.
- [ ] Activar reglas automáticas y mandar un reporte que las cumpla (y uno de noche).
- [ ] Eliminar cuenta de prueba de cada rol.
- [ ] Iniciar sesión como INFRA y crear un edificio.

## Cosas que conviene saber
- La migración la probé en un Postgres local que simula Supabase (con tus migraciones anteriores), incluyendo intentos de ataque (vecino que quiere cambiar su fase, intruso que lee reportes o sube archivos, proveedor ajeno). **No la corrí contra tu Supabase real**: si da error, mandame el mensaje exacto.
- Las funciones de Netlify (links, notificaciones, eliminar cuenta) las revisé de sintaxis pero no las ejecuté contra servicios reales (Supabase Auth, Firebase, WhatsApp): hay que probarlas con el checklist.
- Las fotos viejas del chat (bucket público anterior) se siguen viendo; las nuevas van al bucket privado.
- El vecino ya no puede elegir proveedor, y se quitó el botón "Servicios" del inicio del vecino.
- Un proveedor que entra por link queda con una sesión propia en ese dispositivo; solo ve sus trabajos. Si pierde el celular, el admin puede usar *Cambiar proveedor* o desvincular la cuenta.
