-- Memoria del chat: decisiones y reglas de la empresa (compartidas, generales o de una finca) + resumen automático de conversaciones largas.

create table memoria_chat (
  id uuid primary key default gen_random_uuid(),
  num bigint generated always as identity,            -- número corto para referirse a ella («M12»)
  tipo text not null default 'decision' check (tipo in ('decision','regla','dato')),
  texto text not null check (length(trim(texto)) between 3 and 600),
  finca_id uuid references fincas(id) on delete cascade,   -- null = general de la empresa
  activa boolean not null default true,
  created_by uuid default auth.uid() references profiles(id),
  conversacion_id uuid references chat_conversaciones(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on memoria_chat (finca_id) where activa;
alter table memoria_chat enable row level security;
-- Todos los usuarios activos ven la memoria general y la de sus fincas
create policy memoria_select on memoria_chat for select to authenticated
  using (finca_id is null or puede_ver_finca(finca_id));
-- Escribe: administrador (todo) y responsables (solo memoria de sus fincas)
create policy memoria_write on memoria_chat for all to authenticated
  using ((finca_id is null and es_admin()) or (finca_id is not null and puede_escribir_finca(finca_id, array['responsable']::app_rol[])))
  with check ((finca_id is null and es_admin()) or (finca_id is not null and puede_escribir_finca(finca_id, array['responsable']::app_rol[])));
create trigger trg_audit_memoria_chat after insert or update or delete on memoria_chat for each row execute function audit_trigger();

-- Resumen acumulado de cada conversación: lo anterior a resumen_hasta ya está resumido y no se vuelve a enviar entero
alter table chat_conversaciones add column resumen text;
alter table chat_conversaciones add column resumen_hasta timestamptz;
