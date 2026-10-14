-- Fase 2: documentos esperados, detección de duplicados, permisos de archivos más estrictos

alter table documentos add column sha256 text;
create index on documentos (sha256);

-- Documentos que se espera recibir (p. ej. de fincas externas)
create table documentos_esperados (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id),
  descripcion text not null,
  tipo text not null default 'otro',
  fecha_esperada date,
  documento_id uuid references documentos(id),   -- se rellena al recibirlo
  recibido_at timestamptz,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
create index on documentos_esperados (finca_id) where documento_id is null;
alter table documentos_esperados enable row level security;

create policy esperados_select on documentos_esperados for select to authenticated
  using (puede_ver_finca(finca_id));
create policy esperados_write on documentos_esperados for all to authenticated
  using (puede_escribir_finca(finca_id, array['responsable']::app_rol[]))
  with check (puede_escribir_finca(finca_id, array['responsable']::app_rol[]));

create trigger trg_audit_documentos_esperados after insert or update or delete on documentos_esperados
  for each row execute function audit_trigger();

-- Los responsables pueden clasificar/relacionar los documentos de sus fincas
drop policy docs_update on documentos;
create policy docs_update on documentos for update to authenticated
  using (created_by = (select auth.uid()) or es_admin()
         or (finca_id is not null and puede_escribir_finca(finca_id, array['responsable']::app_rol[])))
  with check (created_by = (select auth.uid()) or es_admin()
         or (finca_id is not null and puede_escribir_finca(finca_id, array['responsable']::app_rol[])));

-- Storage: solo se puede leer un archivo si existe su fila en documentos visible para el usuario (RLS aplicada)
drop policy docs_storage_select on storage.objects;
create policy docs_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos'
         and exists (select 1 from public.documentos d where d.storage_path = storage.objects.name));
