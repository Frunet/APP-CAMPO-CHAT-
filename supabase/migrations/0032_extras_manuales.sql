begin;
alter table public.partes_trabajo add column horas_extra_manuales numeric(6,2) not null default 0
  check(horas_extra_manuales>=0 and horas_extra_manuales<=horas_por_trabajador);

create or replace function public.bloquear_jornada_extras() returns trigger
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
    if new.horas_extra_manuales is null or new.horas_extra_manuales<0 or new.horas_extra_manuales>new.horas_por_trabajador then
      raise exception 'Las extras manuales deben estar entre cero y las horas del parte' using errcode='23514';
    end if;
    new.horas_extra_por_trabajador:=greatest(new.horas_extra_manuales,new.horas_por_trabajador-7);
    return new;
  end if;
  return old;
end $$;

create or replace function public.repartir_extras_jornada(p_trabajador uuid,p_fecha date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Las horas indicadas como extras nunca consumen la bolsa de siete normales.
  -- El resultado diario es el mayor de: exceso de siete o extras manuales.
  with acumulados as (
    select id,horas_por_trabajador,horas_extra_manuales,
      coalesce(sum(horas_por_trabajador-horas_extra_manuales) over(order by created_at,id rows between unbounded preceding and 1 preceding),0) anteriores
    from public.partes_trabajo where trabajador_id=p_trabajador and fecha=p_fecha and num_trabajadores=1
  ), calculados as (
    select id,horas_por_trabajador-least(horas_por_trabajador-horas_extra_manuales,greatest(0,7-anteriores)) extra from acumulados
  )
  update public.partes_trabajo p set horas_extra_por_trabajador=c.extra from calculados c
  where p.id=c.id and p.horas_extra_por_trabajador is distinct from c.extra;
end $$;

-- La importación recibe las extras manuales en su campo de extras existente.
do $$
declare anterior text; posterior text;
begin
  anterior:=pg_get_functiondef('public.importar_horas_revisadas(jsonb,boolean)'::regprocedure);
  posterior:=replace(anterior,'horas_extra_por_trabajador,mayor,tipo_trabajo','horas_extra_por_trabajador,horas_extra_manuales,mayor,tipo_trabajo');
  posterior:=replace(posterior,'v_horas,v_extra,v_mayor,v_tipo','v_horas,v_extra,v_extra,v_mayor,v_tipo');
  if anterior=posterior or position('horas_extra_manuales' in posterior)=0 then raise exception 'No se encontró el punto de actualización de importación'; end if;
  execute posterior;
end $$;
notify pgrst,'reload schema';
commit;
