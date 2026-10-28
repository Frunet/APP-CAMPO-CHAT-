-- Un parte con varios trabajadores se guarda como una línea por trabajador.
-- Un jornalero que no está dado de alta en Maestros se identifica por su nombre (sin tarifa propia).
alter table partes_trabajo add column trabajador_nombre text;
drop index if exists partes_trabajo_dedupe;
create unique index partes_trabajo_dedupe on partes_trabajo (
  fecha, finca_id,
  coalesce(parcela_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(lote_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(trabajador_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(lower(trim(trabajador_nombre)), ''),
  coalesce(equipo_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(tipo_trabajo, ''), coalesce(actividad, '')
);
create index on partes_trabajo (trabajador_id, fecha) where trabajador_id is not null;
