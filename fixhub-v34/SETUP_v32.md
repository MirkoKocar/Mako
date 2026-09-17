# FixHub v32 — Qué hacer para que esta versión funcione

Esta versión trae cambios de funcionalidad (no solo seguridad como las
anteriores). Hay 2 configuraciones externas que **tenés que hacer vos en
Supabase**, sin las cuales el login con Google y el código por mail no van
a andar. El resto es aplicar un SQL y ya.

---

## PASO 1 — Correr el SQL nuevo

Supabase → SQL Editor → pegar y correr `supabase_migration_v32.sql` (agrega
las columnas de doble confirmación, presupuesto, y aviso al tablón). Es
seguro correrlo en cualquier momento, no toca nada de lo que ya había.

---

## PASO 2 — Código de verificación por mail (en vez del link roto)

Ahora, al crear una cuenta, la persona recibe un **código de 6 dígitos**
que escribe directo en la app — no un link que abre una página aparte.
Para que el mail realmente traiga ese código (y no el link viejo), hay que
tocar la plantilla en Supabase:

1. Supabase → **Authentication** → **Email Templates** → **Confirm signup**.
2. Buscá en el cuerpo del mail donde dice algo como:
   `<a href="{{ .ConfirmationURL }}">Confirm your email</a>`
3. Reemplazalo (o agregalo al lado) por el código en texto plano:
   `Tu código de verificación es: {{ .Token }}`
4. Guardá los cambios.

Con eso, el mail va a traer el código de 6 dígitos y la pantalla nueva de
la app ("Confirmar cuenta") lo va a validar sin salir nunca de la
aplicación.

---

## PASO 3 — Habilitar "Continuar con Google"

Este paso tiene dos partes: una en Google, otra en Supabase.

### En Google Cloud Console
1. Andá a https://console.cloud.google.com/ → creá un proyecto (o usá uno existente).
2. **APIs y servicios** → **Pantalla de consentimiento OAuth** → completala con el nombre de la app (FixHub) y tu email de contacto.
3. **Credenciales** → **Crear credenciales** → **ID de cliente de OAuth** → tipo **Aplicación web**.
4. En **Orígenes de JavaScript autorizados** agregá la URL de tu sitio (por ejemplo `https://tu-sitio.netlify.app`).
5. En **URI de redireccionamiento autorizados** agregá:
   `https://qrxkrqfcltdoaqsggwal.supabase.co/auth/v1/callback`
6. Guardá y copiá el **Client ID** y el **Client Secret** que te da Google.

### En Supabase
1. Supabase → **Authentication** → **Providers** → **Google**.
2. Activalo, y pegá ahí el **Client ID** y **Client Secret** del paso anterior.
3. Guardar.

Con esto, el botón "Continuar con Google" que ya está en el código va a
funcionar solo — no hace falta tocar nada más de la app.

> Si por ahora no te interesa activar Google, no pasa nada: el botón
> simplemente va a mostrar un error si alguien lo toca, pero el resto del
> login (email + contraseña) sigue funcionando normal.

---

## Todo lo que cambió en esta versión

### 1. Doble confirmación para marcar un reclamo como "Completo"
Antes el admin decidía solo si un reclamo estaba resuelto. Ahora, tanto el
**vecino que reportó** como el **administrador** tienen un botón grande
"Marcar como resuelto" arriba del chat. Cuando uno lo toca, queda en
"1/2" y le llega una notificación al otro avisándole que falta su
confirmación. Recién cuando los dos tocaron el botón, el reclamo pasa a
Completo de verdad. El proveedor no ve este botón — no le corresponde
decidir esto.

### 2. Presupuesto obligatorio antes de completar
Se agregó un campo de presupuesto que carga el **proveedor**, visible
arriba del chat. Mientras no lo cargue, el vecino y el admin ven un aviso
en amarillo/rojo explicando que hace falta el presupuesto, y el botón de
"Marcar como resuelto" queda deshabilitado hasta que el proveedor lo
complete. El proveedor puede salir del chat sin cargarlo, pero cada vez
que vuelva a entrar va a ver el recordatorio de nuevo.

**Una idea que se me ocurrió y podés considerar para más adelante:** si en
algún momento quieren cobrar comisión sobre los trabajos, tener el
presupuesto cargado en el sistema ya deja la base armada para eso — se
podría sumar más adelante un campo de "presupuesto aprobado por el
vecino/admin" antes de que el proveedor arranque el trabajo, a modo de
mini-cotización. Lo dejo solo como idea, no lo implementé porque no lo
pediste.

### 3. Aviso al Tablón desde el reporte
Al reportar un problema, el vecino ahora tiene un check opcional "Avisar
también en el Tablón". Si lo marca, se publica automáticamente un aviso
para todo el edificio con el texto: *"El vecino del departamento X reporta
este problema en su departamento/en el edificio: '...'. La resolución ya
está en curso — este aviso es solo para que estén al tanto, no hace falta
que hagan nada."* Si el problema es de una categoría del edificio en
general (Ascensor, Limpieza, Seguridad, Estructura) dice "en el edificio";
si es de una categoría más personal (Plomería, Electricidad, Gas,
Internet) dice "en su departamento".

### 4. Bug del reporte sin proveedores disponibles — corregido
Antes, si no había proveedores cargados en una categoría, aparecían 3
botones confusos y uno de ellos ("Ver mis avisos") dejaba un reclamo
fantasma con un chat vacío sin nadie del otro lado. Ahora:
- La flecha de "Volver" arriba es instantánea — va un paso atrás sin
  tocar la base de datos ni hacerte esperar.
- Se sacó el botón "Ver mis avisos" por completo.
- Queda un solo botón de salida real, "Cancelar este reporte", que ahora
  es mucho más rápido (navega al instante y borra en segundo plano) y te
  lleva directo a la pantalla de "Nuevo reporte" con todas las categorías,
  no a mitad de camino.
- Como beneficio extra: si volvés atrás para editar la descripción o la
  urgencia antes de elegir proveedor, ya no se crea un reporte duplicado —
  edita el mismo reporte que ya habías empezado.

### 5. Depto/lote estructurado, para evitar cargas "trolls"
Al registrarse, el vecino ahora elige entre 3 opciones:
- **Depto**: pide el piso (solo números) y la unidad (solo letras) por
  separado — no se puede enviar si falta alguno de los dos, ni si tienen
  caracteres inválidos.
- **Lote**: pide el número de lote (solo números), pensado para barrios
  cerrados.
- **Otro**: campo libre, para el caso de que el edificio no use ninguno
  de los dos formatos anteriores.

### 6. Login más fluido
- Ya no se pide nombre y apellido al crear la cuenta (se pide una sola vez,
  más adelante, junto con el código del edificio) — antes se preguntaba dos
  veces.
- La confirmación de cuenta es con código de 6 dígitos en vez de un link
  que rompía (ver Paso 2 arriba).
- Se agregó el botón "Continuar con Google" (ver Paso 3 arriba).

---

## Cosas para probar después de aplicar todo esto

1. Reportar un problema en una categoría sin proveedores — confirmar que
   "Volver" es instantáneo y que "Cancelar" te lleva a las categorías.
2. Reportar un problema y tocar "Avisar también en el Tablón" — confirmar
   que aparece la publicación en el Tablón de otros vecinos.
3. Como proveedor: entrar al chat de un aviso asignado y cargar un
   presupuesto — confirmar que el aviso rojo desaparece.
4. Como vecino y como admin (en dos dispositivos o dos pestañas): marcar
   "Resuelto" desde un lado, confirmar que aparece "1/2" y que le llega la
   notificación al otro; marcarlo también del otro lado y confirmar que
   pasa a Completo.
5. Crear una cuenta nueva de prueba y confirmar que llega el código de 6
   dígitos (una vez aplicado el Paso 2) en vez del link roto.
6. Probar "Continuar con Google" (una vez aplicado el Paso 3).
7. Registrarse como vecino nuevo probando los 3 tipos de unidad (Depto,
   Lote, Otro) y confirmar que no te deja avanzar con datos incompletos o
   inválidos.
