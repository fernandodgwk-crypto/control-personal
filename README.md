# Control de Personal B2/B2B

App web para pase de lista por turno, cobertura por área y posición (áreas descubiertas), y fichas del personal con celular y certificaciones.

- **Página:** estática, hospedada en GitHub Pages (`index.html`, `app.js`, `config.js`).
- **Datos:** Supabase (Postgres) con inicio de sesión. Este repositorio **no contiene datos del personal**.

## Roles

| Rol | Puede |
|---|---|
| `admin` | Todo: fichas, celulares, certificaciones, catálogos, requeridos y roles de usuarios |
| `supervisor` | Pasar lista y consultar |
| `lector` | Solo consultar (rol por defecto de cada usuario nuevo) |

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
9. **Correos de recuperación:** *Authentication → URL Configuration* → pon la dirección de la página en *Site URL* y en *Redirect URLs*.

## Día a día

- **Dar de alta un supervisor:** *Authentication → Users → Invite user*. Entra a la app, aparece en *Ajustes → Usuarios* como `lector` y ahí le cambias el rol.
- **Respaldar o exportar:** *Table Editor* → tabla `asistencia` o `empleados` → *Export to CSV*.
- **El plan Free pausa el proyecto tras 7 días sin uso.** Con el uso diario no pasa; si ocurre, se reactiva desde el panel.

## Estructura

```
index.html            interfaz
app.js                lógica y conexión a Supabase
config.js             URL y anon key del proyecto
supabase/schema.sql   tablas, roles, reglas de acceso y catálogos iniciales
```
