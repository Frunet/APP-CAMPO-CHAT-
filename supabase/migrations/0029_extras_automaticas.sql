-- Regla operativa: siete horas normales por persona y día, entre todas las fincas.
-- Se aplica al registrar, corregir o eliminar; no modifica jornadas no tocadas.
begin;
create function public.bloquear_jornada_extras() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if pg_trigger_depth()>1 then return coalesce(new,old); end if;
  for k in select distinct clave from (
    select case when tg_op<>'DELETE' and new.trabajador_id is not null then new.trabajador_id::text||new.fecha::text end clave
    union all
    select case when tg_op<>'INSERT' and old.trabajador_id is not null then old.trabajador_id::text||old.fecha::text end
  ) s where clave is not null order by clave loop
    perform pg_advisory_xact_lock(hashtextextended(k,0));
  end loop;
  if tg_op<>'DELETE' then
    if new.hora_entrada is not null and new.hora_salida>new.hora_entrada then
      new.horas_por_trabajador:=round(extract(epoch from (new.hora_salida-new.hora_entrada))/3600.0,2);
    end if;
    new.horas_extra_por_trabajador:=greatest(0,new.horas_por_trabajador-7);
    return new;
  end if;
  return old;
end $$;
revoke all on function public.bloquear_jornada_extras() from public,anon,authenticated;
create trigger trg_aa_extras_jornada before insert or update or delete on public.partes_trabajo
for each row execute function public.bloquear_jornada_extras();

create function public.repartir_extras_jornada(p_trabajador uuid,p_fecha date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- El orden de registro determina a qué tarea/finca se imputa el exceso.
  -- El trigger de coste conserva las tarifas históricas de cada parte.
  with acumulados as (
    select id,horas_por_trabajador,
      coalesce(sum(horas_por_trabajador) over(order by created_at,id rows between unbounded preceding and 1 preceding),0) anteriores
    from public.partes_trabajo where trabajador_id=p_trabajador and fecha=p_fecha and num_trabajadores=1
  ), calculados as (
    select id,least(horas_por_trabajador,greatest(0,anteriores+horas_por_trabajador-7)) extra from acumulados
  )
  update public.partes_trabajo p set horas_extra_por_trabajador=c.extra from calculados c
  where p.id=c.id and p.horas_extra_por_trabajador is distinct from c.extra;
end $$;
revoke all on function public.repartir_extras_jornada(uuid,date) from public,anon,authenticated;

create function public.actualizar_extras_jornada() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth()>1 then return null; end if;
  if tg_op<>'DELETE' and new.trabajador_id is not null then
    perform public.repartir_extras_jornada(new.trabajador_id,new.fecha);
  end if;
  if tg_op<>'INSERT' and old.trabajador_id is not null and
    (tg_op='DELETE' or old.trabajador_id is distinct from new.trabajador_id or old.fecha is distinct from new.fecha) then
    perform public.repartir_extras_jornada(old.trabajador_id,old.fecha);
  end if;
  return null;
end $$;
revoke all on function public.actualizar_extras_jornada() from public,anon,authenticated;
create trigger trg_zz_extras_jornada after insert or update or delete on public.partes_trabajo
for each row execute function public.actualizar_extras_jornada();

-- Las extras se derivan de la jornada, no de lo escrito en el archivo.
-- Una reimportación debe reconocer el mismo parte aunque sus extras ya estén calculadas.
do $$
declare anterior text; posterior text;
begin
  anterior:=pg_get_functiondef('public.importar_horas_revisadas(jsonb,boolean)'::regprocedure);
  posterior:=replace(anterior,' and coalesce(p.horas_extra_por_trabajador,0)=v_extra','');
  if anterior=posterior then raise exception 'No se encontró la comparación de extras en la importación'; end if;
  execute posterior;
end $$;
notify pgrst,'reload schema';
commit;
