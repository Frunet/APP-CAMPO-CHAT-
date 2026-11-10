-- Importación revisada en una transacción y revisión semanal ligada al contenido.
begin;
create table public.revisiones_horas (
  finca_id uuid not null references public.fincas(id),
  semana date not null check (extract(isodow from semana) = 1),
  huella text not null,
  revisado_por uuid not null references public.profiles(id),
  revisado_el timestamptz not null default now(),
  primary key(finca_id, semana)
);
alter table public.revisiones_horas enable row level security;
create policy revisiones_select on public.revisiones_horas for select to authenticated using(public.puede_ver_finca(finca_id));
grant select on public.revisiones_horas to authenticated;
create trigger trg_audit_revisiones_horas after insert or update or delete on public.revisiones_horas for each row execute function public.audit_trigger();

create function public.huella_horas_semana(p_finca uuid, p_semana date) returns text
language sql stable security invoker set search_path = '' as $$
  select md5(coalesce((select string_agg(jsonb_build_array(id,fecha,trabajador_id,trabajador_nombre,num_trabajadores,horas_por_trabajador,horas_extra_por_trabajador,mayor,tipo_trabajo,actividad,observaciones)::text,'|' order by id)
    from public.partes_trabajo where finca_id=p_finca and fecha between p_semana and p_semana+6),'') || 'TRACTOR' ||
    coalesce((select string_agg(jsonb_build_array(id,fecha,horas,observaciones)::text,'|' order by id)
    from public.horas_tractor where finca_id=p_finca and fecha between p_semana and p_semana+6),''));
$$;
revoke all on function public.huella_horas_semana(uuid,date) from public,anon;
grant execute on function public.huella_horas_semana(uuid,date) to authenticated;

create function public.estado_revision_semana(p_semana date)
returns table(finca_id uuid, revisado boolean, cambiado boolean, revisado_el timestamptz, huella_actual text)
language sql stable security invoker set search_path = '' as $$
  select f.id, coalesce(r.huella=public.huella_horas_semana(f.id,p_semana),false),
    r.huella is not null and r.huella<>public.huella_horas_semana(f.id,p_semana),r.revisado_el,public.huella_horas_semana(f.id,p_semana)
  from public.fincas f left join public.revisiones_horas r on r.finca_id=f.id and r.semana=p_semana
  where f.activa;
$$;
revoke all on function public.estado_revision_semana(date) from public,anon;
grant execute on function public.estado_revision_semana(date) to authenticated;

create function public.revisar_semana_horas(p_finca uuid,p_semana date,p_huella text) returns void
language plpgsql security definer set search_path = '' as $$
declare actual text;
begin
  if not coalesce(public.puede_escribir_finca(p_finca,array['responsable']::public.app_rol[]),false) then raise exception 'No tienes permiso para revisar esta finca' using errcode='42501'; end if;
  if extract(isodow from p_semana)<>1 or p_semana>current_date then raise exception 'Semana no válida'; end if;
  actual:=public.huella_horas_semana(p_finca,p_semana);
  if actual is distinct from p_huella then raise exception 'Las horas han cambiado. Actualiza y revísalas de nuevo'; end if;
  insert into public.revisiones_horas values(p_finca,p_semana,actual,auth.uid(),now())
    on conflict(finca_id,semana) do update set huella=excluded.huella,revisado_por=excluded.revisado_por,revisado_el=excluded.revisado_el;
end $$;
revoke all on function public.revisar_semana_horas(uuid,date,text) from public,anon;
grant execute on function public.revisar_semana_horas(uuid,date,text) to authenticated;

create function public.importar_horas_revisadas(p_filas jsonb,p_forzar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; fila jsonb; nuevos int:=0; duplicados int:=0; horas numeric:=0; total numeric; coincidencias int;
  v_fecha date; v_finca uuid; v_trab uuid; v_horas numeric; v_extra numeric; v_mayor text; v_tipo text; v_actividad text;
begin
  if public.mi_rol() is null or public.mi_rol() not in ('administrador','responsable','encargado') then raise exception 'No puedes importar horas' using errcode='42501'; end if;
  if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) not between 1 and 1000 then raise exception 'Selecciona entre 1 y 1000 líneas'; end if;
  -- Orden estable para evitar carreras y bloqueos entre dos importaciones.
  for r in select distinct (x->>'trabajador_id')::uuid trabajador,(x->>'fecha')::date fecha from jsonb_array_elements(p_filas) x order by 1,2 loop
    perform pg_advisory_xact_lock(hashtextextended(r.trabajador::text||r.fecha::text,0));
  end loop;
  for fila in select value from jsonb_array_elements(p_filas) loop
    v_fecha:=(fila->>'fecha')::date;v_finca:=(fila->>'finca_id')::uuid;v_trab:=(fila->>'trabajador_id')::uuid;
    v_horas:=round((fila->>'horas_por_trabajador')::numeric,2);v_extra:=round(coalesce((fila->>'horas_extra_por_trabajador')::numeric,0),2);
    v_mayor:=fila->>'mayor';v_tipo:=nullif(trim(fila->>'tipo_trabajo'),'');v_actividad:=left(nullif(trim(fila->>'actividad'),''),400);
    if v_fecha is null or v_fecha>current_date or v_horas is null or v_horas<=0 or v_horas>24 or v_extra<0 or v_extra>v_horas or v_tipo is null
      or v_mayor is null or v_mayor not in ('Instalaciones','Suelos','Liado y guiado','Otros cuidados de planta','Riego','Cosecha','Otros','Revisión finca') then raise exception 'Hay una línea con fecha, tarea u horas no válidas'; end if;
    if not coalesce(public.puede_escribir_finca(v_finca,array['responsable','encargado']::public.app_rol[]),false) then raise exception 'No tienes permiso sobre una finca del archivo' using errcode='42501'; end if;
    if not exists(select 1 from public.trabajadores t join public.trabajadores_fincas tf on tf.trabajador_id=t.id
      where t.id=v_trab and t.activo and tf.finca_id=v_finca and tf.activo) then raise exception 'Un trabajador no está activo en la finca indicada'; end if;
    select count(*) into coincidencias from public.partes_trabajo p where p.fecha=v_fecha and p.finca_id=v_finca and p.trabajador_id=v_trab
      and coalesce(p.num_trabajadores,1)=1 and p.mayor=v_mayor and p.horas_por_trabajador=v_horas and coalesce(p.horas_extra_por_trabajador,0)=v_extra
      and (nullif(trim(p.actividad),'') is null or trim(p.actividad)=v_actividad);
    if coincidencias>1 then raise exception 'Hay varias coincidencias previas: revisa los duplicados'; end if;
    if coincidencias=1 then duplicados:=duplicados+1;continue; end if;
    insert into public.partes_trabajo(fecha,finca_id,trabajador_id,num_trabajadores,horas_por_trabajador,horas_extra_por_trabajador,mayor,tipo_trabajo,actividad,observaciones,origen)
      values(v_fecha,v_finca,v_trab,1,v_horas,v_extra,v_mayor,v_tipo,left(v_actividad,400),left(fila->>'observaciones',500),'documento');
    select coalesce(sum(horas_totales),0) into total from public.partes_trabajo where trabajador_id=v_trab and fecha=v_fecha;
    if total>24 then raise exception 'La importación superaría 24 horas en una jornada'; end if;
    if total>12 and not coalesce(p_forzar,false) then raise exception 'La importación superaría 12 horas en una jornada. Revisa los datos o confirma el aviso'; end if;
    nuevos:=nuevos+1;horas:=horas+v_horas;
  end loop;
  return jsonb_build_object('insertados',nuevos,'duplicados',duplicados,'horas_nuevas',horas);
end $$;
revoke all on function public.importar_horas_revisadas(jsonb,boolean) from public,anon;
grant execute on function public.importar_horas_revisadas(jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
