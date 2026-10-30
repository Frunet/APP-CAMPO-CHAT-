-- El encargado puede corregir sus errores: borrar partes de horas de sus fincas de los últimos 7 días (responsables y administrador, cualquiera). Todo queda en la auditoría.
drop policy partes_delete on partes_trabajo;
create policy partes_delete on partes_trabajo for delete to authenticated
  using (
    puede_escribir_finca(finca_id, array['responsable']::app_rol[])
    or (puede_escribir_finca(finca_id, array['encargado']::app_rol[]) and fecha >= current_date - 7)
  );
