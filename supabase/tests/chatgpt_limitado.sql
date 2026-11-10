-- Solo en base aislada con migraciones 0001-0033. Todo se revierte.
begin;
grant select,insert,update,delete on all tables in schema public to authenticated;
select set_config('request.jwt.claims','{}',false);
insert into auth.users(id,email) values('94000000-0000-0000-0000-000000000001','oauth-admin@example.test'),('94000000-0000-0000-0000-000000000002','oauth-campo@example.test');
update public.profiles set rol='administrador' where id='94000000-0000-0000-0000-000000000001';
update public.profiles set rol='encargado' where id='94000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000001',false);
insert into public.fincas(id,codigo,nombre) values('95000000-0000-0000-0000-000000000001','OAUTH-A','PAI MANGO'),('95000000-0000-0000-0000-000000000002','OAUTH-B','RIO VELEZ');
insert into public.usuarios_fincas values('94000000-0000-0000-0000-000000000002','95000000-0000-0000-0000-000000000001');
insert into public.trabajadores(id,finca_id,nombre,codigo,activo,coste_hora,coste_hora_extra) values('96000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000001','Personal OAuth','OAUTH1',true,10,15);
insert into public.partes_trabajo(fecha,finca_id,trabajador_id,horas_por_trabajador,mayor,tipo_trabajo,actividad) values('2026-10-01','95000000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000001',7,'Otros','Otros','Trabajo autorizado'),('2026-10-01','95000000-0000-0000-0000-000000000002','96000000-0000-0000-0000-000000000001',2,'Otros','Otros','Trabajo otra finca');
insert into public.tareas(titulo,descripcion,fecha,finca_id,asignado_a,completada) values('Pendiente prueba','Detalle pendiente','2026-10-01','95000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000002',false),('Terminada prueba','Detalle terminado','2026-10-02','95000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001',true);
set role authenticated;
select set_config('request.jwt.claims','{"client_id":"cliente-chatgpt-limitado"}',false);
do $$declare r jsonb;begin
 if public.es_admin() or public.mi_rol() is not null or public.puede_ver_finca('95000000-0000-0000-0000-000000000001') then raise exception 'OAuth heredó permisos normales';end if;
 if exists(select 1 from public.trabajadores) or exists(select 1 from public.partes_trabajo) or exists(select 1 from public.api_consulta) then raise exception 'OAuth pudo leer tablas directamente';end if;
 r:=public.consultar_campo_chatgpt('resumen_horas','{"desde":"2026-10-01","hasta":"2026-10-01","finca":"OAUTH-NO-EXISTE"}');
 if (r->>'total_horas')::numeric<>0 then raise exception 'Ignoró un filtro';end if;
 r:=public.consultar_campo_chatgpt('partes','{"desde":"2026-10-01","hasta":"2026-10-01"}');
 if r::text like '%coste%' or r::text like '%tarifa%' then raise exception 'Expuso columnas financieras';end if;
 r:=public.consultar_campo_chatgpt('costes','{"desde":"2026-10-01","hasta":"2026-10-01"}');
 if (r->>'coste_conocido')::numeric<>100 then raise exception 'No devolvió el coste de mano de obra autorizado';end if;
 r:=public.consultar_campo_chatgpt('tareas','{"desde":"2026-10-01","hasta":"2026-10-07","estado":"todas"}');
 if jsonb_array_length(r->'tareas')<>2 then raise exception 'No incluyó pendientes y completadas';end if;
 r:=public.consultar_campo_chatgpt('tareas','{"desde":"2026-10-01","hasta":"2026-10-07","estado":"completadas"}');
 if jsonb_array_length(r->'tareas')<>1 then raise exception 'No filtró las completadas';end if;
 begin
 perform public.cambiar_actividad_trabajador_finca('96000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000001',false);
 raise exception 'OAuth pudo cambiar personal';
 exception when insufficient_privilege then null;end;
 begin
 insert into public.partes_trabajo(fecha,finca_id,trabajador_id,horas_por_trabajador) values('2026-10-02','95000000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000001',7);
 raise exception 'OAuth pudo insertar horas';
 exception when insufficient_privilege then null;end;
 begin perform public.consultar_campo_chatgpt('gastos','{}');raise exception 'Admitió datos financieros';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000002',false);
do $$declare r jsonb;begin
 r:=public.consultar_campo_chatgpt('resumen_horas','{"desde":"2026-10-01","hasta":"2026-10-01"}');
 if (r->>'total_horas')::numeric<>7 then raise exception 'El perfil de finca accedió a horas de otra finca';end if;
 r:=public.consultar_campo_chatgpt('catalogo','{}');
 if r::text like '%RIO VELEZ%' then raise exception 'El catálogo expuso fincas ajenas';end if;
 begin perform public.consultar_campo_chatgpt('costes','{"desde":"2026-10-01","hasta":"2026-10-07"}');raise exception 'Encargado accedió a costes sin permiso';exception when insufficient_privilege then null;end;
 r:=public.consultar_campo_chatgpt('tareas','{"desde":"2026-10-01","hasta":"2026-10-07","estado":"todas"}');
 if jsonb_array_length(r->'tareas')<>1 then raise exception 'No respetó las asignaciones del calendario';end if;
end $$;
select set_config('request.jwt.claims','{}',false);
do $$begin if not public.puede_ver_finca('95000000-0000-0000-0000-000000000001') then raise exception 'Bloqueó la sesión normal de la app';end if;end $$;
rollback;
select 'Conexión limitada verificada: sin escritura, sin tablas privadas, solo fincas autorizadas' resultado;
