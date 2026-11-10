begin;
-- Las sesiones OAuth de terceros no heredan los permisos de administración de la app.
create function public.sesion_campo_oauth() returns boolean language sql stable set search_path='' as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'client_id','')<>''
$$;
create or replace function public.mi_rol() returns public.app_rol language sql stable security definer set search_path='' as $$
 select rol from public.profiles where id=auth.uid() and activo and not public.sesion_campo_oauth()
$$;
create or replace function public.es_admin() returns boolean language sql stable security definer set search_path='' as $$
 select not public.sesion_campo_oauth() and coalesce((select rol='administrador' from public.profiles where id=auth.uid() and activo),false)
$$;
create or replace function public.puede_ver_finca(fid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not public.sesion_campo_oauth() and (public.es_admin() or exists(select 1 from public.usuarios_fincas uf join public.profiles p on p.id=uf.user_id and p.activo where uf.user_id=auth.uid() and uf.finca_id=fid))
$$;
-- Bloquea acceso directo a tablas, incluidas tarifas, secretos de API y documentos.
do $$declare t record;begin
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and c.relrowsecurity and (n.nspname='public' or (n.nspname='storage' and c.relname='objects')) loop
   execute format('create policy oauth_sin_acceso_directo on %I.%I as restrictive for all to authenticated using(not public.sesion_campo_oauth()) with check(not public.sesion_campo_oauth())',t.nspname,t.relname);
 end loop;
end $$;

create function public.grupo_finca_campo(p_nombre text) returns text language sql immutable set search_path='' as $$
 select case when n ~ '^pai( |$)' or n in('casa','fortaleza','avo casa','avo forta','avo fortaleza') then 'PAI'
 when n ~ '^frunet( |$)' or n='rio velez' then 'FRUNET'
 when n ~ '^lomas?( |$)' or n='rio seco' then 'LOMAS' else 'Otras fincas' end
 from (select lower(translate(trim(p_nombre),'ÁÉÍÓÚÜáéíóúü','AEIOUUaeiouu')) n) s
$$;

create function public.consultar_campo_chatgpt(p_consulta text,p_parametros jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_rol public.app_rol; v_fincas uuid[]; v_desde date; v_hasta date; v_trab text; v_resultado jsonb;
begin
 select rol into v_rol from public.profiles where id=auth.uid() and activo;
 if v_rol is null then raise exception 'El usuario no tiene un perfil activo' using errcode='42501';end if;
 if p_parametros is null or jsonb_typeof(p_parametros)<>'object' then raise exception 'Filtros no válidos';end if;
 select coalesce(array_agg(f.id),'{}'::uuid[]) into v_fincas from public.fincas f where
 (v_rol='administrador' or exists(select 1 from public.usuarios_fincas uf where uf.user_id=auth.uid() and uf.finca_id=f.id))
 and (coalesce(p_parametros->>'finca','')='' or f.nombre ilike '%'||(p_parametros->>'finca')||'%' or public.grupo_finca_campo(f.nombre)=upper(p_parametros->>'finca'));
 v_desde:=coalesce(nullif(p_parametros->>'desde','')::date,current_date-30);
 v_hasta:=coalesce(nullif(p_parametros->>'hasta','')::date,current_date);
 if v_desde>v_hasta or v_hasta-v_desde>366 then raise exception 'El periodo debe ser válido y no superar 366 días';end if;
 v_trab:=coalesce(p_parametros->>'trabajador','');

 if p_consulta='catalogo' then
   select jsonb_build_object('fincas',coalesce((select jsonb_agg(jsonb_build_object('finca',f.nombre,'grupo',public.grupo_finca_campo(f.nombre))) from public.fincas f where f.id=any(v_fincas) and f.activa),'[]'::jsonb),
     'trabajadores_activos',coalesce((select jsonb_agg(jsonb_build_object('codigo',t.codigo,'nombre',t.nombre,'fincas_activas',coalesce((select jsonb_agg(f.nombre) from public.trabajadores_fincas tf join public.fincas f on f.id=tf.finca_id where tf.trabajador_id=t.id and tf.activo and f.id=any(v_fincas)),'[]'::jsonb)) order by t.nombre) from public.trabajadores t where t.activo and (v_rol='administrador' or exists(select 1 from public.trabajadores_fincas tf where tf.trabajador_id=t.id and tf.finca_id=any(v_fincas)))),'[]'::jsonb),
     'acceso','Solo lectura de datos de campo y costes de mano de obra según el rol, sin tarifas ni administración') into v_resultado;
 elsif p_consulta='resumen_horas' then
   with base as (select p.*,f.nombre finca,public.grupo_finca_campo(f.nombre) grupo,coalesce(t.nombre,p.trabajador_nombre,'Sin identificar') trabajador,t.codigo from public.partes_trabajo p join public.fincas f on f.id=p.finca_id left join public.trabajadores t on t.id=p.trabajador_id where p.finca_id=any(v_fincas) and p.fecha between v_desde and v_hasta and (v_trab='' or t.nombre ilike '%'||v_trab||'%' or t.codigo ilike '%'||v_trab||'%' or p.trabajador_nombre ilike '%'||v_trab||'%')),
   agrupados as (select case coalesce(p_parametros->>'agrupar','grupo') when 'grupo' then grupo when 'finca' then finca when 'trabajador' then coalesce(codigo||' · ','')||trabajador when 'tarea' then coalesce(tipo_trabajo,mayor,'Sin tarea') when 'dia' then fecha::text else grupo end etiqueta,sum(horas_totales) horas,sum(horas_extra_totales) horas_extra,count(*) partes from base group by 1)
   select jsonb_build_object('desde',v_desde,'hasta',v_hasta,'total_horas',(select coalesce(sum(horas_totales),0) from base),'total_extras',(select coalesce(sum(horas_extra_totales),0) from base),'grupos',coalesce((select jsonb_agg(to_jsonb(a) order by a.horas desc,a.etiqueta) from agrupados a),'[]'::jsonb),'nota','Las horas extra están incluidas en el total. El tractor no se suma al personal.') into v_resultado;
 elsif p_consulta='partes' then
   select jsonb_build_object('desde',v_desde,'hasta',v_hasta,'limite',300,'partes',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into v_resultado from (
     select p.fecha,f.nombre finca,coalesce(t.nombre,p.trabajador_nombre,'Sin identificar') trabajador,t.codigo,p.mayor,p.tipo_trabajo tarea,p.actividad detalle,p.horas_totales horas,p.horas_extra_totales horas_extra
     from public.partes_trabajo p join public.fincas f on f.id=p.finca_id left join public.trabajadores t on t.id=p.trabajador_id
     where p.finca_id=any(v_fincas) and p.fecha between v_desde and v_hasta and (v_trab='' or t.nombre ilike '%'||v_trab||'%' or t.codigo ilike '%'||v_trab||'%' or p.trabajador_nombre ilike '%'||v_trab||'%') order by p.fecha desc,p.id limit 300
   ) x;
 elsif p_consulta='costes' then
   if v_rol not in ('administrador','responsable') then raise exception 'Tu perfil no tiene permiso para consultar costes' using errcode='42501';end if;
   with base as (select p.*,f.nombre finca,public.grupo_finca_campo(f.nombre) grupo,coalesce(t.nombre,p.trabajador_nombre,'Sin identificar') trabajador,t.codigo from public.partes_trabajo p join public.fincas f on f.id=p.finca_id left join public.trabajadores t on t.id=p.trabajador_id where p.finca_id=any(v_fincas) and p.fecha between v_desde and v_hasta and (v_trab='' or t.nombre ilike '%'||v_trab||'%' or t.codigo ilike '%'||v_trab||'%' or p.trabajador_nombre ilike '%'||v_trab||'%')),
   agrupados as (select case coalesce(p_parametros->>'agrupar','grupo') when 'grupo' then grupo when 'finca' then finca when 'trabajador' then coalesce(codigo||' · ','')||trabajador when 'tarea' then coalesce(tipo_trabajo,mayor,'Sin tarea') when 'dia' then fecha::text else grupo end etiqueta,sum(horas_totales) horas,sum(coste_total) coste_conocido,count(*) filter(where coste_total is null) partes_sin_coste,count(*) partes from base group by 1)
   select jsonb_build_object('desde',v_desde,'hasta',v_hasta,'coste_conocido',(select sum(coste_total) from base),'partes_sin_coste',(select count(*) from base where coste_total is null),'moneda','EUR','grupos',coalesce((select jsonb_agg(to_jsonb(a) order by a.etiqueta) from agrupados a),'[]'::jsonb),'nota','Solo mano de obra histórica. Si hay partes sin coste el importe conocido es parcial; no es cero ni un coste completo. No incluye insumos, maquinaria ni otros gastos.') into v_resultado;
 elsif p_consulta='tareas' then
   select jsonb_build_object('limite',300,'tareas',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into v_resultado from (
     select t.titulo,t.descripcion,t.tipo,t.fecha,t.semana_inicio,t.completada,f.nombre finca,a.nombre asignada_a from public.tareas t left join public.fincas f on f.id=t.finca_id left join public.profiles a on a.id=t.asignado_a
     where (t.finca_id=any(v_fincas) or (t.finca_id is null and coalesce(p_parametros->>'finca','')=''))
     and (v_rol='administrador' or t.asignado_a=auth.uid())
     and (coalesce(p_parametros->>'estado','todas')='todas' or (p_parametros->>'estado'='pendientes' and not t.completada) or (p_parametros->>'estado'='completadas' and t.completada))
     and ((t.fecha between v_desde and v_hasta) or (t.fecha is null and (t.semana_inicio is null or (t.semana_inicio<=v_hasta and t.semana_inicio+6>=v_desde)))) order by t.fecha nulls last,t.id limit 300
   ) x;
 else raise exception 'Solo se permiten consultas de catálogo, horas, partes, costes de mano de obra y calendario' using errcode='42501';
 end if;
 return v_resultado;
end $$;
revoke all on function public.consultar_campo_chatgpt(text,jsonb) from public,anon;
grant execute on function public.consultar_campo_chatgpt(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
