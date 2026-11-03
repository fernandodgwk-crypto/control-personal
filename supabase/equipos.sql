-- Módulo Equipos: registro, checklist diario, incidencias/reparaciones, owners por turno, revisión semanal, proveedores y escalación.
-- Ejecutar después de vacaciones_rba_back.sql.

create table if not exists public.eq_config (id int primary key default 1 check (id = 1), data jsonb not null);
create table if not exists public.equipos (
  id text primary key,                    -- código interno, p. ej. TPE-01
  tipo text not null,
  serial text not null default '',
  marca text not null default '',
  modelo text not null default '',
  area text not null default '',
  sitio text not null default '',
  critico boolean not null default false,
  estado text not null default 'operativo' check (estado in ('operativo','fuera_servicio','en_reparacion','baja')),
  proveedor text not null default '',
  notas text not null default '',
  creado timestamptz not null default now()
);
create table if not exists public.eq_proveedores (
  nombre text primary key,
  contacto text not null default '',
  telefono text not null default '',
  email text not null default '',
  proceso text not null default '',
  tipos text[] not null default '{}'
);
create table if not exists public.eq_incidencias (
  id uuid primary key default gen_random_uuid(),
  equipo_id text not null references public.equipos(id) on update cascade on delete cascade,
  tipo_falla text not null,
  descripcion text not null default '',
  critico boolean not null default false,
  estatus text not null default 'abierta' check (estatus in ('abierta','en_reparacion','espera_refaccion','cerrada')),
  reporte timestamptz not null default now(),
  reporto_email text default '',
  turno text not null default '',
  owner text not null default '',
  proveedor text not null default '',
  folio_proveedor text not null default '',
  compromiso date,
  cierre timestamptz,
  solucion text not null default '',
  actualizado timestamptz not null default now()
);
create index if not exists eq_incidencias_reporte on public.eq_incidencias (reporte desc);
create table if not exists public.eq_checklists (
  id uuid primary key default gen_random_uuid(),
  equipo_id text not null references public.equipos(id) on update cascade on delete cascade,
  fecha date not null,
  turno text not null default '',
  items jsonb not null default '[]',      -- [{item, ok, nota}]
  resultado text not null default 'ok' check (resultado in ('ok','falla')),
  observaciones text not null default '',
  reviso_email text default '',
  creado timestamptz not null default now(),
  unique (equipo_id, fecha, turno)
);
create table if not exists public.eq_owners (
  semana text not null,                   -- AAAA-Www
  turno text not null,
  supervisor text not null default '',
  primary key (semana, turno)
);
create table if not exists public.eq_revisiones (
  semana text primary key,
  fecha date,
  asistentes text not null default '',
  acuerdos text not null default '',
  registro_email text default '',
  actualizado timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['eq_config','equipos','eq_proveedores','eq_incidencias','eq_checklists','eq_owners','eq_revisiones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
    if not exists (select 1 from pg_policies where tablename=t and policyname='leer') then
      execute format('create policy "leer" on public.%I for select to authenticated using (public.puede_ver())', t); end if;
  end loop;
  -- Administración del módulo
  foreach t in array array['eq_config','equipos','eq_proveedores','eq_owners','eq_revisiones'] loop
    if not exists (select 1 from pg_policies where tablename=t and policyname='administrar') then
      execute format('create policy "administrar" on public.%I for all to authenticated using (public.tiene_permiso(''equipos_admin'')) with check (public.tiene_permiso(''equipos_admin''))', t); end if;
  end loop;
  -- Operación: checklist y reporte/seguimiento de fallas
  foreach t in array array['eq_incidencias','eq_checklists'] loop
    if not exists (select 1 from pg_policies where tablename=t and policyname='operar') then
      execute format('create policy "operar" on public.%I for all to authenticated using (public.tiene_permiso(''equipos_operar'') or public.tiene_permiso(''equipos_admin'')) with check (public.tiene_permiso(''equipos_operar'') or public.tiene_permiso(''equipos_admin''))', t); end if;
  end loop;
end $$;

-- Estado del equipo según sus incidencias abiertas, y avisos al reportar una falla
create or replace function public.eq_incidencia_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.estatus = 'cerrada' and old.estatus <> 'cerrada' and new.cierre is null then new.cierre := now(); end if;
  if tg_op = 'UPDATE' and new.estatus <> 'cerrada' then new.cierre := null; end if;
  new.actualizado := now();
  return new;
end $$;
create or replace function public.eq_incidencia_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare eq public.equipos; peor text; d text; sem text; cfgd jsonb; t text; dt text; v_eq text;
begin
  v_eq := case when tg_op = 'DELETE' then old.equipo_id else new.equipo_id end;
  select * into eq from public.equipos where id = v_eq;
  if not found then return null; end if;
  select case when bool_or(estatus in ('en_reparacion','espera_refaccion')) then 'en_reparacion'
              when bool_or(estatus = 'abierta') then 'fuera_servicio' end
    into peor from public.eq_incidencias where equipo_id = v_eq and estatus <> 'cerrada';
  if eq.estado <> 'baja' then
    update public.equipos set estado = coalesce(peor, 'operativo') where id = v_eq;
  end if;
  if tg_op = 'INSERT' then
    sem := to_char(current_date, 'IYYY') || '-W' || to_char(current_date, 'IW');
    select data into cfgd from public.eq_config where id = 1;
    t := case when new.critico or eq.critico then 'CRÍTICO fuera de servicio: ' else 'Falla en equipo: ' end || eq.id || ' (' || eq.tipo || ')';
    dt := new.tipo_falla || coalesce(' · ' || nullif(new.descripcion,''), '') || ' · reportó ' || coalesce(new.reporto_email,'') ||
          case when new.turno <> '' then ' · turno ' || new.turno else '' end;
    for d in
      select distinct lower(x) from (
        select email x from public.perfiles where rol = 'admin'
        union all select jsonb_array_elements_text(coalesce(cfgd->'notificar','[]'::jsonb))
        union all select s.email from public.eq_owners o join public.supervisores s on s.nombre = o.supervisor where o.semana = sem
      ) z where coalesce(x,'') <> ''
    loop
      insert into public.avisos (para_email, tipo, num, fecha, titulo, detalle) values (d, 'equipo', new.equipo_id, current_date, t, dt);
    end loop;
  end if;
  return null;
end $$;
revoke execute on function public.eq_incidencia_sync(), public.eq_incidencia_after() from public, anon, authenticated;
create or replace trigger eq_incidencia_sync before update on public.eq_incidencias for each row execute function public.eq_incidencia_sync();
create or replace trigger eq_incidencia_after after insert or update or delete on public.eq_incidencias for each row execute function public.eq_incidencia_after();

do $$ declare t text; begin
  foreach t in array array['equipos','eq_incidencias','eq_checklists','eq_owners','eq_revisiones','eq_proveedores','eq_config'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t); exception when others then null; end;
  end loop;
end $$;

-- Configuración inicial: tipos, fallas, checklist por tipo y niveles de escalación
insert into public.eq_config (id, data) values (1, '{
  "tipos": ["Transpaleta eléctrica","Transpaleta estándar","Montacargas","Otra herramienta"],
  "fallas": ["Batería","Cargador","Ruedas / rodajas","Hidráulico","Eléctrico / control","Frenos","Horquillas / estructura","Llantas","Motor","Otro"],
  "checklist": {
    "Transpaleta eléctrica": ["Batería cargada (indicador)","Cargador y cable sin daño","Ruedas y rodajas sin daño","Horquillas sin deformación","Frenos funcionan","Claxon funciona","Botón de emergencia funciona","Elevación y descenso correctos","Sin fugas de aceite","Timón en buen estado"],
    "Transpaleta estándar": ["Ruedas y rodajas sin daño","Horquillas sin deformación","Bomba hidráulica sube y baja","Sin fugas de aceite","Timón y palanca en buen estado"],
    "Montacargas": ["Nivel de combustible o batería","Llantas en buen estado","Frenos y freno de mano","Claxon y alarma de reversa","Luces y torreta","Cinturón de seguridad","Mástil, cadenas y horquillas","Sin fugas (aceite, hidráulico)","Extintor vigente","Espejos"],
    "Otra herramienta": ["Estado general sin daño","Funciona correctamente"]
  },
  "escalacion": [
    {"nivel":1,"horas":0,"quien":"Owner del turno","accion":"Registrar la falla, etiquetar el equipo fuera de servicio y reportar al proveedor."},
    {"nivel":2,"horas":24,"quien":"Supervisor líder del tema","accion":"Dar seguimiento con el proveedor y confirmar fecha compromiso."},
    {"nivel":3,"horas":72,"quien":"Gerencia","accion":"Decidir equipo de respaldo, renta o reemplazo."}
  ],
  "notificar": ["franciscomisael.godoy@flex.com","fernando.galvez@flex.com"]
}'::jsonb) on conflict (id) do nothing;
insert into public.eq_proveedores (nombre, proceso, tipos) values
  ('Dimosa', '', array['Transpaleta eléctrica','Montacargas']) on conflict (nombre) do nothing;

-- Permisos: supervisores operan (checklist y fallas) y ven la pestaña
update public.roles set permisos = permisos || array['tab:equipos','equipos_operar']
  where nombre = 'supervisor' and exists (select 1 from unnest(permisos) p where p like 'tab:%') and not ('tab:equipos' = any(permisos));
update public.roles set permisos = array_append(permisos,'tab:equipos')
  where nombre = 'lector' and exists (select 1 from unnest(permisos) p where p like 'tab:%') and not ('tab:equipos' = any(permisos));
