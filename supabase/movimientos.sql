-- Catálogo de supervisores y cambios de supervisor con aprobación.
-- Ejecutar después de schema.sql y roles.sql. Se puede correr más de una vez.

-- 1. Supervisores: cada uno ligado (por correo) a la cuenta que aprueba sus movimientos
create table if not exists public.supervisores (
  nombre text primary key,
  email text not null default '',
  gerente text not null default '',
  activo boolean not null default true,
  creado timestamptz default now()
);
alter table public.supervisores enable row level security;
grant select, insert, update, delete on public.supervisores to authenticated;
revoke all on public.supervisores from anon;

-- 2. Movimientos: "pase" (lo pide el supervisor actual, aprueba quien recibe)
--    y "solicitud" (lo pide quien lo quiere, aprueba el supervisor actual)
create table if not exists public.movimientos (
  id uuid primary key default gen_random_uuid(),
  num text not null references public.empleados(num) on update cascade on delete cascade,
  tipo text not null check (tipo in ('pase','solicitud')),
  de_supervisor text not null default '',
  a_supervisor text not null,
  motivo text not null default '',
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado','cancelado')),
  solicitado_por uuid default auth.uid(),
  solicitado_email text default '',
  creado timestamptz not null default now(),
  resuelto_por uuid,
  resuelto_email text default '',
  resuelto_en timestamptz,
  comentario text not null default ''
);
create unique index if not exists movimientos_un_pendiente on public.movimientos(num) where estado = 'pendiente';
create index if not exists movimientos_creado on public.movimientos(creado desc);
alter table public.movimientos enable row level security;
grant select on public.movimientos to authenticated;
revoke all on public.movimientos from anon;

-- 3. Funciones de apoyo
create or replace function public.mi_email() returns text
language sql stable security definer set search_path = public, auth as $$
  select lower(coalesce((select email from auth.users where id = auth.uid()), ''))
$$;
create or replace function public.puede_ver() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol from public.perfiles where id = auth.uid()), 'sin_acceso') <> 'sin_acceso'
$$;
create or replace function public.es_supervisor(p_nombre text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.supervisores s
                 where s.nombre = p_nombre and s.activo and s.email <> '' and lower(s.email) = public.mi_email())
$$;

-- Lectura y escritura
do $$ begin
  if not exists (select 1 from pg_policies where tablename='supervisores' and policyname='leer supervisores') then
    create policy "leer supervisores" on public.supervisores for select to authenticated using (public.puede_ver());
  end if;
  if not exists (select 1 from pg_policies where tablename='supervisores' and policyname='editar supervisores') then
    create policy "editar supervisores" on public.supervisores for all to authenticated
      using (public.tiene_permiso('editar_catalogos')) with check (public.tiene_permiso('editar_catalogos'));
  end if;
  if not exists (select 1 from pg_policies where tablename='movimientos' and policyname='leer movimientos') then
    create policy "leer movimientos" on public.movimientos for select to authenticated using (public.puede_ver());
  end if;
end $$;

-- 4. Solicitar: p_destino es siempre el supervisor que recibe a la persona
create or replace function public.solicitar_movimiento(p_num text, p_tipo text, p_destino text, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare e public.empleados; v_id uuid; gestiona boolean := public.tiene_permiso('gestionar_movimientos');
begin
  if not public.puede_ver() then raise exception 'Tu cuenta no tiene acceso' using errcode='42501'; end if;
  select * into e from public.empleados where num = p_num;
  if not found then raise exception 'No existe la persona %', p_num; end if;
  if p_tipo not in ('pase','solicitud') then raise exception 'Tipo inválido'; end if;
  if not exists (select 1 from public.supervisores where nombre = p_destino and activo) then
    raise exception 'El supervisor destino no está en el catálogo'; end if;
  if coalesce(e.supervisor,'') = p_destino then raise exception 'La persona ya reporta a %', p_destino; end if;
  if p_tipo = 'pase' and not (gestiona or public.es_supervisor(e.supervisor)) then
    raise exception 'Solo el supervisor actual (%) puede pasar a esta persona', e.supervisor using errcode='42501'; end if;
  if p_tipo = 'solicitud' and not (gestiona or public.es_supervisor(p_destino)) then
    raise exception 'Solo % puede solicitar personas para su equipo', p_destino using errcode='42501'; end if;
  if exists (select 1 from public.movimientos where num = p_num and estado = 'pendiente') then
    raise exception 'Ya hay un movimiento pendiente para esta persona'; end if;
  insert into public.movimientos (num, tipo, de_supervisor, a_supervisor, motivo, solicitado_por, solicitado_email)
  values (p_num, p_tipo, coalesce(e.supervisor,''), p_destino, coalesce(p_motivo,''), auth.uid(), public.mi_email())
  returning id into v_id;
  return v_id;
end $$;

-- 5. Aprobar o rechazar: en un pase aprueba quien recibe; en una solicitud, el supervisor actual
create or replace function public.resolver_movimiento(p_id uuid, p_aprobar boolean, p_comentario text)
returns void language plpgsql security definer set search_path = public as $$
declare m public.movimientos; e public.empleados; g text;
begin
  select * into m from public.movimientos where id = p_id for update;
  if not found or m.estado <> 'pendiente' then raise exception 'El movimiento ya no está pendiente'; end if;
  if not (public.tiene_permiso('gestionar_movimientos')
          or (m.tipo = 'pase' and public.es_supervisor(m.a_supervisor))
          or (m.tipo = 'solicitud' and public.es_supervisor(m.de_supervisor))) then
    raise exception 'No te toca aprobar este movimiento' using errcode='42501'; end if;
  if p_aprobar then
    select * into e from public.empleados where num = m.num for update;
    if coalesce(e.supervisor,'') <> m.de_supervisor then
      raise exception 'La persona ya cambió de supervisor; cancela esta solicitud'; end if;
    select nullif(gerente,'') into g from public.supervisores where nombre = m.a_supervisor;
    perform set_config('cp.movimiento', '1', true);
    update public.empleados set supervisor = m.a_supervisor, gerente = coalesce(g, gerente), actualizado = now() where num = m.num;
    perform set_config('cp.movimiento', '', true);
  end if;
  update public.movimientos set estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
    resuelto_por = auth.uid(), resuelto_email = public.mi_email(), resuelto_en = now(), comentario = coalesce(p_comentario,'')
  where id = p_id;
end $$;

-- 6. Cancelar: quien lo pidió, o quien gestiona movimientos
create or replace function public.cancelar_movimiento(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.movimientos;
begin
  select * into m from public.movimientos where id = p_id for update;
  if not found or m.estado <> 'pendiente' then raise exception 'El movimiento ya no está pendiente'; end if;
  if not (m.solicitado_por = auth.uid() or public.tiene_permiso('gestionar_movimientos')) then
    raise exception 'Solo quien lo solicitó puede cancelarlo' using errcode='42501'; end if;
  update public.movimientos set estado = 'cancelado', resuelto_por = auth.uid(), resuelto_email = public.mi_email(), resuelto_en = now() where id = p_id;
end $$;

revoke execute on function public.mi_email(), public.puede_ver(), public.es_supervisor(text),
  public.solicitar_movimiento(text,text,text,text), public.resolver_movimiento(uuid,boolean,text), public.cancelar_movimiento(uuid) from public, anon;
grant execute on function public.mi_email(), public.puede_ver(), public.es_supervisor(text),
  public.solicitar_movimiento(text,text,text,text), public.resolver_movimiento(uuid,boolean,text), public.cancelar_movimiento(uuid) to authenticated;

-- 7. Tiempo real
do $$ begin
  begin alter publication supabase_realtime add table public.movimientos; exception when others then null; end;
  begin alter publication supabase_realtime add table public.supervisores; exception when others then null; end;
end $$;

-- 8. Pestaña Movimientos para el rol supervisor
update public.roles set permisos = array_append(permisos, 'tab:movimientos')
  where nombre = 'supervisor' and exists (select 1 from unnest(permisos) p where p like 'tab:%')
    and not ('tab:movimientos' = any(permisos));

-- 9. Catálogo inicial a partir del personal: gerente más frecuente del equipo y correo de su ficha
insert into public.supervisores (nombre, email, gerente)
select s.nombre,
       lower(coalesce((select e.email from public.empleados e where lower(e.nombre) = lower(s.nombre) and e.email <> '' limit 1), '')),
       coalesce(s.gerente, '')
from (select supervisor nombre, mode() within group (order by gerente) gerente
      from public.empleados where coalesce(supervisor,'') <> '' group by supervisor) s
on conflict (nombre) do nothing;

-- 10. El supervisor de una persona solo cambia por un movimiento aprobado
--     (o lo cambia alguien con el permiso gestionar_movimientos).
create or replace function public.empleados_guard_supervisor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if coalesce(new.supervisor,'') is distinct from coalesce(old.supervisor,'')
     and coalesce(current_setting('cp.movimiento', true),'') <> '1'
     and not public.tiene_permiso('gestionar_movimientos') then
    raise exception 'El supervisor solo cambia con un movimiento aprobado (pestaña Movimientos)' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.empleados_guard_supervisor() from public, anon, authenticated;
create or replace trigger empleados_guard_supervisor before update on public.empleados
  for each row execute function public.empleados_guard_supervisor();
-- resolver_movimiento marca cp.movimiento=1 antes de actualizar al empleado:
-- perform set_config('cp.movimiento','1',true); update ...; perform set_config('cp.movimiento','',true);
