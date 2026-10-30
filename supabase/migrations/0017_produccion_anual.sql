-- Histórico de producción por finca, cultivo/variedad y año (kg e ingresos €), p. ej. de una tabla resumen de campañas pasadas.
-- Un dato por finca + cultivo + año: volver a importar actualiza, no duplica.
create table produccion_anual (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id) on delete cascade,
  cultivo text not null check (length(trim(cultivo)) > 0),
  anio int not null check (anio between 1990 and 2100),
  kg numeric(14,2) check (kg is null or kg >= 0),
  importe numeric(14,2),
  documento_id uuid references documentos(id) on delete set null,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index produccion_anual_uk on produccion_anual (finca_id, lower(trim(cultivo)), anio);
alter table produccion_anual enable row level security;
create policy produccion_select on produccion_anual for select to authenticated using (puede_ver_finca(finca_id));
create policy produccion_write on produccion_anual for all to authenticated
  using (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]))
  with check (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]));
create trigger trg_produccion_anual_upd before update on produccion_anual for each row execute function set_updated_at();
create trigger trg_audit_produccion_anual after insert or update or delete on produccion_anual for each row execute function audit_trigger();
