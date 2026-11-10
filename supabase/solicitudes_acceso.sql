-- Solicitudes de acceso (como en Surtido de Línea).
-- Cualquiera envía una solicitud desde la pantalla de inicio, sin cuenta. El administrador la aprueba en Usuarios
-- con un rol y una contraseña inicial; la función cp-aprobar-acceso crea la cuenta (o usa la que ya existe con
-- ese correo), le pone el rol y liga el correo a la ficha del número de empleado.
-- Ejecutar después de admin_y_catalogos.sql. Se puede correr más de una vez.

create table if not exists public.cp_solicitudes_acceso (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 80),
  num text not null check (char_length(btrim(num)) between 1 and 30),
  email text not null check (char_length(email) <= 120 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  puesto text check (puesto is null or char_length(puesto) <= 80),
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  rol text,
  creado timestamptz not null default now(),
  revisado timestamptz,
  revisado_por text
);
create unique index if not exists cp_solicitudes_acceso_pendiente on public.cp_solicitudes_acceso (lower(email)) where estado = 'pendiente';

alter table public.cp_solicitudes_acceso enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='cp_solicitudes_acceso' and policyname='crear') then
    create policy "crear" on public.cp_solicitudes_acceso for insert to anon, authenticated
      with check (estado = 'pendiente' and revisado is null and revisado_por is null and rol is null); end if;
  if not exists (select 1 from pg_policies where tablename='cp_solicitudes_acceso' and policyname='leer') then
    create policy "leer" on public.cp_solicitudes_acceso for select to authenticated
      using (public.mi_rol() = 'admin' or lower(email) = public.mi_email()); end if;
  if not exists (select 1 from pg_policies where tablename='cp_solicitudes_acceso' and policyname='revisar') then
    create policy "revisar" on public.cp_solicitudes_acceso for update to authenticated
      using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin'); end if;
  if not exists (select 1 from pg_policies where tablename='cp_solicitudes_acceso' and policyname='borrar') then
    create policy "borrar" on public.cp_solicitudes_acceso for delete to authenticated using (public.mi_rol() = 'admin'); end if;
end $$;
grant insert on public.cp_solicitudes_acceso to anon;
grant select, insert, update, delete on public.cp_solicitudes_acceso to authenticated;
do $$ begin begin alter publication supabase_realtime add table public.cp_solicitudes_acceso; exception when others then null; end; end $$;

-- Aviso a los administradores por cada solicitud nueva
create or replace function public.cp_solicitud_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text;
begin
  for d in select lower(email) from public.perfiles where rol = 'admin' and coalesce(email,'') <> '' loop
    insert into public.avisos (para_email, tipo, num, fecha, titulo, detalle)
    values (d, 'acceso', new.num, current_date, 'Solicitud de acceso: ' || new.nombre,
            new.email || ' · No. empleado ' || new.num || coalesce(' · ' || nullif(new.puesto,''), '') || ' · apruébala en Usuarios');
  end loop;
  return new;
end $$;
revoke execute on function public.cp_solicitud_aviso() from public, anon, authenticated;
create or replace trigger cp_solicitud_aviso after insert on public.cp_solicitudes_acceso for each row execute function public.cp_solicitud_aviso();
