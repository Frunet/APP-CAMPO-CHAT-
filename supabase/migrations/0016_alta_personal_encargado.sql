-- El encargado y los responsables pueden dar de ALTA trabajadores y equipos en sus fincas (nombre, finca); las tarifas y condiciones las pone solo el administrador.
-- Modificar o borrar sigue siendo solo del administrador.
drop policy if exists trab_write on trabajadores;
create policy trab_admin on trabajadores for all to authenticated using (es_admin()) with check (es_admin());
create policy trab_alta on trabajadores for insert to authenticated
  with check (finca_id is not null and puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]));
drop policy if exists equipos_write on equipos;
create policy equipos_admin on equipos for all to authenticated using (es_admin()) with check (es_admin());
create policy equipos_alta on equipos for insert to authenticated
  with check (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]));

create or replace function personal_sin_tarifa() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- una persona que no es administrador (con sesión de usuario) no puede fijar tarifas ni condiciones
  if auth.uid() is not null and not public.es_admin() then
    new.coste_hora := null; new.coste_hora_extra := null; new.coste_hora_festivo := null; new.condiciones := null;
  end if;
  return new;
end $$;
create trigger trg_trab_sin_tarifa before insert on trabajadores for each row execute function personal_sin_tarifa();
create trigger trg_equipos_sin_tarifa before insert on equipos for each row execute function personal_sin_tarifa();
