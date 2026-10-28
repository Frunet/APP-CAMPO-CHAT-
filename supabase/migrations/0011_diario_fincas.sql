-- Diario de novedades por finca: lo que no es un parte, un gasto ni una tarea (avances, incidencias, estado de un trabajo…).
-- Compartido con todos los usuarios que ven la finca; se anota desde el chat con confirmación.
create table diario_fincas (
  id uuid primary key default gen_random_uuid(),
  num bigint generated always as identity,
  fecha date not null default current_date,
  finca_id uuid not null references fincas(id) on delete cascade,
  parcela_id uuid references parcelas(id) on delete set null,
  tipo text not null default 'avance' check (tipo in ('avance','incidencia','aviso','otro')),
  tema text,                                           -- p. ej. «anillado», «riego parcela 3»
  texto text not null check (length(trim(texto)) between 3 and 1000),
  activa boolean not null default true,                -- false = retirada (queda en el historial)
  created_by uuid default auth.uid() references profiles(id),
  conversacion_id uuid references chat_conversaciones(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on diario_fincas (finca_id, fecha desc) where activa;
alter table diario_fincas enable row level security;
create policy diario_select on diario_fincas for select to authenticated using (puede_ver_finca(finca_id));
create policy diario_write on diario_fincas for all to authenticated
  using (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]))
  with check (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]));
create trigger trg_audit_diario_fincas after insert or update or delete on diario_fincas for each row execute function audit_trigger();
