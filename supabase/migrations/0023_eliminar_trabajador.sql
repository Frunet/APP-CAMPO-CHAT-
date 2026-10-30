-- Eliminar un trabajador (solo administrador). Sus partes de horas NO se pierden: pasan a llevar su código y nombre como texto (sin ficha) y mantienen horas y coste.
create or replace function eliminar_trabajador(p_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_nombre text; v_codigo text; n int;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede eliminar trabajadores' using errcode = '42501';
  end if;
  select nombre, codigo into v_nombre, v_codigo from public.trabajadores where id = p_id;
  if not found then raise exception 'El trabajador no existe'; end if;
  update public.partes_trabajo
     set trabajador_nombre = trim(concat_ws(' - ', v_codigo, v_nombre)), trabajador_id = null
   where trabajador_id = p_id;
  get diagnostics n = row_count;
  delete from public.trabajadores where id = p_id;
  return n;
end $$;
revoke execute on function public.eliminar_trabajador(uuid) from public, anon;
grant execute on function public.eliminar_trabajador(uuid) to authenticated;
