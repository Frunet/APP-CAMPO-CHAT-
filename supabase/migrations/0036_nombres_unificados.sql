-- Unifica los nombres visibles de fincas y trabajadores:
-- espacios normalizados y formato de nombre propio, sin tocar códigos ni UUID.
begin;

create or replace function public.nombre_unificado(p_nombre text)
returns text
language sql immutable
set search_path = ''
as $$
  select initcap(lower(trim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'))));
$$;

update public.fincas set nombre = public.nombre_unificado(nombre)
where nombre is distinct from public.nombre_unificado(nombre);

update public.trabajadores set nombre = public.nombre_unificado(nombre)
where nombre is distinct from public.nombre_unificado(nombre);

create or replace function public.normalizar_nombres_maestros()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nombre := public.nombre_unificado(new.nombre);
  return new;
end;
$$;

drop trigger if exists trg_finca_nombre_unificado on public.fincas;
create trigger trg_finca_nombre_unificado
before insert or update of nombre on public.fincas
for each row execute function public.normalizar_nombres_maestros();

drop trigger if exists trg_trabajador_nombre_unificado on public.trabajadores;
create trigger trg_trabajador_nombre_unificado
before insert or update of nombre on public.trabajadores
for each row execute function public.normalizar_nombres_maestros();

revoke all on function public.nombre_unificado(text) from public, anon;
grant execute on function public.nombre_unificado(text) to authenticated;
notify pgrst, 'reload schema';
commit;
