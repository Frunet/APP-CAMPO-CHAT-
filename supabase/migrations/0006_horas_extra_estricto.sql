-- Las horas extra por persona no pueden superar las horas por persona: se RECHAZA (antes se recortaban en silencio).
-- Un dato mal introducido no debe corregirse a escondidas: el usuario tiene que verlo.
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
