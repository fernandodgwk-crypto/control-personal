-- Roles con permisos configurables por el administrador.
-- Ejecutar después de schema.sql (ya aplicado en el proyecto en producción).

create table if not exists public.roles (
  nombre text primary key,
  descripcion text default '',
  permisos text[] not null default '{}',
  creado timestamptz default now()
);
insert into public.roles (nombre, descripcion, permisos) values
  ('admin', 'Acceso total. Administra usuarios y roles.', array['pasar_lista','editar_personal','editar_catalogos','editar_requeridos']),
  ('supervisor', 'Pasa lista de su turno.', array['pasar_lista']),
  ('lector', 'Solo consulta.', array[]::text[])
on conflict (nombre) do nothing;

-- El rol de cada usuario debe existir en la tabla de roles.
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles drop constraint if exists perfiles_rol_fkey;
alter table public.perfiles add constraint perfiles_rol_fkey
  foreign key (rol) references public.roles(nombre) on update cascade on delete restrict;

-- ¿El usuario actual tiene este permiso? El admin siempre tiene todos.
create or replace function public.tiene_permiso(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.mi_rol() = 'admin'
      or exists (select 1 from public.roles r where r.nombre = public.mi_rol() and p = any(r.permisos))
$$;
revoke execute on function public.tiene_permiso(text) from public, anon;
grant execute on function public.tiene_permiso(text) to authenticated;

-- Reglas de escritura según permiso
drop policy if exists "marcar asistencia" on public.asistencia;
create policy "marcar asistencia" on public.asistencia for all to authenticated
  using (public.tiene_permiso('pasar_lista')) with check (public.tiene_permiso('pasar_lista'));

drop policy if exists "admin edita empleados" on public.empleados;
drop policy if exists "editar personal" on public.empleados;
create policy "editar personal" on public.empleados for all to authenticated
  using (public.tiene_permiso('editar_personal')) with check (public.tiene_permiso('editar_personal'));

drop policy if exists "admin edita config" on public.config;
drop policy if exists "editar config" on public.config;
create policy "editar config" on public.config for all to authenticated
  using (public.tiene_permiso('editar_catalogos') or public.tiene_permiso('editar_requeridos'))
  with check (public.tiene_permiso('editar_catalogos') or public.tiene_permiso('editar_requeridos'));

-- Requeridos y catálogos viven en el mismo registro: este disparador revisa qué parte cambió.
create or replace function public.config_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- cambios desde el panel/SQL
  if (coalesce(old.data,'{}'::jsonb) - 'req') is distinct from (new.data - 'req')
     and not public.tiene_permiso('editar_catalogos') then
    raise exception 'Tu rol no permite editar catálogos' using errcode = '42501';
  end if;
  if (old.data -> 'req') is distinct from (new.data -> 'req')
     and not public.tiene_permiso('editar_requeridos') then
    raise exception 'Tu rol no permite editar requeridos' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.config_guard() from public, anon, authenticated;
drop trigger if exists config_guard on public.config;
create trigger config_guard before update on public.config
  for each row execute function public.config_guard();

-- Roles: todos los leen, solo el admin los cambia; el rol admin no se puede borrar ni renombrar.
alter table public.roles enable row level security;
grant select, insert, update, delete on public.roles to authenticated;
revoke all on public.roles from anon;
drop policy if exists "leer roles" on public.roles;
create policy "leer roles" on public.roles for select to authenticated using (true);
drop policy if exists "admin edita roles" on public.roles;
create policy "admin edita roles" on public.roles for all to authenticated
  using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');

create or replace function public.roles_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.nombre = 'admin' then
    raise exception 'El rol admin no se puede borrar';
  end if;
  if tg_op = 'UPDATE' and old.nombre = 'admin' and new.nombre <> 'admin' then
    raise exception 'El rol admin no se puede renombrar';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists roles_guard on public.roles;
create trigger roles_guard before update or delete on public.roles
  for each row execute function public.roles_guard();

-- Avisar en vivo a la app cuando cambian los permisos
do $$ begin
  begin alter publication supabase_realtime add table public.roles; exception when others then null; end;
end $$;
