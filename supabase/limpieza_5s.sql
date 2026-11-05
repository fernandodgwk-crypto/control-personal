-- Limpieza y 5S de las áreas: checklist por área/fecha/turno, hallazgos con responsable y avisos.
-- Ejecutar después de equipos.sql.

create table if not exists public.s5_config (id int primary key default 1 check (id = 1), data jsonb not null);
create table if not exists public.s5_auditorias (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  fecha date not null,
  turno text not null default '',
  items jsonb not null default '[]',        -- [{s:1..5, item, res:'si'|'no'|'na', nota}]
  puntaje numeric(5,1) not null default 0,  -- % de cumplimiento (sí / (sí + no))
  por_s jsonb not null default '{}',        -- {"1":%, ...}
  observaciones text not null default '',
  auditor_email text default '',
  creado timestamptz not null default now(),
  unique (area, fecha, turno)
);
create table if not exists public.s5_hallazgos (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid references public.s5_auditorias(id) on delete set null,
  area text not null,
  s int not null check (s between 1 and 5),
  descripcion text not null,
  responsable text not null default '',
  compromiso date,
  estatus text not null default 'abierto' check (estatus in ('abierto','cerrado')),
  cierre timestamptz,
  cierre_nota text not null default '',
  creado_email text default '',
  creado timestamptz not null default now()
);
create index if not exists s5_auditorias_fecha on public.s5_auditorias (fecha);

do $$ declare t text; begin
  foreach t in array array['s5_config','s5_auditorias','s5_hallazgos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
    if not exists (select 1 from pg_policies where tablename=t and policyname='leer') then
      execute format('create policy "leer" on public.%I for select to authenticated using (public.puede_ver())', t); end if;
  end loop;
  if not exists (select 1 from pg_policies where tablename='s5_config' and policyname='administrar') then
    create policy "administrar" on public.s5_config for all to authenticated using (public.tiene_permiso('s5_admin')) with check (public.tiene_permiso('s5_admin')); end if;
  foreach t in array array['s5_auditorias','s5_hallazgos'] loop
    if not exists (select 1 from pg_policies where tablename=t and policyname='operar') then
      execute format('create policy "operar" on public.%I for all to authenticated using (public.tiene_permiso(''s5_operar'') or public.tiene_permiso(''s5_admin'')) with check (public.tiene_permiso(''s5_operar'') or public.tiene_permiso(''s5_admin''))', t); end if;
  end loop;
end $$;

-- Destinatarios de avisos de un área: admins, responsable del área y correos configurados
create or replace function public.s5_destinatarios(p_area text) returns setof text
language sql stable security definer set search_path = public as $$
  with c as (select data from public.s5_config where id = 1)
  select distinct lower(x) from (
    select email x from public.perfiles where rol = 'admin'
    union all select s.email from public.supervisores s, c where s.nombre = c.data->'responsables'->>p_area
    union all select jsonb_array_elements_text(coalesce((select data->'notificar' from c),'[]'::jsonb))
  ) z where coalesce(x,'') <> ''
$$;
create or replace function public.s5_hallazgo_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text; nombres text[] := array['Clasificar','Ordenar','Limpiar','Estandarizar','Disciplina'];
begin
  if tg_op = 'UPDATE' then
    if new.estatus = 'cerrado' and old.estatus <> 'cerrado' and new.cierre is null then new.cierre := now(); end if;
    if new.estatus <> 'cerrado' then new.cierre := null; end if;
    return new;
  end if;
  for d in select * from public.s5_destinatarios(new.area) loop
    insert into public.avisos (para_email, tipo, num, fecha, titulo, detalle)
    values (d, '5s', new.area, current_date, 'Hallazgo 5S en ' || new.area || ' (' || nombres[new.s] || ')',
            new.descripcion || coalesce(' · responsable ' || nullif(new.responsable,''), '') || coalesce(' · compromiso ' || to_char(new.compromiso,'DD/MM/YYYY'), '') || ' · registró ' || coalesce(new.creado_email,''));
  end loop;
  return new;
end $$;
create or replace function public.s5_auditoria_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text; meta numeric;
begin
  select coalesce((data->>'meta')::numeric, 85) into meta from public.s5_config where id = 1;
  if new.puntaje < coalesce(meta,85) and (tg_op = 'INSERT' or old.puntaje >= coalesce(meta,85)) then
    for d in select * from public.s5_destinatarios(new.area) loop
      insert into public.avisos (para_email, tipo, num, fecha, titulo, detalle)
      values (d, '5s', new.area, new.fecha, '5S debajo de la meta: ' || new.area || ' ' || new.puntaje || '%',
              'Checklist del ' || to_char(new.fecha,'DD/MM/YYYY') || case when new.turno <> '' then ' · ' || new.turno else '' end || ' · meta ' || meta || '% · revisó ' || coalesce(new.auditor_email,''));
    end loop;
  end if;
  return null;
end $$;
revoke execute on function public.s5_destinatarios(text), public.s5_hallazgo_aviso(), public.s5_auditoria_aviso() from public, anon, authenticated;
create or replace trigger s5_hallazgo_aviso before insert or update on public.s5_hallazgos for each row execute function public.s5_hallazgo_aviso();
create or replace trigger s5_auditoria_aviso after insert or update of puntaje on public.s5_auditorias for each row execute function public.s5_auditoria_aviso();

do $$ declare t text; begin
  foreach t in array array['s5_config','s5_auditorias','s5_hallazgos'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t); exception when others then null; end;
  end loop;
end $$;

insert into public.s5_config (id, data) values (1, '{
  "meta": 85,
  "items": {
    "1": ["Solo hay material, herramienta y equipo necesarios en el área","Material obsoleto, scrap o sin identificar retirado","Sin objetos personales en el área de trabajo"],
    "2": ["Cada cosa en su lugar, delimitado e identificado","Pasillos y rutas de montacargas libres y marcados","Racks y ubicaciones con etiqueta visible","Herramental en su lugar asignado (tablero o sombra)"],
    "3": ["Piso limpio, sin basura, aceite ni derrames","Equipos, mesas y racks limpios","Contenedores de basura y scrap sin rebasar","Fuentes de suciedad identificadas y atendidas"],
    "4": ["Ayudas visuales y estándares vigentes y legibles","Líneas de piso y señalización en buen estado","Checklist de limpieza del turno anterior completo"],
    "5": ["El personal sigue el estándar sin recordatorio","Hallazgos anteriores atendidos en tiempo","EPP en uso y en buen estado"]
  },
  "responsables": {},
  "areas": [],
  "notificar": []
}'::jsonb) on conflict (id) do nothing;

update public.roles set permisos = permisos || array['tab:s5','s5_operar']
  where nombre = 'supervisor' and exists (select 1 from unnest(permisos) p where p like 'tab:%') and not ('tab:s5' = any(permisos));
update public.roles set permisos = array_append(permisos,'tab:s5')
  where nombre = 'lector' and exists (select 1 from unnest(permisos) p where p like 'tab:%') and not ('tab:s5' = any(permisos));
