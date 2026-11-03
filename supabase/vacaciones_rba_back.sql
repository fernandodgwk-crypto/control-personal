-- Vacaciones, descanso laborado (prevención RBA), avisos y back (suplente) para pase de lista.
-- Ejecutar después de movimientos.sql y admin_y_catalogos.sql.

-- 1. Back de cada supervisor
alter table public.supervisores add column if not exists backup_email text not null default '';
create or replace function public.es_backup_de(p_sup text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.supervisores s where s.nombre = p_sup and s.backup_email <> '' and lower(s.backup_email) = public.mi_email())
$$;
-- El supervisor (o quien edita catálogos) asigna su back
create or replace function public.asignar_backup(p_sup text, p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.es_supervisor(p_sup) or public.tiene_permiso('editar_catalogos')) then
    raise exception 'Solo el supervisor o el administrador asigna el back' using errcode='42501'; end if;
  update public.supervisores set backup_email = lower(trim(coalesce(p_email,''))) where nombre = p_sup;
end $$;
-- Pasa lista quien tiene el permiso, o el back del supervisor de esa persona
alter policy "marcar asistencia" on public.asistencia
  using (public.tiene_permiso('pasar_lista') or public.es_backup_de((select e.supervisor from public.empleados e where e.num = asistencia.num)))
  with check (public.tiene_permiso('pasar_lista') or public.es_backup_de((select e.supervisor from public.empleados e where e.num = asistencia.num)));

-- 2. Programación: vacaciones y descanso laborado (con su descanso compensatorio)
create table if not exists public.programacion (
  id uuid primary key default gen_random_uuid(),
  num text not null references public.empleados(num) on update cascade on delete cascade,
  tipo text not null check (tipo in ('vacaciones','descanso_laborado')),
  desde date not null,            -- vacaciones: primer día · descanso laborado: día de descanso que trabaja
  hasta date not null,            -- vacaciones: último día  · descanso laborado: igual a desde
  compensa date,                  -- descanso laborado: día de descanso que se le repone
  nota text not null default '',
  estado text not null default 'activo' check (estado in ('activo','cancelado')),
  creado_por uuid default auth.uid(),
  creado_email text default '',
  creado timestamptz not null default now(),
  check (hasta >= desde)
);
create index if not exists programacion_fechas on public.programacion (desde, hasta);
alter table public.programacion enable row level security;
grant select on public.programacion to authenticated;
revoke all on public.programacion from anon;

-- 3. Avisos dentro de la app
create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),
  para_email text not null,
  tipo text not null,             -- vacaciones · descanso_laborado · rba
  num text,
  fecha date,
  titulo text not null,
  detalle text not null default '',
  leido boolean not null default false,
  creado timestamptz not null default now()
);
create index if not exists avisos_para on public.avisos (lower(para_email), creado desc);
create unique index if not exists avisos_rba_unico on public.avisos (para_email, num, fecha) where tipo = 'rba';
alter table public.avisos enable row level security;
grant select, update on public.avisos to authenticated;
revoke all on public.avisos from anon;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='programacion' and policyname='leer programacion') then
    create policy "leer programacion" on public.programacion for select to authenticated using (public.puede_ver()); end if;
  if not exists (select 1 from pg_policies where tablename='avisos' and policyname='mis avisos') then
    create policy "mis avisos" on public.avisos for select to authenticated using (lower(para_email) = public.mi_email()); end if;
  if not exists (select 1 from pg_policies where tablename='avisos' and policyname='marcar leido') then
    create policy "marcar leido" on public.avisos for update to authenticated using (lower(para_email) = public.mi_email()) with check (lower(para_email) = public.mi_email()); end if;
end $$;

-- Destinatarios de un aviso sobre una persona: administradores, su gerente y su supervisor a cargo
create or replace function public.destinatarios(p_num text) returns setof text
language sql stable security definer set search_path = public as $$
  with e as (select supervisor, gerente from public.empleados where num = p_num)
  select distinct lower(x) from (
    select email x from public.perfiles where rol = 'admin'
    union all select s.email from public.supervisores s, e where s.nombre = e.supervisor
    union all select s.email from public.supervisores s, e where s.nombre = e.gerente
    union all select m.email from public.empleados m, e where m.nombre = e.gerente
  ) t where coalesce(x,'') <> ''
$$;
create or replace function public.avisar(p_num text, p_tipo text, p_fecha date, p_titulo text, p_detalle text) returns void
language plpgsql security definer set search_path = public as $$
declare d text;
begin
  for d in select * from public.destinatarios(p_num) loop
    insert into public.avisos (para_email, tipo, num, fecha, titulo, detalle) values (d, p_tipo, p_num, p_fecha, p_titulo, coalesce(p_detalle,''))
    on conflict do nothing;
  end loop;
end $$;

-- 4. Programar (supervisor a cargo, su back, quien gestiona movimientos o el admin)
create or replace function public.programar_ausencia(p_num text, p_tipo text, p_desde date, p_hasta date, p_compensa date, p_nota text)
returns uuid language plpgsql security definer set search_path = public as $$
declare e public.empleados; v_id uuid; t text; dt text;
begin
  select * into e from public.empleados where num = p_num;
  if not found then raise exception 'No existe la persona %', p_num; end if;
  if not (public.tiene_permiso('gestionar_movimientos') or public.es_supervisor(e.supervisor) or public.es_backup_de(e.supervisor)) then
    raise exception 'Solo el supervisor a cargo (o su back) puede programar a esta persona' using errcode='42501'; end if;
  if p_tipo = 'descanso_laborado' then p_hasta := p_desde; end if;
  if p_hasta < p_desde then raise exception 'La fecha final debe ser igual o posterior a la inicial'; end if;
  if p_tipo = 'vacaciones' and exists (select 1 from public.programacion where num = p_num and estado='activo' and tipo='vacaciones' and desde <= p_hasta and hasta >= p_desde) then
    raise exception 'Ya tiene vacaciones programadas en esas fechas'; end if;
  insert into public.programacion (num, tipo, desde, hasta, compensa, nota, creado_email)
  values (p_num, p_tipo, p_desde, p_hasta, case when p_tipo='descanso_laborado' then p_compensa end, coalesce(p_nota,''), public.mi_email())
  returning id into v_id;
  if p_tipo = 'vacaciones' then
    t := 'Vacaciones: ' || e.nombre;
    dt := to_char(p_desde,'DD/MM/YYYY') || case when p_hasta > p_desde then ' al ' || to_char(p_hasta,'DD/MM/YYYY') else '' end
          || ' (' || (p_hasta - p_desde + 1) || ' día' || case when p_hasta > p_desde then 's' else '' end || ') · registró ' || public.mi_email();
  else
    t := 'Descanso laborado: ' || e.nombre;
    dt := 'Trabaja su descanso el ' || to_char(p_desde,'DD/MM/YYYY')
          || coalesce(' y descansa el ' || to_char(p_compensa,'DD/MM/YYYY'), ' · SIN descanso compensatorio asignado')
          || ' · registró ' || public.mi_email();
  end if;
  perform public.avisar(p_num, p_tipo, p_desde, t, dt || case when coalesce(p_nota,'') <> '' then ' · ' || p_nota else '' end);
  return v_id;
end $$;
create or replace function public.cancelar_programacion(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.programacion; e public.empleados;
begin
  select * into p from public.programacion where id = p_id for update;
  if not found or p.estado <> 'activo' then raise exception 'Ya no está activo'; end if;
  select * into e from public.empleados where num = p.num;
  if not (public.tiene_permiso('gestionar_movimientos') or public.es_supervisor(e.supervisor) or public.es_backup_de(e.supervisor) or p.creado_por = auth.uid()) then
    raise exception 'No puedes cancelar esta programación' using errcode='42501'; end if;
  update public.programacion set estado = 'cancelado' where id = p_id;
end $$;

-- 5. RBA: al registrar asistencia, si la persona llega a 6 o más días seguidos trabajando, avisar
create or replace function public.dias_seguidos(p_num text, p_fecha date) returns integer
language plpgsql stable security definer set search_path = public as $$
declare n integer := 0;
begin
  while n < 31 and exists (select 1 from public.asistencia where num = p_num and fecha = p_fecha - n and estado in ('A','R')) loop
    n := n + 1;
  end loop;
  return n;
end $$;
create or replace function public.asistencia_rba() returns trigger
language plpgsql security definer set search_path = public as $$
declare n integer; nom text;
begin
  if new.estado not in ('A','R') then return new; end if;
  n := public.dias_seguidos(new.num, new.fecha);
  if n >= 6 then
    select nombre into nom from public.empleados where num = new.num;
    perform public.avisar(new.num, 'rba', new.fecha,
      case when n >= 7 then 'RBA incumplido: ' else 'RBA en riesgo: ' end || coalesce(nom, new.num),
      coalesce(nom, new.num) || ' lleva ' || n || ' días seguidos trabajando al ' || to_char(new.fecha,'DD/MM/YYYY')
      || case when n >= 7 then '. Excede el máximo de 6 días sin descanso.' else '. Debe descansar el ' || to_char(new.fecha + 1,'DD/MM/YYYY') || '.' end);
  end if;
  return new;
end $$;
create or replace trigger asistencia_rba after insert or update of estado on public.asistencia
  for each row execute function public.asistencia_rba();

revoke execute on function public.es_backup_de(text), public.asignar_backup(text,text), public.destinatarios(text), public.avisar(text,text,date,text,text),
  public.programar_ausencia(text,text,date,date,date,text), public.cancelar_programacion(uuid), public.dias_seguidos(text,date), public.asistencia_rba() from public, anon;
grant execute on function public.es_backup_de(text), public.asignar_backup(text,text),
  public.programar_ausencia(text,text,date,date,date,text), public.cancelar_programacion(uuid), public.dias_seguidos(text,date) to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.programacion; exception when others then null; end;
  begin alter publication supabase_realtime add table public.avisos; exception when others then null; end;
end $$;

update public.roles set permisos = array_append(permisos, 'tab:vacaciones')
  where nombre = 'supervisor' and exists (select 1 from unnest(permisos) p where p like 'tab:%') and not ('tab:vacaciones' = any(permisos));
