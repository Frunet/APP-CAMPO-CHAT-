-- Corrección de una jornada en una transacción, con los permisos RLS ya existentes.
begin;
create function public.editar_jornada_horas(p_originales jsonb,p_lineas jsonb,p_forzar boolean default false) returns void
language plpgsql security invoker set search_path = '' as $$
declare base public.partes_trabajo; anterior public.partes_trabajo; fila jsonb; h numeric; e numeric; total numeric; n int; afectados int;
begin
  if jsonb_typeof(p_originales) is distinct from 'array' or jsonb_array_length(p_originales) not between 1 and 100
    or jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) not between 1 and 110 then raise exception 'Jornada no válida'; end if;
  select * into base from public.partes_trabajo where id=(p_originales->0->>'id')::uuid;
  if not found or not coalesce(public.puede_escribir_finca(base.finca_id,array['responsable','encargado']::public.app_rol[]),false)
    then raise exception 'No tienes permiso para modificar esta jornada' using errcode='42501'; end if;
  if base.fecha<current_date-6 or base.fecha>current_date then raise exception 'Solo se pueden editar aquí los últimos 7 días'; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(base.trabajador_id::text,base.trabajador_nombre,'sin')||base.fecha::text,0));
  perform 1 from public.partes_trabajo p where p.finca_id=base.finca_id and p.fecha=base.fecha
    and p.trabajador_id is not distinct from base.trabajador_id
    and (base.trabajador_id is not null or p.trabajador_nombre is not distinct from base.trabajador_nombre) order by p.id for update;
  select count(*) into n from public.partes_trabajo p where p.finca_id=base.finca_id and p.fecha=base.fecha
    and p.trabajador_id is not distinct from base.trabajador_id
    and (base.trabajador_id is not null or p.trabajador_nombre is not distinct from base.trabajador_nombre);
  if n<>jsonb_array_length(p_originales) or n<>(select count(distinct (x->>'id')::uuid) from jsonb_array_elements(p_originales) x)
    or exists(select 1 from jsonb_array_elements(p_originales) x where not exists(select 1 from public.partes_trabajo p
      where p.id=(x->>'id')::uuid and p.finca_id=base.finca_id and p.fecha=base.fecha
      and p.trabajador_id is not distinct from base.trabajador_id
      and (base.trabajador_id is not null or p.trabajador_nombre is not distinct from base.trabajador_nombre)
      and p.updated_at=(x->>'updated_at')::timestamptz)) then raise exception 'Las horas han cambiado. Cierra y vuelve a abrir la edición para cargar los datos actuales'; end if;
  -- Todos los originales deben estar presentes, incluso las tareas que se quitan (horas=0).
  if exists(select 1 from jsonb_array_elements(p_originales) x where (select count(*) from jsonb_array_elements(p_lineas) y where y->>'id'=x->>'id')<>1)
    or exists(select 1 from jsonb_array_elements(p_lineas) y where y->>'id' is not null and not exists(select 1 from jsonb_array_elements(p_originales) x where x->>'id'=y->>'id')) then raise exception 'Las líneas no corresponden a la jornada'; end if;
  for fila in select value from jsonb_array_elements(p_lineas) loop
    h:=(fila->>'horas')::numeric; e:=(fila->>'extra')::numeric;
    if h is null or h<0 or h>24 or e is null or e<0 or e>h or h<>round(h,2) or e<>round(e,2) then raise exception 'Horas o extras no válidas (máximo dos decimales)'; end if;
    if fila->>'id' is not null then
      select * into strict anterior from public.partes_trabajo where id=(fila->>'id')::uuid;
      if fila->>'mayor' is distinct from anterior.mayor or fila->>'tarea' is distinct from anterior.tipo_trabajo then raise exception 'Para cambiar de tarea, pon cero en la anterior y horas en la nueva'; end if;
      if h=0 then
        delete from public.partes_trabajo where id=anterior.id;
      else
        update public.partes_trabajo set horas_por_trabajador=h,horas_extra_manuales=e,actividad=fila->>'actividad',
          hora_entrada=case when h<>anterior.horas_por_trabajador then null else anterior.hora_entrada end,
          hora_salida=case when h<>anterior.horas_por_trabajador then null else anterior.hora_salida end
          where id=anterior.id;
      end if;
      get diagnostics afectados=row_count;
      if afectados<>1 then raise exception 'No se pudo modificar una línea. No se ha guardado ningún cambio' using errcode='42501'; end if;
    elsif h>0 then
      if not exists(select 1 from (values
        ('Instalaciones','Obra'),('Instalaciones','Reparaciones'),('Suelos','Hierba'),('Otros cuidados de planta','Poda'),
        ('Otros cuidados de planta','Aplicaciones foliares'),('Riego','Riego'),('Cosecha','Cosecha'),('Otros','Otros'),('Revisión finca','Revisión finca')) c(mayor,tarea)
        where c.mayor=fila->>'mayor' and c.tarea=fila->>'tarea') then raise exception 'Tarea no válida'; end if;
      insert into public.partes_trabajo(fecha,finca_id,trabajador_id,trabajador_nombre,num_trabajadores,mayor,tipo_trabajo,actividad,horas_por_trabajador,horas_extra_manuales,origen)
        values(base.fecha,base.finca_id,base.trabajador_id,base.trabajador_nombre,base.num_trabajadores,fila->>'mayor',fila->>'tarea',fila->>'actividad',h,e,'manual');
    end if;
  end loop;
  select coalesce(sum(horas_por_trabajador),0) into total from public.partes_trabajo p where p.fecha=base.fecha
    and p.trabajador_id is not distinct from base.trabajador_id
    and (base.trabajador_id is not null or (p.finca_id=base.finca_id and p.trabajador_nombre is not distinct from base.trabajador_nombre));
  if total<=0 or total>24 then raise exception 'El total diario debe estar entre 0 y 24 horas por persona'; end if;
  if total>12 and not coalesce(p_forzar,false) then raise exception 'La jornada supera 12 horas contando lo registrado. Revisa las horas o marca Guardar igualmente'; end if;
end $$;
revoke all on function public.editar_jornada_horas(jsonb,jsonb,boolean) from public,anon;
grant execute on function public.editar_jornada_horas(jsonb,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
