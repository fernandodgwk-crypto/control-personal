-- Quién aprueba un cambio de supervisor.
-- Ejecutar después de movimientos.sql y admin_y_catalogos.sql. Se puede correr más de una vez.
--
-- Aprueban o rechazan: el administrador, el supervisor involucrado que NO lo pidió
-- (en un pase, quien recibe; en una solicitud, el supervisor actual) y el gerente
-- de la persona o de cualquiera de los dos supervisores.
-- Quien pidió el movimiento nunca lo aprueba: solo puede cancelarlo.
-- El permiso "gestionar movimientos" ya no basta para aprobar ni para cambiar el
-- supervisor directo desde la ficha (eso queda solo para el administrador).

-- Cuenta del gerente: el correo de su ficha en Personal
create or replace function public.es_gerente(p_nombre text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_nombre,'') <> '' and exists (
    select 1 from public.empleados e
    where lower(trim(e.nombre)) = lower(trim(p_nombre))
      and coalesce(e.email,'') <> '' and lower(trim(e.email)) = public.mi_email())
$$;

create or replace function public.puede_aprobar_movimiento(p_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare m public.movimientos; ger_persona text; ger_de text; ger_a text;
begin
  select * into m from public.movimientos where id = p_id;
  if not found or m.estado <> 'pendiente' then return false; end if;
  if public.mi_rol() = 'admin' then return true; end if;
  if m.solicitado_por = auth.uid() or lower(coalesce(m.solicitado_email,'')) = public.mi_email() then return false; end if;
  if public.es_supervisor(m.de_supervisor) or public.es_supervisor(m.a_supervisor) then return true; end if;
  select gerente into ger_persona from public.empleados where num = m.num;
  select gerente into ger_de from public.supervisores where nombre = m.de_supervisor;
  select gerente into ger_a from public.supervisores where nombre = m.a_supervisor;
  return public.es_gerente(ger_persona) or public.es_gerente(ger_de) or public.es_gerente(ger_a);
end $$;

create or replace function public.resolver_movimiento(p_id uuid, p_aprobar boolean, p_comentario text)
returns void language plpgsql security definer set search_path = public as $$
declare m public.movimientos; e public.empleados; g text;
begin
  select * into m from public.movimientos where id = p_id for update;
  if not found or m.estado <> 'pendiente' then raise exception 'El movimiento ya no está pendiente'; end if;
  if public.mi_rol() <> 'admin' and (m.solicitado_por = auth.uid() or lower(coalesce(m.solicitado_email,'')) = public.mi_email()) then
    raise exception 'No puedes aprobar ni rechazar tu propia solicitud; la aprueba el otro supervisor, el gerente o el administrador' using errcode='42501'; end if;
  if not public.puede_aprobar_movimiento(p_id) then
    raise exception 'No te toca aprobar este movimiento: lo aprueba el otro supervisor, el gerente o el administrador' using errcode='42501'; end if;
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

-- El supervisor directo solo cambia por un movimiento aprobado, o lo cambia el administrador
create or replace function public.empleados_guard_supervisor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if coalesce(new.supervisor,'') is distinct from coalesce(old.supervisor,'')
     and coalesce(current_setting('cp.movimiento', true),'') <> '1'
     and public.mi_rol() <> 'admin' then
    raise exception 'El supervisor solo cambia con un movimiento aprobado (pestaña Movimientos)' using errcode = '42501';
  end if;
  return new;
end $$;

revoke execute on function public.es_gerente(text), public.puede_aprobar_movimiento(uuid) from public, anon;
grant execute on function public.es_gerente(text), public.puede_aprobar_movimiento(uuid) to authenticated;
