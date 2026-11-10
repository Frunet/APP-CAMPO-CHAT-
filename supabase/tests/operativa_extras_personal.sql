-- Ejecutar solo en una base aislada con las migraciones 0001-0032 aplicadas.
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
do $$declare a uuid; b uuid; t uuid:='93000000-0000-0000-0000-000000000001'; f1 uuid:='92000000-0000-0000-0000-000000000001'; f2 uuid:='92000000-0000-0000-0000-000000000002';begin
 insert into public.partes_trabajo(fecha,finca_id,trabajador_id,horas_por_trabajador,horas_extra_manuales,mayor,tipo_trabajo)
 values('2026-10-04',f1,t,7,7,'Otros','Otros') returning id into a;
 if (select horas_extra_totales from public.partes_trabajo where id=a)<>7 then raise exception 'No aceptó siete horas extras manuales en festivo';end if;
 if (select coste_total from public.partes_trabajo where id=a)<>105 then raise exception 'No aplicó la tarifa extra a las manuales';end if;
 update public.partes_trabajo set horas_por_trabajador=9 where id=a;
 if (select horas_extra_totales from public.partes_trabajo where id=a)<>7 then raise exception 'Duplicó las manuales con las automáticas';end if;
 update public.partes_trabajo set horas_extra_manuales=1 where id=a;
 if (select horas_extra_totales from public.partes_trabajo where id=a)<>2 then raise exception 'No respetó el mínimo automático';end if;
 insert into public.partes_trabajo(fecha,finca_id,trabajador_id,horas_por_trabajador,horas_extra_manuales,mayor,tipo_trabajo)
 values('2026-10-05',f1,t,5,0,'Otros','Otros') returning id into a;
 insert into public.partes_trabajo(fecha,finca_id,trabajador_id,horas_por_trabajador,horas_extra_manuales,mayor,tipo_trabajo)
 values('2026-10-05',f2,t,4,4,'Otros','Otros') returning id into b;
 if (select sum(horas_extra_totales) from public.partes_trabajo where trabajador_id=t and fecha='2026-10-05')<>4 then raise exception 'Error al combinar manuales entre fincas';end if;
 update public.partes_trabajo set horas_extra_manuales=0 where id=b;
 if (select sum(horas_extra_totales) from public.partes_trabajo where trabajador_id=t and fecha='2026-10-05')<>2 then raise exception 'No volvió al cálculo automático';end if;
 begin
 update public.partes_trabajo set horas_extra_manuales=6 where id=a;
 raise exception 'Aceptó extras superiores al total';
 exception when check_violation then null;end;
 perform public.importar_horas_revisadas(jsonb_build_array(jsonb_build_object('fecha','2026-10-06','finca_id',f1,'trabajador_id',t,'horas_por_trabajador',7,'horas_extra_por_trabajador',7,'mayor','Otros','tipo_trabajo','Otros')));
 if (select horas_extra_manuales from public.partes_trabajo where trabajador_id=t and fecha='2026-10-06')<>7 or
 (select horas_extra_totales from public.partes_trabajo where trabajador_id=t and fecha='2026-10-06')<>7 then raise exception 'La importación perdió las extras manuales';end if;
end $$;
insert into public.trabajadores(id,finca_id,nombre,codigo,activo) values('93000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000002','Disponible de otra finca','EXTRA3',true);
set role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000002',false);
do $$declare catalogo jsonb;begin
 if exists(select 1 from public.trabajadores where id='93000000-0000-0000-0000-000000000003') then raise exception 'El trabajador externo ya era visible por la consulta normal';end if;
 select to_jsonb(p) into catalogo from public.listar_personal_disponible() p where p.id='93000000-0000-0000-0000-000000000003';
 if catalogo is null then raise exception 'El catálogo no incluye los activos de otras fincas';end if;
 if catalogo ? 'coste_hora' or catalogo->'trabajadores_fincas'<>'[]'::jsonb then raise exception 'Expuso tarifas o asignaciones ajenas';end if;
 if exists(select 1 from public.listar_personal_disponible() where id='93000000-0000-0000-0000-000000000002') then raise exception 'Incluyó una baja general';end if;
end $$;
select public.cambiar_actividad_trabajador_finca('93000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000001',true);
do $$begin
 if not (select activo from public.trabajadores_fincas where trabajador_id='93000000-0000-0000-0000-000000000003' and finca_id='92000000-0000-0000-0000-000000000001') then raise exception 'No asignó el trabajador externo a la finca propia';end if;
end $$;
select public.cambiar_actividad_trabajador_finca('93000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000001',false);
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
 if not (select activo from public.trabajadores_fincas where trabajador_id='93000000-0000-0000-0000-000000000003' and finca_id='92000000-0000-0000-0000-000000000002') then raise exception 'Alteró la finca de origen del trabajador externo';end if;
 if not (select activo from public.trabajadores_fincas where trabajador_id='93000000-0000-0000-0000-000000000001' and finca_id='92000000-0000-0000-0000-000000000002') then raise exception 'Alteró la otra finca';end if;
end $$;
rollback;
select 'Extras, costes, reimportación y permisos verificados' resultado;
