-- Horas de tractor: son de la finca y del día (un cajón por día y finca), no de las personas; no multiplican por trabajadores ni llevan tarifa.
create table horas_tractor (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  finca_id uuid not null references fincas(id) on delete cascade,
  horas numeric(5,2) not null check (horas > 0 and horas <= 24),
  observaciones text,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fecha, finca_id)
);
alter table horas_tractor enable row level security;
create policy tractor_select on horas_tractor for select to authenticated using (puede_ver_finca(finca_id));
create policy tractor_write on horas_tractor for all to authenticated
  using (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]))
  with check (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]));
create trigger trg_horas_tractor_upd before update on horas_tractor for each row execute function set_updated_at();
create trigger trg_audit_horas_tractor after insert or update or delete on horas_tractor for each row execute function audit_trigger();
