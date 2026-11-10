-- Catálogo compartido de personal activo, sin tarifas ni asignaciones ajenas.
begin;
create function public.listar_personal_disponible()
returns table(id uuid,codigo text,nombre text,activo boolean,trabajadores_fincas jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.mi_rol() is null or public.mi_rol() not in ('administrador','responsable','encargado') then
    raise exception 'No puedes gestionar personal' using errcode='42501';
  end if;
  return query select t.id,t.codigo::text,t.nombre::text,t.activo,
    coalesce((select jsonb_agg(jsonb_build_object('finca_id',tf.finca_id,'activo',tf.activo))
      from public.trabajadores_fincas tf where tf.trabajador_id=t.id and public.puede_ver_finca(tf.finca_id)),'[]'::jsonb)
    from public.trabajadores t where t.activo order by t.nombre,t.id;
end $$;
revoke all on function public.listar_personal_disponible() from public,anon;
grant execute on function public.listar_personal_disponible() to authenticated;

create or replace function public.cambiar_actividad_trabajador_finca(p_trabajador uuid,p_finca uuid,p_activo boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_activo is null then raise exception 'Indica el estado del trabajador'; end if;
  if not coalesce(public.puede_escribir_finca(p_finca,array['responsable','encargado']::public.app_rol[]),false)
    then raise exception 'No puedes gestionar el personal de esta finca' using errcode='42501'; end if;
  if not exists(select 1 from public.fincas where id=p_finca and activa) then raise exception 'La finca no está activa'; end if;
  perform 1 from public.trabajadores where id=p_trabajador for update;
  if not found then raise exception 'El trabajador no existe'; end if;
  if p_activo then
    if not exists(select 1 from public.trabajadores where id=p_trabajador and activo)
      then raise exception 'El trabajador tiene baja general. Debe reactivarlo el administrador'; end if;
    insert into public.trabajadores_fincas(trabajador_id,finca_id,activo) values(p_trabajador,p_finca,true)
      on conflict(trabajador_id,finca_id) do update set activo=true where not trabajadores_fincas.activo;
  else
    update public.trabajadores_fincas set activo=false where trabajador_id=p_trabajador and finca_id=p_finca and activo;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
