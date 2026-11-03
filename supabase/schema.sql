-- Control de Personal B2/B2B · esquema para Supabase
-- Ejecuta este archivo completo en Supabase → SQL Editor → New query → Run.

-- 1. Perfiles y roles ---------------------------------------------------------
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nombre text default '',
  rol text not null default 'lector' check (rol in ('admin','supervisor','lector')),
  creado timestamptz default now()
);

-- Cada usuario nuevo recibe un perfil "lector"; el admin le sube el rol.
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.crear_perfil();

create or replace function public.mi_rol() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select rol from public.perfiles where id = auth.uid()), 'lector')
$$;

-- Las funciones internas no se exponen al público.
revoke execute on function public.crear_perfil() from public, anon, authenticated;
revoke execute on function public.mi_rol() from public, anon;
grant execute on function public.mi_rol() to authenticated;

-- 2. Tablas -------------------------------------------------------------------
create table if not exists public.empleados (
  num text primary key,
  nombre text not null,
  email text default '',
  turno text default '',
  posicion text default '',
  area text default '',
  sitio text default '',
  gerente text default '',
  puesto text default '',
  supervisor text default '',
  antiguedad text default '',
  ingreso date,
  tipo text default '',
  clasif text default '',
  celular text default '',
  certs jsonb not null default '[]'::jsonb,   -- [{nombre, folio, vence:'YYYY-MM-DD'}]
  activo boolean not null default true,
  notas text default '',
  actualizado timestamptz default now()
);

-- Para proyectos creados con una versión anterior de este archivo
alter table public.empleados add column if not exists sitio text default '';
alter table public.empleados add column if not exists gerente text default '';

create table if not exists public.asistencia (
  fecha date not null,
  num text not null references public.empleados(num) on delete cascade on update cascade,
  estado text not null check (estado in ('A','R','F','P','V','I')),
  turno text default '',
  marcado_por uuid default auth.uid(),
  marcado_en timestamptz default now(),
  primary key (fecha, num)
);
create index if not exists asistencia_num_fecha on public.asistencia (num, fecha);

create table if not exists public.config (
  id int primary key default 1 check (id = 1),
  data jsonb not null
);

-- 3. Seguridad (RLS) ----------------------------------------------------------
alter table public.perfiles   enable row level security;
alter table public.empleados  enable row level security;
alter table public.asistencia enable row level security;
alter table public.config     enable row level security;

drop policy if exists "leer perfiles" on public.perfiles;
create policy "leer perfiles" on public.perfiles for select to authenticated
  using (id = auth.uid() or public.mi_rol() = 'admin');
drop policy if exists "admin edita perfiles" on public.perfiles;
create policy "admin edita perfiles" on public.perfiles for update to authenticated
  using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');

drop policy if exists "leer empleados" on public.empleados;
create policy "leer empleados" on public.empleados for select to authenticated using (true);
drop policy if exists "admin edita empleados" on public.empleados;
create policy "admin edita empleados" on public.empleados for all to authenticated
  using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');

drop policy if exists "leer asistencia" on public.asistencia;
create policy "leer asistencia" on public.asistencia for select to authenticated using (true);
drop policy if exists "marcar asistencia" on public.asistencia;
create policy "marcar asistencia" on public.asistencia for all to authenticated
  using (public.mi_rol() in ('admin','supervisor')) with check (public.mi_rol() in ('admin','supervisor'));

drop policy if exists "leer config" on public.config;
create policy "leer config" on public.config for select to authenticated using (true);
drop policy if exists "admin edita config" on public.config;
create policy "admin edita config" on public.config for all to authenticated
  using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');

-- Permisos de tabla: solo usuarios con sesión (las reglas RLS de arriba deciden qué filas).
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.empleados, public.asistencia, public.config to authenticated;
grant select, update on public.perfiles to authenticated;
revoke all on public.empleados, public.asistencia, public.config, public.perfiles from anon;

-- 4. Tiempo real (para que todos vean el pase de lista al momento) ----------
do $$ begin
  begin alter publication supabase_realtime add table public.asistencia; exception when others then null; end;
  begin alter publication supabase_realtime add table public.empleados;  exception when others then null; end;
  begin alter publication supabase_realtime add table public.config;     exception when others then null; end;
end $$;

-- 5. Catálogos iniciales ------------------------------------------------------
insert into public.config (id, data) values (1, '{
  "areas": ["Aduana","Insercion B2B","Doblez","Soldadura B2","Punzonado","Building B2","Roscado & Pulido","Building B2B","Empaque B2","Pintura","Remachado","Cool It","NPI","Prensas 200T","Prensas 600T","Soldadura","Prensas Roboticas","Scrap","Insercion B2","Mask","Prensas C","Lavado","Empaque","Robot Soldadura","Cabina Soldadura"],
  "posiciones": ["Lider","Materialista","Montacarguista","Aduanas","Conteos Ciclicos","Control de Produccion","Supervisor","Scrap"],
  "turnos": ["1 Gdl","2 Gdl","3 Gdl"],
  "sitios": ["MX Guadalajara North Bldg 1","MX Guadalajara North Bldg 2","MX Guadalajara North Bldg B2B"],
  "gerentes": [],
  "perfiles": {},
  "certs": ["Montacargas","Grúa viajera","Manejo de materiales peligrosos","Conteo cíclico / inventarios","Primeros auxilios","Brigada contra incendio"],
  "certReq": {"Montacarguista": ["Montacargas"]},
  "req": {"area": {}, "posicion": {}}
}'::jsonb) on conflict (id) do nothing;
