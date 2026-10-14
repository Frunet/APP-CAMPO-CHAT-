-- Costes generales: personal fijo, amortizaciones, gastos financieros, seguros… que no salen de los partes ni de los gastos de campo.
-- finca_id NULL = coste general de la empresa (se reparte entre las fincas activas); con finca_id = coste propio de esa finca.
-- No se guardan como gastos: se devengan por días y se imputan a cada campaña (ver src/lib/costes-generales.ts).
create table costes_generales (
  id uuid primary key default gen_random_uuid(),
  concepto text not null check (length(trim(concepto)) > 0),
  categoria text not null check (categoria in ('personal_fijo','amortizacion','financiero','seguros','otros')),
  finca_id uuid references fincas(id) on delete restrict,
  reparto text not null default 'hectareas' check (reparto in ('hectareas','iguales')),
  importe numeric(12,2) not null check (importe >= 0),
  periodicidad text not null check (periodicidad in ('mensual','trimestral','anual','unico')),
  desde date not null,
  hasta date,
  valor_adquisicion numeric(12,2) check (valor_adquisicion is null or valor_adquisicion >= 0),
  vida_util_anios numeric(5,1) check (vida_util_anios is null or vida_util_anios > 0),
  observaciones text,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  check (hasta is null or hasta >= desde),
  check (periodicidad <> 'unico' or hasta is null or hasta >= desde)
);
create index on costes_generales (finca_id);

alter table costes_generales enable row level security;
-- Solo el administrador los ve y los gestiona
create policy costes_generales_admin on costes_generales for all to authenticated using (es_admin()) with check (es_admin());
create trigger trg_audit_costes_generales after insert or update or delete on costes_generales for each row execute function audit_trigger();
