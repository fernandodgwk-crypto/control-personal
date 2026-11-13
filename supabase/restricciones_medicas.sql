-- Restricciones médicas del personal.
-- Se captura QUÉ NO PUEDE HACER la persona (limitaciones) y su vigencia, nunca el diagnóstico.
-- Todos los que ven a la persona ven que tiene restricción y sus limitaciones (lo necesitan para asignarla);
-- la nota y quién la registró solo los ven el administrador, el supervisor a cargo, su back y el gerente.
-- Ejecutar después de solo_a_cargo.sql y movimientos_aprobadores.sql. Se puede correr más de una vez.

create table if not exists public.restricciones_medicas (
  num text primary key references public.empleados(num) on update cascade on delete cascade,
  tipo text not null default 'temporal' check (tipo in ('temporal','permanente')),
  desde date not null default current_date,
  hasta date,                                   -- vacío = sin fecha de término (permanente)
  limitaciones text[] not null default '{}',
  nota text not null default '',                -- indicaciones del médico, sin diagnóstico
  registro_email text not null default '',
  actualizado timestamptz not null default now(),
  check (hasta is null or hasta >= desde)
);
alter table public.restricciones_medicas enable row level security;
grant select, insert, update, delete on public.restricciones_medicas to authenticated;
revoke all on public.restricciones_medicas from anon;

-- Quién ve el detalle y quién captura: admin, supervisor a cargo, su back, o el gerente de la persona
create or replace function public.puede_restriccion(p_num text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.empleados e where e.num = p_num
                 and (public.a_cargo_de(e.supervisor) or public.es_gerente(e.gerente)))
$$;
revoke execute on function public.puede_restriccion(text) from public, anon;
grant execute on function public.puede_restriccion(text) to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='restricciones_medicas' and policyname='ver detalle') then
    create policy "ver detalle" on public.restricciones_medicas for select to authenticated using (public.puede_restriccion(num)); end if;
  if not exists (select 1 from pg_policies where tablename='restricciones_medicas' and policyname='capturar') then
    create policy "capturar" on public.restricciones_medicas for all to authenticated
      using (public.puede_restriccion(num)) with check (public.puede_restriccion(num)); end if;
end $$;

-- Lo que ve todo el que tiene acceso: quién tiene restricción, sus limitaciones y vigencia (sin nota)
create or replace function public.restricciones_publicas()
returns table (num text, tipo text, desde date, hasta date, limitaciones text[])
language sql stable security definer set search_path = public as $$
  select r.num, r.tipo, r.desde, r.hasta, r.limitaciones from public.restricciones_medicas r where public.puede_ver()
$$;
revoke execute on function public.restricciones_publicas() from public, anon;
grant execute on function public.restricciones_publicas() to authenticated;

-- Sello de quién y cuándo, y aviso al admin, gerente y supervisor a cargo (sin la nota)
create or replace function public.restriccion_registro() returns trigger
language plpgsql security definer set search_path = public as $$
declare e public.empleados; lim text;
begin
  new.registro_email := public.mi_email(); new.actualizado := now();
  if new.tipo = 'permanente' then new.hasta := null; end if;
  select * into e from public.empleados where num = new.num;
  lim := coalesce(nullif(array_to_string(new.limitaciones, ', '), ''), 'sin limitaciones capturadas');
  perform public.avisar(new.num, 'restriccion', new.desde,
    case when tg_op = 'INSERT' then 'Restricción médica: ' else 'Restricción médica actualizada: ' end || e.nombre,
    lim || ' · ' || case when new.tipo = 'permanente' or new.hasta is null then 'permanente'
                          else 'del ' || to_char(new.desde,'DD/MM/YYYY') || ' al ' || to_char(new.hasta,'DD/MM/YYYY') end
        || ' · registró ' || public.mi_email());
  return new;
end $$;
revoke execute on function public.restriccion_registro() from public, anon, authenticated;
create or replace trigger restriccion_registro before insert or update on public.restricciones_medicas for each row execute function public.restriccion_registro();

do $$ begin begin alter publication supabase_realtime add table public.restricciones_medicas; exception when others then null; end; end $$;

-- Catálogo inicial de limitaciones (Catálogos → Restricciones médicas)
update public.config set data = data || jsonb_build_object('restricciones', jsonb_build_array(
  'No cargar más de 10 kg','No cargar más de 20 kg','No operar montacargas','No operar transpaleta eléctrica',
  'No trabajar en alturas','No permanecer de pie periodos largos','No movimientos repetitivos','No agacharse ni girar el tronco',
  'No tiempo extra','Solo turno diurno','Uso obligatorio de equipo de apoyo'))
where id = 1 and not (data ? 'restricciones');
