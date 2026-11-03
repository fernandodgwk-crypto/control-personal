-- Aplicado en producción el 2026-11-03. Ejecutar después de movimientos.sql.
-- B. Renombrar un valor de catálogo y llevar el cambio a todos los registros
create or replace function public.renombrar_catalogo(p_campo text, p_viejo text, p_nuevo text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0;
begin
  if not public.tiene_permiso('editar_catalogos') then raise exception 'Tu rol no permite editar catálogos' using errcode='42501'; end if;
  if coalesce(trim(p_nuevo),'') = '' then raise exception 'El nombre nuevo no puede ir vacío'; end if;
  perform set_config('cp.movimiento','1',true);
  if p_campo = 'area' then update public.empleados set area = p_nuevo where area = p_viejo;
  elsif p_campo = 'sitio' then update public.empleados set sitio = p_nuevo where sitio = p_viejo;
  elsif p_campo = 'turno' then update public.empleados set turno = p_nuevo where turno = p_viejo;
    update public.asistencia set turno = p_nuevo where turno = p_viejo;
  elsif p_campo = 'posicion' then update public.empleados set posicion = p_nuevo where posicion = p_viejo;
  elsif p_campo = 'gerente' then update public.empleados set gerente = p_nuevo where gerente = p_viejo;
    update public.supervisores set gerente = p_nuevo where gerente = p_viejo;
  elsif p_campo = 'supervisor' then
    if exists (select 1 from public.supervisores where nombre = p_nuevo) then raise exception 'Ya existe un supervisor con ese nombre'; end if;
    update public.supervisores set nombre = p_nuevo where nombre = p_viejo;
    update public.empleados set supervisor = p_nuevo where supervisor = p_viejo;
    update public.movimientos set de_supervisor = p_nuevo where de_supervisor = p_viejo;
    update public.movimientos set a_supervisor = p_nuevo where a_supervisor = p_viejo;
  elsif p_campo = 'cert' then
    update public.empleados set certs = (select coalesce(jsonb_agg(case when c->>'nombre' = p_viejo then jsonb_set(c,'{nombre}',to_jsonb(p_nuevo)) else c end),'[]'::jsonb) from jsonb_array_elements(certs) c)
      where certs @> jsonb_build_array(jsonb_build_object('nombre',p_viejo));
  else raise exception 'Campo inválido'; end if;
  get diagnostics n = row_count;
  perform set_config('cp.movimiento','',true);
  return n;
end $$;
revoke execute on function public.renombrar_catalogo(text,text,text) from public, anon;
grant execute on function public.renombrar_catalogo(text,text,text) to authenticated;

-- C. solicitar_movimiento: si lo pide el admin, se aplica al momento y queda como aprobado
--    (ver la versión completa en la base: rama "if public.mi_rol() = 'admin' then ...").

-- D. Acceso explícito (sustituye a acceso.sql): cuentas nuevas con rol sin_acceso
insert into public.roles (nombre, descripcion, permisos) values ('sin_acceso','Cuenta sin acceso a Control de Personal.',array[]::text[]) on conflict (nombre) do nothing;
alter table public.perfiles alter column rol set default 'sin_acceso';
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, email, rol) values (new.id, new.email, 'sin_acceso') on conflict do nothing;
  return new;
end $$;
alter policy "leer empleados" on public.empleados using (public.puede_ver());
alter policy "leer asistencia" on public.asistencia using (public.puede_ver());
alter policy "leer config" on public.config using (public.puede_ver());
