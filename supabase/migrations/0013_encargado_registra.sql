-- El encargado es quien introduce la información: puede registrar y corregir gastos, ventas y registros sin factura de sus fincas.
-- Borrar (anular) sigue siendo solo de responsables y administrador. Todo queda en el historial de auditoría.
do $$
declare t text;
begin
  foreach t in array array['gastos','ventas','movimientos_resultado'] loop
    execute format('drop policy if exists %I on %I', case t when 'gastos' then 'gastos_write' when 'ventas' then 'ventas_write' else 'mov_resultado_write' end, t);
    execute format($f$create policy %I on %I for insert to authenticated with check (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]))$f$, t || '_insert', t);
    execute format($f$create policy %I on %I for update to authenticated using (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[])) with check (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]))$f$, t || '_update', t);
    execute format($f$create policy %I on %I for delete to authenticated using (puede_escribir_finca(finca_id, array['responsable']::app_rol[]))$f$, t || '_delete', t);
  end loop;
end $$;
