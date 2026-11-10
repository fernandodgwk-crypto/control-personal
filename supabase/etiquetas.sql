-- Herramental → Etiquetas: listado de identificaciones (modelo, edificio, número de serie) para generar PDF.
-- Ejecutar después de equipos.sql. Se puede correr más de una vez.

create table if not exists public.eq_etiquetas (
  id uuid primary key default gen_random_uuid(),
  modelo text not null default '',
  edificio text not null default '',
  sn text not null default '',
  qr text not null default '',          -- contenido del QR; vacío = según el ajuste general
  copias int not null default 1 check (copias between 1 and 99),
  equipo_id text,                        -- si viene del registro de equipos
  impresiones int not null default 0,
  ultima_impresion timestamptz,
  creado_email text default '',
  creado timestamptz not null default now()
);
create index if not exists eq_etiquetas_creado on public.eq_etiquetas (creado);
alter table public.eq_etiquetas enable row level security;
grant select, insert, update, delete on public.eq_etiquetas to authenticated;
revoke all on public.eq_etiquetas from anon;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='eq_etiquetas' and policyname='leer') then
    create policy "leer" on public.eq_etiquetas for select to authenticated using (public.puede_ver()); end if;
  if not exists (select 1 from pg_policies where tablename='eq_etiquetas' and policyname='operar') then
    create policy "operar" on public.eq_etiquetas for all to authenticated
      using (public.tiene_permiso('equipos_operar') or public.tiene_permiso('equipos_admin'))
      with check (public.tiene_permiso('equipos_operar') or public.tiene_permiso('equipos_admin')); end if;
end $$;
do $$ begin begin alter publication supabase_realtime add table public.eq_etiquetas; exception when others then null; end; end $$;
