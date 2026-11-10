begin;
create function public.cambiar_actividad_trabajador_finca(p_trabajador uuid,p_finca uuid,p_activo boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_activo is null then raise exception 'Indica el estado del trabajador'; end if;
  if not coalesce(public.puede_escribir_finca(p_finca,array['responsable','encargado']::public.app_rol[]),false)
    then raise exception 'No puedes gestionar el personal de esta finca' using errcode='42501'; end if;
  if not exists(select 1 from public.fincas where id=p_finca and activa) then raise exception 'La finca no está activa'; end if;
  perform 1 from public.trabajadores where id=p_trabajador for update;
  if not found then raise exception 'El trabajador no existe'; end if;
  if p_activo and not exists(select 1 from public.trabajadores where id=p_trabajador and activo)
    then raise exception 'El trabajador tiene baja general. Debe reactivarlo el administrador'; end if;
  update public.trabajadores_fincas set activo=p_activo where trabajador_id=p_trabajador and finca_id=p_finca and activo is distinct from p_activo;
  if not found and not exists(select 1 from public.trabajadores_fincas where trabajador_id=p_trabajador and finca_id=p_finca)
    then raise exception 'El trabajador no está dado de alta en esta finca'; end if;
end $$;
revoke all on function public.cambiar_actividad_trabajador_finca(uuid,uuid,boolean) from public,anon;
grant execute on function public.cambiar_actividad_trabajador_finca(uuid,uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
