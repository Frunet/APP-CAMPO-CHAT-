-- Fase 3: programación de avisos, objetivos de producción

alter table avisos_reglas
  add column ultima_ejecucion timestamptz,
  add column zona_horaria text not null default 'Europe/Madrid',
  add column dia_semana int not null default 1 check (dia_semana between 1 and 7), -- 1 = lunes
  add column dia_mes int not null default 1 check (dia_mes between 1 and 28);

create index on avisos (estado, pospuesto_hasta);
create index on avisos (email_enviado_at) where email_enviado_at is null;

create type periodo_objetivo as enum ('semanal', 'mensual');

create table objetivos (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id),
  parcela_id uuid references parcelas(id),
  periodo periodo_objetivo not null,
  kg_objetivo numeric(12,2) not null check (kg_objetivo > 0),
  activo boolean not null default true,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
create index on objetivos (finca_id) where activo;
alter table objetivos enable row level security;

create policy objetivos_select on objetivos for select to authenticated
  using (puede_ver_finca(finca_id));
create policy objetivos_write on objetivos for all to authenticated
  using (puede_escribir_finca(finca_id, array['responsable']::app_rol[]))
  with check (puede_escribir_finca(finca_id, array['responsable']::app_rol[]));

create trigger trg_audit_objetivos after insert or update or delete on objetivos
  for each row execute function audit_trigger();
create trigger trg_audit_avisos_reglas after insert or update or delete on avisos_reglas
  for each row execute function audit_trigger();
