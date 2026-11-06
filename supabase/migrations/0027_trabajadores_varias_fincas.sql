-- Una ficha y una tarifa por trabajador; actividad independiente en cada finca.
begin;

create table public.trabajadores_fincas (
  trabajador_id uuid not null references public.trabajadores(id) on delete cascade,
  finca_id uuid not null references public.fincas(id) on delete restrict,
  activo boolean not null default true,
  primary key (trabajador_id, finca_id)
);
create index trabajadores_fincas_finca_idx on public.trabajadores_fincas(finca_id, trabajador_id);
alter table public.trabajadores_fincas enable row level security;
create policy tf_select on public.trabajadores_fincas for select to authenticated
  using (public.puede_ver_finca(finca_id));
create policy tf_admin on public.trabajadores_fincas for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
grant select, insert, update, delete on public.trabajadores_fincas to authenticated;
create trigger trg_audit_trabajadores_fincas after insert or update or delete
  on public.trabajadores_fincas for each row execute function public.audit_trigger();

-- Conserva las asignaciones actuales, incluso las de trabajadores inactivos.
-- Antes, una ficha sin finca estaba disponible en todas: conserva ese alcance inicial.
insert into public.trabajadores_fincas(trabajador_id, finca_id)
  select t.id, f.id from public.trabajadores t join public.fincas f
    on t.finca_id = f.id or (t.finca_id is null and f.activa);

create function public.trabajador_finca_inicial() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.trabajadores_fincas(trabajador_id, finca_id)
    select new.id, f.id from public.fincas f
      where f.id = new.finca_id or (new.finca_id is null and f.activa);
  return new;
end $$;
create trigger trg_trabajador_finca_inicial after insert on public.trabajadores
  for each row execute function public.trabajador_finca_inicial();

-- Solo se amplía la consulta a usuarios que ya pueden ver una finca asignada.
drop policy trab_select on public.trabajadores;
create policy trab_select on public.trabajadores for select to authenticated
  using (public.es_admin() or exists (
    select 1 from public.trabajadores_fincas tf
    where tf.trabajador_id = trabajadores.id and public.puede_ver_finca(tf.finca_id)
  ));

-- Guarda todas las casillas en una transacción y mantiene las bajas en el historial.
create function public.guardar_fincas_trabajador(p_id uuid, p_fincas uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede asignar fincas' using errcode = '42501';
  end if;
  perform 1 from public.trabajadores where id = p_id for update;
  if not found then raise exception 'El trabajador no existe'; end if;
  if p_fincas is null or exists (
    select 1 from unnest(p_fincas) requested(finca_id)
    where requested.finca_id is null or not exists (select 1 from public.fincas f where f.id = requested.finca_id)
  ) then raise exception 'Hay una finca no válida' using errcode = '23514'; end if;
  update public.trabajadores_fincas set activo = false
    where trabajador_id = p_id and activo and not (finca_id = any(p_fincas));
  insert into public.trabajadores_fincas(trabajador_id, finca_id, activo)
    select p_id, id, true from (select distinct unnest(p_fincas) id) f
    on conflict (trabajador_id, finca_id) do update set activo = true
      where not trabajadores_fincas.activo;
end $$;
revoke all on function public.guardar_fincas_trabajador(uuid, uuid[]) from public, anon;
grant execute on function public.guardar_fincas_trabajador(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
