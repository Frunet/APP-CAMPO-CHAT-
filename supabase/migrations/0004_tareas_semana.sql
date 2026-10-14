-- Tareas sin fecha y asignables a una semana
-- Estados de una tarea: con día fijo (fecha), asignada a una semana (semana_inicio, sin fecha) o pendiente (ambas nulas).

alter table tareas alter column fecha drop not null;
alter table tareas add column semana_inicio date;
alter table tareas add constraint tareas_semana_lunes
  check (semana_inicio is null or extract(isodow from semana_inicio) = 1);

-- Las tareas existentes pasan a pertenecer a la semana de su fecha
update tareas set semana_inicio = date_trunc('week', fecha)::date where fecha is not null;

-- Coherencia: con fecha, la semana se deduce de ella; sin fecha, la semana dada se normaliza al lunes
create or replace function tareas_semana() returns trigger
language plpgsql as $$
begin
  if new.fecha is not null then
    new.semana_inicio := date_trunc('week', new.fecha)::date;
  elsif new.semana_inicio is not null then
    new.semana_inicio := date_trunc('week', new.semana_inicio)::date;
  end if;
  return new;
end $$;
create trigger trg_tareas_semana before insert or update on tareas
  for each row execute function tareas_semana();

create index on tareas (semana_inicio) where not completada;

-- Quien tiene una tarea asignada puede verla y completarla aunque no sea de su finca
drop policy tareas_select on tareas;
create policy tareas_select on tareas for select to authenticated
  using (
    (finca_id is null and (created_by = (select auth.uid()) or asignado_a = (select auth.uid())))
    or puede_ver_finca(finca_id)
    or asignado_a = (select auth.uid())
  );

drop policy tareas_write on tareas;
create policy tareas_write on tareas for all to authenticated
  using (
    puede_escribir_finca(coalesce(finca_id, '00000000-0000-0000-0000-000000000000'::uuid), array['responsable','encargado']::app_rol[])
    or created_by = (select auth.uid())
    or asignado_a = (select auth.uid())
  )
  with check (mi_rol() in ('administrador','responsable','encargado'));
