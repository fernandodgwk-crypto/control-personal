-- Acceso explícito: este proyecto de Supabase lo comparte la app de Surtido, así que una cuenta
-- nueva NO debe ver datos del personal hasta que el administrador le asigne un rol.
-- Ejecutar después de schema.sql y roles.sql.

insert into public.roles (nombre, descripcion, permisos) values
  ('sin_acceso', 'Cuenta sin acceso a Control de Personal.', array[]::text[])
on conflict (nombre) do nothing;

-- Pestañas por rol (además de las acciones). Solo se agregan si el rol aún no tiene pestañas definidas.
update public.roles set permisos = permisos || array['tab:cobertura','tab:lista','tab:personal','tab:reportes']
  where nombre = 'supervisor' and not exists (select 1 from unnest(permisos) p where p like 'tab:%');
update public.roles set permisos = permisos || array['tab:cobertura','tab:personal','tab:reportes']
  where nombre = 'lector' and not exists (select 1 from unnest(permisos) p where p like 'tab:%');

-- Cuentas nuevas: sin acceso hasta que el administrador les dé un rol.
alter table public.perfiles alter column rol set default 'sin_acceso';
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, email, rol) values (new.id, new.email, 'sin_acceso') on conflict do nothing;
  return new;
end $$;
revoke execute on function public.crear_perfil() from public, anon, authenticated;

create or replace function public.tiene_acceso() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol from public.perfiles where id = auth.uid()), 'sin_acceso') <> 'sin_acceso'
$$;
revoke execute on function public.tiene_acceso() from public, anon;
grant execute on function public.tiene_acceso() to authenticated;

-- Lectura solo para cuentas con acceso
drop policy if exists "leer empleados" on public.empleados;
create policy "leer empleados" on public.empleados for select to authenticated using (public.tiene_acceso());
drop policy if exists "leer asistencia" on public.asistencia;
create policy "leer asistencia" on public.asistencia for select to authenticated using (public.tiene_acceso());
drop policy if exists "leer config" on public.config;
create policy "leer config" on public.config for select to authenticated using (public.tiene_acceso());
