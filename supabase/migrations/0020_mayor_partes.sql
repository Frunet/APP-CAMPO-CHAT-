-- Mayor: agrupación de las tareas para control interno (Instalaciones, Suelos, Liado y guiado, Otros cuidados de planta, Riego, Cosecha, Otros, Revisión finca).
-- Cada parte guarda el mayor de su tarea; los partes anteriores se clasifican por el nombre con el que se registraron (nombres de AppCampo incluidos).
alter table partes_trabajo add column mayor text;
create index on partes_trabajo (mayor) where mayor is not null;

update partes_trabajo set mayor = case
  when tipo_trabajo in ('Obra','Reparaciones','Instalación','Instalaciones') then 'Instalaciones'
  when tipo_trabajo in ('Hierba','Suelos') then 'Suelos'
  when tipo_trabajo in ('Liado y guiado','Liado y Guía de Planta') then 'Liado y guiado'
  when tipo_trabajo in ('Poda','Aplicaciones foliares','Otros cuidados planta') then 'Otros cuidados de planta'
  when tipo_trabajo = 'Riego' then 'Riego'
  when tipo_trabajo in ('Cosecha','Cosecha/ Recolección') then 'Cosecha'
  when tipo_trabajo = 'Otros' then 'Otros'
  when tipo_trabajo = 'Revisión finca' then 'Revisión finca'
end
where mayor is null;
