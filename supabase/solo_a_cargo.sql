-- Asistencia, vacaciones/descansos y tiempo extra: solo el supervisor a cargo o su back
-- (y el administrador). Se quita "gestionar movimientos" al rol supervisor.
-- Ejecutar después de movimientos_aprobadores.sql. Se puede correr más de una vez.

create or replace function public.a_cargo_de(p_sup text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.mi_rol() = 'admin' or public.es_supervisor(p_sup) or public.es_backup_de(p_sup)
$$;
revoke execute on function public.a_cargo_de(text) from public, anon;
grant execute on function public.a_cargo_de(text) to authenticated;

alter policy "marcar asistencia" on public.asistencia
  using (public.a_cargo_de((select e.supervisor from public.empleados e where e.num = asistencia.num)))
  with check (public.a_cargo_de((select e.supervisor from public.empleados e where e.num = asistencia.num)));

alter policy "registrar" on public.tiempo_extra
  using (public.a_cargo_de((select e.supervisor from public.empleados e where e.num = tiempo_extra.num)))
  with check (public.a_cargo_de((select e.supervisor from public.empleados e where e.num = tiempo_extra.num)));

create or replace function public.programar_ausencia(p_num text, p_tipo text, p_desde date, p_hasta date, p_compensa date, p_nota text)
returns uuid language plpgsql security definer set search_path = public as $$
declare e public.empleados; v_id uuid; t text; dt text;
begin
  select * into e from public.empleados where num = p_num;
  if not found then raise exception 'No existe la persona %', p_num; end if;
  if not public.a_cargo_de(e.supervisor) then
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
  if not public.a_cargo_de(e.supervisor) then
    raise exception 'Solo el supervisor a cargo (o su back) puede cancelar esta programación' using errcode='42501'; end if;
  update public.programacion set estado = 'cancelado' where id = p_id;
end $$;

update public.roles set permisos = array_remove(permisos, 'gestionar_movimientos') where nombre = 'supervisor';
