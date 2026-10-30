-- Trabajadores: código único, teléfono y observaciones, y HISTÓRICO de coste con fecha de inicio de validez.
-- Un parte usa la tarifa vigente en SU fecha; cambiar la tarifa hoy no altera las horas antiguas.
alter table trabajadores
  add column codigo text check (codigo is null or length(trim(codigo)) between 1 and 30),
  add column telefono text check (telefono is null or length(trim(telefono)) between 1 and 30),
  add column observaciones text,
  add column coste_desde date;
create unique index trabajadores_codigo_uk on trabajadores (lower(trim(codigo))) where codigo is not null;

create table trabajadores_coste (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid not null references trabajadores(id) on delete cascade,
  desde date not null,
  coste_hora numeric(8,2) check (coste_hora is null or coste_hora >= 0),
  coste_hora_extra numeric(8,2) check (coste_hora_extra is null or coste_hora_extra >= 0),
  coste_hora_festivo numeric(8,2) check (coste_hora_festivo is null or coste_hora_festivo >= 0),
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  unique (trabajador_id, desde)
);
alter table trabajadores_coste enable row level security;
create policy tcoste_select on trabajadores_coste for select to authenticated using (mi_rol() in ('administrador','responsable'));
create policy tcoste_admin on trabajadores_coste for all to authenticated using (es_admin()) with check (es_admin());
create trigger trg_audit_trabajadores_coste after insert or update or delete on trabajadores_coste for each row execute function audit_trigger();

-- Las tarifas actuales pasan al histórico (vigentes desde siempre)
insert into trabajadores_coste (trabajador_id, desde, coste_hora, coste_hora_extra, coste_hora_festivo)
  select id, date '2000-01-01', coste_hora, coste_hora_extra, coste_hora_festivo from trabajadores
  where coste_hora is not null or coste_hora_extra is not null or coste_hora_festivo is not null;

-- Al fijar o cambiar la tarifa de un trabajador se anota en el histórico con su fecha de inicio (coste_desde o hoy)
create or replace function trabajador_coste_historico() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_desde date;
begin
  if new.coste_hora is null and new.coste_hora_extra is null and new.coste_hora_festivo is null then return new; end if;
  if tg_op = 'UPDATE'
     and new.coste_hora is not distinct from old.coste_hora and new.coste_hora_extra is not distinct from old.coste_hora_extra
     and new.coste_hora_festivo is not distinct from old.coste_hora_festivo and new.coste_desde is not distinct from old.coste_desde then
    return new;
  end if;
  v_desde := coalesce(case when tg_op = 'INSERT' or new.coste_desde is distinct from old.coste_desde then new.coste_desde end, current_date);
  if exists (select 1 from public.trabajadores_coste where trabajador_id = new.id and desde > v_desde) then
    raise exception 'La tarifa debe empezar después de la última registrada (%): usa una fecha posterior', 
      (select to_char(max(desde), 'DD/MM/YYYY') from public.trabajadores_coste where trabajador_id = new.id) using errcode = '23514';
  end if;
  insert into public.trabajadores_coste (trabajador_id, desde, coste_hora, coste_hora_extra, coste_hora_festivo)
    values (new.id, v_desde, new.coste_hora, new.coste_hora_extra, new.coste_hora_festivo)
    on conflict (trabajador_id, desde) do update
      set coste_hora = excluded.coste_hora, coste_hora_extra = excluded.coste_hora_extra, coste_hora_festivo = excluded.coste_hora_festivo;
  return new;
end $$;
create trigger trg_trab_coste_historico after insert or update on trabajadores for each row execute function trabajador_coste_historico();

create or replace function calc_parte_trabajo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_norm numeric; v_extra numeric; v_fest numeric; v_ext numeric; v_normales numeric;
begin
  if new.hora_entrada is not null and new.hora_salida is not null and new.hora_salida > new.hora_entrada then
    new.horas_por_trabajador := round(extract(epoch from (new.hora_salida - new.hora_entrada)) / 3600.0, 2);
  end if;
  new.horas_totales := new.horas_por_trabajador * new.num_trabajadores;

  v_ext := coalesce(new.horas_extra_por_trabajador, 0);
  if v_ext > new.horas_por_trabajador then
    raise exception 'Las horas extra por persona (%) no pueden superar las horas por persona (%)', v_ext, new.horas_por_trabajador
      using errcode = '23514';   -- check_violation: la aplicación ya sabe mostrarlo como «valor fuera de rango»
  end if;
  new.horas_extra_por_trabajador := v_ext;
  new.horas_extra_totales := v_ext * new.num_trabajadores;

  if new.trabajador_id is not null then
    -- tarifa vigente en la fecha del parte; si es anterior a la primera conocida, la primera; sin histórico, la ficha del trabajador
    select h.coste_hora, h.coste_hora_extra, h.coste_hora_festivo into v_norm, v_extra, v_fest
      from public.trabajadores_coste h where h.trabajador_id = new.trabajador_id
      order by (h.desde <= new.fecha) desc, case when h.desde <= new.fecha then h.desde end desc, h.desde asc limit 1;
    if not found then
      select coste_hora, coste_hora_extra, coste_hora_festivo into v_norm, v_extra, v_fest
        from public.trabajadores where id = new.trabajador_id;
    end if;
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
