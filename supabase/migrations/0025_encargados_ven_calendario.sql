-- Los encargados pueden ver el calendario de todos (tareas de todas las fincas y usuarios) y la lista de usuarios para asignar tareas.
drop policy if exists tareas_select on public.tareas;
create policy tareas_select on public.tareas for select to authenticated
  using (
    (finca_id is null and (created_by = (select auth.uid()) or asignado_a = (select auth.uid())))
    or puede_ver_finca(finca_id)
    or asignado_a = (select auth.uid())
    or mi_rol() = 'encargado'
  );
drop policy if exists profiles_select_encargado on public.profiles;
create policy profiles_select_encargado on public.profiles for select to authenticated
  using (mi_rol() = 'encargado');
