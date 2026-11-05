# Control de Personal B2/B2B

App web para pase de lista por turno, cobertura por área y posición (áreas descubiertas), y fichas del personal con celular y certificaciones.

- **Página:** estática, hospedada en GitHub Pages (`index.html`, `app.js`, `config.js`).
- **Datos:** Supabase (Postgres) con inicio de sesión. Este repositorio **no contiene datos del personal**.

## Secciones

El menú está agrupado en las tres áreas que administra la app: **Personal** (Cobertura, Pase de lista, Personal, Movimientos, Vacaciones, Tiempo extra, Reportes), **Herramental** (equipos y su checklist) y **Limpieza y 5S** (checklist de las áreas), más **Administración** (Catálogos, Usuarios).

- **Cobertura, Pase de lista, Personal:** operación diaria.
- **Reportes:** *Resumen* (asistencia, ausentismo, faltas y retardos, sin registrar; gráficas por día, turno y agrupación por posición, área, sitio, gerente o supervisor; cobertura de posiciones por día; personas con más ausencias) y *Reportes* descargables en Excel o CSV (resumen por día y turno, asistencia detallada, ausentismo por persona, cobertura por día, plantilla, certificaciones). Periodo por día, semana o rango de hasta 62 días.
- **Movimientos:** cambio de supervisor con aprobación.
  - *Pase:* el supervisor actual pasa a una persona a otro supervisor; aprueba quien la recibe.
  - *Solicitud:* un supervisor pide a una persona de otro equipo; aprueba el supervisor actual.
  - Al aprobar, la persona cambia de supervisor y toma el gerente del nuevo. Quien lo pidió puede cancelarlo mientras está pendiente. Todo queda en el historial y en *Reportes → Cambios de supervisor*.
  - El supervisor de una persona ya no se cambia desde la ficha: solo por un movimiento aprobado o por quien tenga el permiso *gestionar movimientos* (gerencia) (lo valida la base, `supabase/movimientos.sql`).
- **Vacaciones y descansos:** asignar vacaciones y registrar *descanso laborado* (la persona trabaja su día de descanso) con su descanso compensatorio. **Control RBA:** lista a quien lleva 5 o más días seguidos trabajando (máximo 6 sin descanso). En el pase de lista se ven las vacaciones y descansos programados, y "Marcar pendientes" pone V a quien tiene vacaciones.
- **Tiempo extra:** registro de horas extra por persona y día. Límites por turno (jornada, máximo por día y por semana; iniciales LFT: 3 h/día, 9 h/semana) y tope semanal RBA de 60 h (jornada + T.E.), que la base de datos aplica al registrar (`supabase/tiempo_extra.sql`). *Recurso a considerar para T.E.*: quien asistió, sin vacaciones, con menos de 6 días seguidos y con horas disponibles, empezando por quien lleva menos; también aparece en Cobertura bajo cada posición descubierta. Aviso al llegar al máximo semanal.
- **Avisos** (campana en la barra): al administrador, al gerente y al supervisor a cargo cuando se asignan vacaciones, se registra un descanso laborado o alguien llega a 6 días seguidos trabajando (lo genera la base, `supabase/vacaciones_rba_back.sql`).
- **Back:** cada supervisor asigna en Pase de lista el correo de su suplente; ese back puede pasar lista a su equipo y programar sus vacaciones (lo valida la base).
- **Cobertura:** filtro por supervisor; por defecto muestra *Mi personal* (equipos de los que eres supervisor o back); con *Todos* ves el área completa.
- **Catálogos:** perfiles, certificaciones, **supervisores** (cada uno ligado por correo a su cuenta, que es la que aprueba), áreas, sitios, gerentes y turnos.
- **Herramental** (antes *Equipos*: transpaletas eléctricas y estándar, montacargas y herramientas): *Tablero* (disponibilidad, críticos fuera de servicio con su nivel de escalación, owners de la semana, incidencias por mes y tipo de falla), *Equipos* (código, serial, marca, modelo, área, funcionalidad), *Checklist* diario por turno con puntos por tipo de equipo (una falla se puede reportar como incidencia), *Reparaciones* en lista y Gantt (estatus, fecha compromiso, cierre), *Revisión semanal* (pendientes, vencidos, cumplimiento del checklist y acuerdos), *Owners por turno* con rotación, *Proveedores* (contacto y proceso de atención) y *Escalación y ajustes*. Al reportar una falla se avisa al admin, a los owners de la semana y a los correos configurados. Permisos: `equipos_operar` (checklist y fallas) y `equipos_admin` (registro y configuración). Base: `supabase/equipos.sql`.
- **Limpieza y 5S:** checklist por área, fecha y turno con los puntos de cada S (Clasificar, Ordenar, Limpiar, Estandarizar, Disciplina), respuesta Sí / No / N/A y puntaje = Sí ÷ (Sí + No). Cada "No" puede abrir un *hallazgo* con responsable y fecha compromiso; para cerrarlo se pide nota de cierre. *Tablero* con cumplimiento por S, tendencia semanal y semáforo por área. En *Responsables y ajustes* se eligen las áreas del programa, el responsable (supervisor) de cada una, la meta (85 % inicial), los correos a notificar y los puntos del checklist. Avisos al admin y al responsable del área por cada hallazgo y cuando un checklist queda debajo de la meta. Permisos: `s5_operar` (hacer checklist y hallazgos) y `s5_admin` (ajustes). Base: `supabase/limpieza_5s.sql`.
- **Usuarios** (solo admin): rol de cada cuenta y **Permisos por rol** (pestañas que ve y acciones que puede hacer).

Este proyecto de Supabase lo comparte la app de Surtido de Línea: las cuentas nuevas entran con rol `sin_acceso` y no ven datos hasta que el administrador les asigna un rol (aplicado; ver `supabase/admin_y_catalogos.sql`).

- **Pase de lista:** cada supervisor ve solo a su personal (según el correo ligado en Catálogos → Supervisores). El admin y quien gestione movimientos ven a todos.
- **Personal:** todo el personal, incluidos supervisores, gerentes y dirección. En la ficha se marca *Es supervisor* / *Es gerente* y, si la persona tiene cuenta, el admin le asigna su rol en la app.
- **Admin:** aprueba cualquier movimiento y sus propios cambios de supervisor se aplican sin aprobación.
- **Catálogos:** cada elemento se puede editar (renombrar); el cambio se lleva a todas las fichas. Las áreas tienen edificio.
- **Tema claro/oscuro** con el botón de la barra (claro por defecto). La barra lateral se expande al pasar el cursor.

## Roles

| Rol | Puede |
|---|---|
| `admin` | Todo: fichas, celulares, certificaciones, catálogos, requeridos y roles de usuarios |
| `supervisor` | Pasar lista y consultar |
| `lector` | Solo consultar |

## Puesta en marcha (una sola vez)

1. **Crear el proyecto** en [supabase.com](https://supabase.com) (plan Free). Anota la contraseña de la base.
2. **Crear tablas y reglas:** Supabase → *SQL Editor* → *New query* → pega `supabase/schema.sql` → *Run*.
3. **Cargar el personal:** en el mismo editor ejecuta el archivo privado `personal_inicial_PRIVADO.sql` (se entrega aparte, no está en el repo).
4. **Cerrar el registro público:** *Authentication → Sign In / Providers → Email*: desactiva **Allow new users to sign up**. Así solo entra quien tú invites.
5. **Crear tu usuario:** *Authentication → Users → Add user* (o *Invite user*) con tu correo.
6. **Hacerte admin:** en *SQL Editor* ejecuta:
   ```sql
   update public.perfiles set rol = 'admin' where email = 'tu-correo@ejemplo.com';
   ```
7. **Conectar la página:** *Project Settings → API*. Copia *Project URL* y la clave *anon public* en `config.js`, y súbelo al repo.
8. **Publicar:** GitHub → *Settings → Pages* → *Deploy from a branch* → `main` / `(root)`. La dirección queda como `https://<usuario>.github.io/<repo>/`.
9. **Correos de recuperación:** *Authentication → URL Configuration* → agrega la dirección de la página en *Redirect URLs* (la *Site URL* la comparte con Surtido de Línea; ver [Base de datos compartida](#base-de-datos-compartida)).

## Día a día

- **Dar de alta un supervisor:** *Authentication → Users → Invite user*. Entra a la app, aparece en *Administración → Usuarios* como `sin_acceso` y ahí le asignas el rol.
- **Respaldar o exportar:** *Table Editor* → tabla `asistencia` o `empleados` → *Export to CSV*.
- **El plan Free pausa el proyecto tras 7 días sin uso.** Con el uso diario no pasa; si ocurre, se reactiva desde el panel.

## Base de datos compartida

Este proyecto de Supabase también lo usa **Surtido de Línea** (repositorio `fernandodg28346-oss/surtido-linea`). Antes de cambiar la base o la configuración de inicio de sesión, revisa que no afecte a esa app.

- **Cuentas:** las dos apps usan las mismas cuentas de Supabase. Una persona puede entrar a las dos con el mismo correo y la misma contraseña; si cambia su contraseña en una app, cambia en la otra.
- **Acceso:** Surtido de Línea da acceso por el gafete ligado en `sl_gafetes`; Control de Personal, por el rol en `perfiles`. Toda cuenta nueva recibe `sin_acceso` en `perfiles` (disparador `on_auth_user_created`), así que una cuenta creada desde una app no ve datos de la otra hasta que su administrador le da acceso.
- **Tablas:** Surtido de Línea usa solo tablas y funciones con prefijo `sl_`; todo lo demás es de Control de Personal. Ninguna app modifica tablas, funciones ni reglas de la otra.
- **Cerrar sesión:** cada app cierra la sesión solo en el equipo actual (`signOut({scope:"local"})`) y borra del navegador solo las claves `sb-<proyecto>-`. No uses el cierre global: sacaría a la persona de la otra app en todos sus equipos.
- **Authentication (una sola configuración para las dos):** *Allow new users to sign up* debe seguir desactivado. En *URL Configuration*, las direcciones de las dos apps deben estar en *Redirect URLs*: cada app manda el enlace de recuperación a su propia dirección y, si falta, Supabase usa la *Site URL*, que es la de una sola app. El SMTP y las reglas de contraseña aplican a las dos.
- **Cuentas desde Surtido de Línea:** la función `sl-aprobar-acceso` crea la cuenta o, si el correo ya tiene una, la liga al gafete sin cambiar su contraseña.

## Estructura

```
index.html            interfaz
app.js                lógica y conexión a Supabase
config.js             URL y anon key del proyecto
reportes.js           resumen, gráficas y reportes
equipos.js            herramental
s5.js                 limpieza y 5S
supabase/*.sql        tablas, roles, reglas de acceso y catálogos (schema.sql primero, luego cada módulo)
```
