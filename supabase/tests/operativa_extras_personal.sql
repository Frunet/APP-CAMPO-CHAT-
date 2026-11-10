-- Ejecutar solo en una base aislada con las migraciones 0001-0030 aplicadas.
-- Todo se revierte al terminar; no usar con datos reales.
begin;
grant select,insert,update,delete on all tables in schema public to authenticated;
insert into auth.users(id,email) values ('91000000-0000-0000-0000-000000000001','extras-admin@example.test'),('91000000-0000-0000-0000-000000000002','extras-encargado@example.test'),('91000000-0000-0000-0000-000000000003','extras-consulta@example.test');
update public.profiles set rol='administrador' where id='91000000-0000-0000-0000-000000000001';
update public.profiles set rol='encargado' where id='91000000-0000-0000-0000-000000000002';
update public.profiles set rol='consulta' where id='91000000-0000-0000-0000-000000000003';
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',false);
insert into public.fincas(id,codigo,nombre) values ('92000000-0000-0000-0000-000000000001','EXTRA-A','Extras A'),('92000000-0000-0000-0000-000000000002','EXTRA-B','Extras B');
insert into public.usuarios_fincas values ('91000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000001');
insert into public.trabajadores(id,finca_id,nombre,codigo,coste_hora,activo) values ('93000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','Extras prueba','EXTRA1',10,true),('93000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000001','Extras baja','EXTRA2',10,false);
select public.guardar_fincas_trabajador('93000000-0000-0000-0000-000000000001',array['92000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000002']::uuid[]);
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',false);
update public.trabajadores set coste_hora_extra=15 where id='93000000-0000-0000-0000-000000000001';
do $$
declare a uuid; b uuid; c uuid; f1 uuid:='92000000-0000-0000-0000-000000000001'; f2 uuid:='92000000-0000-0000-0000-000000000002'; t uuid:='93000000-0000-0000-0000-000000000001';
begin
 insert into public.partes_trabajo(fecha,finca_id,trabajador_id,horas_por_trabajador,mayor,tipo_trabajo,actividad) values('2026-10-01',f1,t,5,'Otros','Otros','A') returning id into a;
 insert into public.partes_trabajo(fecha,finca_id,trabajador_id,horas_por_trabajador,mayor,tipo_trabajo,actividad) values('2026-10-01',f2,t,4,'Otros','Otros','B') returning id into b;
 if (select sum(horas_extra_totales) from public.partes_trabajo where fecha='2026-10-01' and trabajador_id=t)<>2 then raise exception 'No sumó las horas entre fincas';end if;
 if (select sum(coste_total) from public.partes_trabajo where fecha='2026-10-01' and trabajador_id=t)<>100 then raise exception 'No calculó 7x10 + 2x15';end if;
 update public.partes_trabajo set horas_por_trabajador=2 where id=a;
 if (select sum(horas_extra_totales) from public.partes_trabajo where fecha='2026-10-01' and trabajador_id=t)<>0 then raise exception 'No quitó las extras tras reducir horas';end if;
 update public.partes_trabajo set horas_por_trabajador=8 where id=b;
 if (select sum(horas_extra_totales) from public.partes_trabajo where fecha='2026-10-01' and trabajador_id=t)<>3 then raise exception 'No recalculó las extras al editar';end if;
 delete from public.partes_trabajo where id=a;
 if (select horas_extra_totales from public.partes_trabajo where id=b)<>1 then raise exception 'No recalculó al borrar';end if;
 update public.partes_trabajo set fecha='2026-10-02' where id=b;
 if (select horas_extra_totales from public.partes_trabajo where id=b)<>1 then raise exception 'Error al mover fecha';end if;
 update public.partes_trabajo set horas_extra_por_trabajador=0 where id=b;
 if (select horas_extra_totales from public.partes_trabajo where id=b)<>1 then raise exception 'Aceptó extras manuales contrarias a la regla';end if;
 insert into public.partes_trabajo(fecha,finca_id,trabajador_id,horas_por_trabajador,mayor,tipo_trabajo) values('2026-10-03',f1,t,7,'Otros','Otros') returning id into c;
 if (select horas_extra_totales from public.partes_trabajo where id=c)<>0 then raise exception 'Siete horas generaron extras';end if;
 update public.partes_trabajo set horas_por_trabajador=7.5 where id=c;
 if (select horas_extra_totales from public.partes_trabajo where id=c)<>0.5 then raise exception 'No calculó medias horas';end if;
 perform public.importar_horas_revisadas(jsonb_build_array(jsonb_build_object('fecha','2026-10-03','finca_id',f1,'trabajador_id',t,'horas_por_trabajador',7.5,'horas_extra_por_trabajador',0,'mayor','Otros','tipo_trabajo','Otros')));
 if (select count(*) from public.partes_trabajo where fecha='2026-10-03' and trabajador_id=t)<>1 then raise exception 'Reimportación duplicada con extras automáticas';end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000002',false);
select public.cambiar_actividad_trabajador_finca('93000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001',false);
do $$begin
 if (select activo from public.trabajadores_fincas where trabajador_id='93000000-0000-0000-0000-000000000001' and finca_id='92000000-0000-0000-0000-000000000001') then raise exception 'No desactivó en la finca propia';end if;
 begin
 perform public.cambiar_actividad_trabajador_finca('93000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000002',false);
 raise exception 'Permitió gestionar otra finca';
 exception when insufficient_privilege then null;end;
 begin
 perform public.cambiar_actividad_trabajador_finca('93000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000001',true);
 raise exception 'Permitió saltarse la baja general';
 exception when raise_exception then if sqlerrm='Permitió saltarse la baja general' then raise;end if;end;
end $$;
select public.cambiar_actividad_trabajador_finca('93000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000003',false);
do $$begin
 begin
 perform public.cambiar_actividad_trabajador_finca('93000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001',false);
 raise exception 'Consulta pudo desactivar';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if not (select activo from public.trabajadores_fincas where trabajador_id='93000000-0000-0000-0000-000000000001' and finca_id='92000000-0000-0000-0000-000000000002') then raise exception 'Alteró la otra finca';end if;
end $$;
rollback;
select 'Extras, costes, reimportación y permisos verificados' resultado;
