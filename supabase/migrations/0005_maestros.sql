-- Módulo Maestros: lotes (opcionales), catálogo de cultivos, festivos y costes del personal
-- (tarifa normal / extra / festivo, con condiciones propias por trabajador). Solo el administrador los gestiona.

-- ---------- Lotes: subdivisión opcional de la parcela (finca → parcela → lote) ----------
create table lotes (
  id uuid primary key default gen_random_uuid(),
  parcela_id uuid not null references parcelas(id) on delete restrict,
  codigo text not null,
  nombre text,
  superficie_ha numeric(10,2) check (superficie_ha is null or superficie_ha >= 0),
  estado estado_parcela not null default 'activa',
  observaciones text,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  unique (parcela_id, codigo)
);
alter table lotes enable row level security;
create policy lotes_select on lotes for select to authenticated
  using (exists (select 1 from parcelas p where p.id = parcela_id and puede_ver_finca(p.finca_id)));
create policy lotes_admin on lotes for all to authenticated using (es_admin()) with check (es_admin());

alter table cultivos_parcela add column lote_id uuid references lotes(id);
alter table cosechas add column lote_id uuid references lotes(id);
alter table partes_trabajo add column lote_id uuid references lotes(id);
alter table gastos add column lote_id uuid references lotes(id);
create index on cosechas (lote_id) where lote_id is not null;
create index on partes_trabajo (lote_id) where lote_id is not null;

-- Un lote debe pertenecer a la parcela indicada; si solo se da el lote, la parcela se deduce
create or replace function lote_coherente() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p uuid;
begin
  if new.lote_id is not null then
    select parcela_id into p from public.lotes where id = new.lote_id;
    if p is null then raise exception 'El lote no existe'; end if;
    if new.parcela_id is null then new.parcela_id := p;
    elsif new.parcela_id <> p then raise exception 'El lote no pertenece a la parcela indicada'; end if;
  end if;
  return new;
end $$;
create trigger trg_lote_cultivos before insert or update on cultivos_parcela for each row execute function lote_coherente();
create trigger trg_lote_cosechas before insert or update on cosechas for each row execute function lote_coherente();
create trigger trg_lote_partes before insert or update on partes_trabajo for each row execute function lote_coherente();
create trigger trg_lote_gastos before insert or update on gastos for each row execute function lote_coherente();

-- El control de duplicados de partes distingue también el lote
drop index partes_trabajo_dedupe;
create unique index partes_trabajo_dedupe on partes_trabajo (
  fecha, finca_id,
  coalesce(parcela_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(lote_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(trabajador_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(equipo_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(tipo_trabajo, ''), coalesce(actividad, '')
);

-- ---------- Catálogo de cultivos y variedades ----------
create table cultivos_maestro (
  id uuid primary key default gen_random_uuid(),
  cultivo text not null,
  variedad text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index cultivos_maestro_unico on cultivos_maestro (lower(cultivo), lower(coalesce(variedad, '')));
alter table cultivos_maestro enable row level security;
create policy cmaestro_select on cultivos_maestro for select to authenticated using (true);
create policy cmaestro_admin on cultivos_maestro for all to authenticated using (es_admin()) with check (es_admin());

-- ---------- Festivos (para aplicar la tarifa festiva automáticamente) ----------
create table festivos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  nombre text not null,
  finca_id uuid references fincas(id),      -- null = vale para todas las fincas
  created_at timestamptz not null default now()
);
create unique index festivos_unico on festivos (fecha, coalesce(finca_id, '00000000-0000-0000-0000-000000000000'));
alter table festivos enable row level security;
create policy festivos_select on festivos for select to authenticated using (true);
create policy festivos_admin on festivos for all to authenticated using (es_admin()) with check (es_admin());

-- ---------- Costes del personal: normal / extra / festivo ----------
-- Un trabajador con condiciones acordadas usa SUS tarifas; una cuadrilla usa las de su equipo.
alter table trabajadores
  add column coste_hora_extra numeric(8,2) check (coste_hora_extra is null or coste_hora_extra >= 0),
  add column coste_hora_festivo numeric(8,2) check (coste_hora_festivo is null or coste_hora_festivo >= 0),
  add column condiciones text;
alter table equipos
  add column coste_hora_extra numeric(8,2) check (coste_hora_extra is null or coste_hora_extra >= 0),
  add column coste_hora_festivo numeric(8,2) check (coste_hora_festivo is null or coste_hora_festivo >= 0),
  add column condiciones text;

alter table partes_trabajo
  add column horas_extra_por_trabajador numeric(6,2) not null default 0 check (horas_extra_por_trabajador >= 0),
  add column festivo boolean not null default false,
  add column horas_extra_totales numeric(8,2),
  add column coste_hora_extra numeric(8,2),       -- tarifas aplicadas (se guardan para conservar el histórico)
  add column coste_hora_festivo numeric(8,2),
  add constraint partes_extra_le_horas check (horas_extra_por_trabajador <= horas_por_trabajador);

-- Coste del parte:
--   día festivo (marcado o en la tabla de festivos): todas las horas × tarifa festivo
--   resto: horas normales × tarifa normal + horas extra × tarifa extra
-- Si falta una tarifa necesaria, el coste queda vacío (no se estima).
create or replace function calc_parte_trabajo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_norm numeric; v_extra numeric; v_fest numeric; v_ext numeric; v_normales numeric;
begin
  if new.hora_entrada is not null and new.hora_salida is not null and new.hora_salida > new.hora_entrada then
    new.horas_por_trabajador := round(extract(epoch from (new.hora_salida - new.hora_entrada)) / 3600.0, 2);
  end if;
  new.horas_totales := new.horas_por_trabajador * new.num_trabajadores;
  v_ext := least(coalesce(new.horas_extra_por_trabajador, 0), new.horas_por_trabajador);
  new.horas_extra_por_trabajador := v_ext;
  new.horas_extra_totales := v_ext * new.num_trabajadores;

  if new.trabajador_id is not null then
    select coste_hora, coste_hora_extra, coste_hora_festivo into v_norm, v_extra, v_fest
      from public.trabajadores where id = new.trabajador_id;
  elsif new.equipo_id is not null then
    select coste_hora, coste_hora_extra, coste_hora_festivo into v_norm, v_extra, v_fest
      from public.equipos where id = new.equipo_id;
  end if;
  -- lo ya aplicado al parte manda (histórico o tarifa indicada a mano)
  v_norm  := coalesce(new.coste_hora, v_norm);
  v_extra := coalesce(new.coste_hora_extra, v_extra);
  v_fest  := coalesce(new.coste_hora_festivo, v_fest);

  if not new.festivo then
    new.festivo := exists (select 1 from public.festivos f
      where f.fecha = new.fecha and (f.finca_id is null or f.finca_id = new.finca_id));
  end if;

  new.coste_hora := v_norm; new.coste_hora_extra := v_extra; new.coste_hora_festivo := v_fest;
  if new.festivo then
    new.coste_total := case when v_fest is null then null else round(new.horas_totales * v_fest, 2) end;
  else
    v_normales := new.horas_por_trabajador - v_ext;
    if (v_normales > 0 and v_norm is null) or (v_ext > 0 and v_extra is null) then
      new.coste_total := null;
    else
      new.coste_total := round(new.num_trabajadores * (v_normales * coalesce(v_norm, 0) + v_ext * coalesce(v_extra, 0)), 2);
    end if;
  end if;
  return new;
end $$;

-- ---------- Permisos: los maestros solo los gestiona el administrador ----------
drop policy fincas_update on fincas;
create policy fincas_update on fincas for update to authenticated using (es_admin()) with check (es_admin());
drop policy parcelas_write on parcelas;
create policy parcelas_write on parcelas for all to authenticated using (es_admin()) with check (es_admin());
drop policy cultivos_write on cultivos_parcela;
create policy cultivos_write on cultivos_parcela for all to authenticated using (es_admin()) with check (es_admin());
drop policy trab_write on trabajadores;
create policy trab_write on trabajadores for all to authenticated using (es_admin()) with check (es_admin());
drop policy equipos_write on equipos;
create policy equipos_write on equipos for all to authenticated using (es_admin()) with check (es_admin());

-- Auditoría de los nuevos maestros
create trigger trg_audit_lotes after insert or update or delete on lotes for each row execute function audit_trigger();
create trigger trg_audit_cultivos_maestro after insert or update or delete on cultivos_maestro for each row execute function audit_trigger();
create trigger trg_audit_festivos after insert or update or delete on festivos for each row execute function audit_trigger();
