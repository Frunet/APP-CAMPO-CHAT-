-- Calendario: cada usuario ve SOLO las tareas asignadas a él; el administrador (y el usuario «encargado», que es administrador) ven todas.
-- Sustituye lo de la migración 0025 (los encargados ya no ven el calendario de todos ni la lista de usuarios).
drop policy if exists tareas_select on public.tareas;
create policy tareas_select on public.tareas for select to authenticated
  using (es_admin() or asignado_a = (select auth.uid()));
drop policy if exists profiles_select_encargado on public.profiles;

-- La regla «tareas_write» (ALL) también daba lectura de las tareas sin dueño de sus fincas a los encargados. Se separa en insertar, modificar y borrar.
drop policy if exists tareas_write on public.tareas;
create policy tareas_insert on public.tareas for insert to authenticated
  with check (mi_rol() in ('administrador','responsable','encargado'));
create policy tareas_update on public.tareas for update to authenticated
  using (es_admin() or asignado_a = (select auth.uid()) or created_by = (select auth.uid()))
  with check (mi_rol() in ('administrador','responsable','encargado'));
create policy tareas_delete on public.tareas for delete to authenticated
  using (es_admin() or asignado_a = (select auth.uid()) or created_by = (select auth.uid()));
