-- Tiempo extra: registro por persona y día, con límites por turno y tope semanal RBA.
-- Ejecutar después de vacaciones_rba_back.sql.

create table if not exists public.tiempo_extra (
  id uuid primary key default gen_random_uuid(),
  num text not null references public.empleados(num) on update cascade on delete cascade,
  fecha date not null,
  horas numeric(4,1) not null check (horas > 0 and horas <= 12),
  turno text not null default '',
  motivo text not null default '',
  registro_email text default '',
  creado timestamptz not null default now(),
  unique (num, fecha)
);
create index if not exists tiempo_extra_fecha on public.tiempo_extra (fecha);
alter table public.tiempo_extra enable row level security;
grant select, insert, update, delete on public.tiempo_extra to authenticated;
revoke all on public.tiempo_extra from anon;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='tiempo_extra' and policyname='leer') then
    create policy "leer" on public.tiempo_extra for select to authenticated using (public.puede_ver()); end if;
  if not exists (select 1 from pg_policies where tablename='tiempo_extra' and policyname='registrar') then
    create policy "registrar" on public.tiempo_extra for all to authenticated
      using (public.tiene_permiso('pasar_lista') or public.tiene_permiso('gestionar_movimientos') or public.es_backup_de((select e.supervisor from public.empleados e where e.num = tiempo_extra.num)))
      with check (public.tiene_permiso('pasar_lista') or public.tiene_permiso('gestionar_movimientos') or public.es_backup_de((select e.supervisor from public.empleados e where e.num = tiempo_extra.num)));
  end if;
end $$;

-- Límites: config.data.te = {"rbaSemana":60, "turnos":{"1 Gdl":{"jornada":8,"maxDia":3,"maxSemana":9}, ...}}
create or replace function public.te_limites() returns trigger
language plpgsql security definer set search_path = public as $$
declare e public.empleados; cf jsonb; lt jsonb; jornada numeric; maxdia numeric; maxsem numeric; rba numeric;
        ini date; fin date; te_sem numeric; dias int; total numeric;
begin
  if auth.uid() is null then return new; end if;
  select * into e from public.empleados where num = new.num;
  new.turno := coalesce(nullif(new.turno,''), e.turno, '');
  select data->'te' into cf from public.config where id = 1;
  lt := coalesce(cf->'turnos'->new.turno, '{}'::jsonb);
  jornada := coalesce((lt->>'jornada')::numeric, 8);
  maxdia := coalesce((lt->>'maxDia')::numeric, 3);
  maxsem := coalesce((lt->>'maxSemana')::numeric, 9);
  rba := coalesce((cf->>'rbaSemana')::numeric, 60);
  if new.horas > maxdia then
    raise exception 'Excede el máximo de % h de tiempo extra por día para %', maxdia, coalesce(nullif(new.turno,''),'su turno'); end if;
  ini := date_trunc('week', new.fecha)::date; fin := ini + 6;
  select coalesce(sum(horas),0) into te_sem from public.tiempo_extra where num = new.num and fecha between ini and fin and fecha <> new.fecha;
  te_sem := te_sem + new.horas;
  if te_sem > maxsem then
    raise exception '% llevaría % h de tiempo extra en la semana; el máximo para % es % h', e.nombre, te_sem, coalesce(nullif(new.turno,''),'su turno'), maxsem; end if;
  select count(distinct fecha) into dias from (
    select fecha from public.asistencia where num = new.num and fecha between ini and fin and estado in ('A','R')
    union select new.fecha) d;
  total := dias * jornada + te_sem;
  if total > rba then
    raise exception 'RBA: % sumaría % h en la semana (% días × % h + % h extra); el tope es % h', e.nombre, total, dias, jornada, te_sem, rba; end if;
  if te_sem >= maxsem then
    perform public.avisar(new.num, 'te', new.fecha, 'Tiempo extra al límite: ' || e.nombre,
      e.nombre || ' llegó a ' || te_sem || ' h de tiempo extra en la semana (máximo ' || maxsem || ' h) · ' || total || ' h totales de ' || rba || ' permitidas por RBA.');
  end if;
  return new;
end $$;
revoke execute on function public.te_limites() from public, anon, authenticated;
create or replace trigger te_limites before insert or update on public.tiempo_extra for each row execute function public.te_limites();

do $$ begin begin alter publication supabase_realtime add table public.tiempo_extra; exception when others then null; end; end $$;

-- Límites iniciales (Ley Federal del Trabajo: hasta 3 h diarias y 9 h semanales de tiempo extra)
update public.config set data = data || jsonb_build_object('te', jsonb_build_object('rbaSemana', 60, 'turnos',
  (select jsonb_object_agg(t, jsonb_build_object('jornada', 8, 'maxDia', 3, 'maxSemana', 9)) from jsonb_array_elements_text(data->'turnos') t)))
where id = 1 and not (data ? 'te');

update public.roles set permisos = array_append(permisos, 'tab:te')
  where nombre = 'supervisor' and exists (select 1 from unnest(permisos) p where p like 'tab:%') and not ('tab:te' = any(permisos));
