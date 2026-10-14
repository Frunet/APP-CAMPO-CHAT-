-- ============================================================
-- Control de fincas agrícolas · Esquema base (Fase 1)
-- La base de datos es la fuente de verdad. RLS activo en todo.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tipos ----------
create type app_rol as enum ('administrador', 'responsable', 'encargado', 'consulta');
create type tipo_explotacion as enum ('propia', 'arrendada', 'terceros');
create type estado_parcela as enum ('activa', 'en_preparacion', 'en_descanso', 'inactiva');
create type categoria_gasto as enum (
  'mano_obra', 'insumos', 'maquinaria', 'combustible', 'semillas_plantas',
  'riego_agua', 'herramientas', 'transporte', 'otros'
);
-- Diferencia importes reales de presupuestos / estimaciones / previsiones
create type tipo_importe as enum ('registrado', 'presupuesto', 'estimacion', 'prevision');
create type estado_aviso as enum ('pendiente', 'leido', 'resuelto', 'pospuesto');
create type prioridad_aviso as enum ('baja', 'media', 'alta', 'critica');
create type estado_accion as enum ('pendiente', 'confirmada', 'cancelada', 'caducada');
create type estado_documento as enum ('subido', 'procesado', 'revisado', 'importado', 'descartado');

-- ---------- Utilidades ----------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Perfiles ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  email text,
  rol app_rol not null default 'consulta',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_upd before update on profiles
  for each row execute function set_updated_at();

-- El primer usuario registrado es administrador; el resto entra como consulta.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, nombre, email, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    new.email,
    case when not exists (select 1 from public.profiles) then 'administrador'::public.app_rol
         else 'consulta'::public.app_rol end
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Fincas, campañas, parcelas, cultivos ----------
create table fincas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  ubicacion text,
  responsable_id uuid references profiles(id),
  tipo_explotacion tipo_explotacion not null default 'propia',
  superficie_ha numeric(10,2) check (superficie_ha is null or superficie_ha >= 0),
  observaciones text,
  activa boolean not null default true,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_fincas_upd before update on fincas
  for each row execute function set_updated_at();

create table usuarios_fincas (
  user_id uuid not null references profiles(id) on delete cascade,
  finca_id uuid not null references fincas(id) on delete cascade,
  primary key (user_id, finca_id)
);

create table campanas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  fecha_inicio date not null,
  fecha_fin date,
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create table parcelas (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id) on delete restrict,
  codigo text not null,
  nombre text,
  superficie_ha numeric(10,2) check (superficie_ha is null or superficie_ha >= 0),
  estado estado_parcela not null default 'activa',
  observaciones text,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (finca_id, codigo)
);
create trigger trg_parcelas_upd before update on parcelas
  for each row execute function set_updated_at();

create table cultivos_parcela (
  id uuid primary key default gen_random_uuid(),
  parcela_id uuid not null references parcelas(id) on delete cascade,
  campana_id uuid references campanas(id),
  cultivo text not null,
  variedad text,
  fecha_plantacion date,
  fecha_prevista_cosecha date,
  observaciones text,
  created_at timestamptz not null default now()
);
create index on cultivos_parcela (parcela_id);

-- ---------- Funciones de permisos (usadas por RLS) ----------
create or replace function mi_rol() returns app_rol
language sql stable security definer set search_path = '' as $$
  select rol from public.profiles where id = auth.uid() and activo
$$;

create or replace function es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select rol = 'administrador' from public.profiles
                   where id = auth.uid() and activo), false)
$$;

create or replace function puede_ver_finca(fid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.es_admin() or exists (
    select 1 from public.usuarios_fincas uf
    join public.profiles p on p.id = uf.user_id and p.activo
    where uf.user_id = auth.uid() and uf.finca_id = fid)
$$;

-- p_roles: roles que pueden escribir en la finca (administrador siempre puede)
create or replace function puede_escribir_finca(fid uuid, p_roles app_rol[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.es_admin() or (
    public.mi_rol() = any (p_roles) and public.puede_ver_finca(fid))
$$;

revoke execute on function mi_rol(), es_admin(), puede_ver_finca(uuid),
  puede_escribir_finca(uuid, app_rol[]) from public, anon;
grant execute on function mi_rol(), es_admin(), puede_ver_finca(uuid),
  puede_escribir_finca(uuid, app_rol[]) to authenticated;

-- ---------- Mano de obra ----------
create table trabajadores (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid references fincas(id),
  nombre text not null,
  coste_hora numeric(8,2) check (coste_hora is null or coste_hora >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table equipos (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id),
  nombre text not null,
  coste_hora numeric(8,2) check (coste_hora is null or coste_hora >= 0), -- por persona
  activo boolean not null default true,
  unique (finca_id, nombre)
);

create table partes_trabajo (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  finca_id uuid not null references fincas(id),
  parcela_id uuid references parcelas(id),
  trabajador_id uuid references trabajadores(id),
  equipo_id uuid references equipos(id),
  num_trabajadores integer not null default 1 check (num_trabajadores > 0),
  hora_entrada time,
  hora_salida time,
  horas_por_trabajador numeric(6,2) not null check (horas_por_trabajador > 0 and horas_por_trabajador <= 24),
  horas_totales numeric(8,2),          -- calculado por trigger
  tipo_trabajo text,
  actividad text,
  coste_hora numeric(8,2) check (coste_hora is null or coste_hora >= 0),
  coste_total numeric(10,2),           -- null si no hay tarifa válida
  observaciones text,
  origen text not null default 'manual', -- manual | chat | documento
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trabajador_id is null or equipo_id is null)
);
create index on partes_trabajo (finca_id, fecha);
create index on partes_trabajo (parcela_id, fecha);

-- Evita duplicados exactos (mismo día/finca/parcela/trabajador-equipo/actividad)
create unique index partes_trabajo_dedupe on partes_trabajo (
  fecha, finca_id,
  coalesce(parcela_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(trabajador_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(equipo_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(tipo_trabajo, ''), coalesce(actividad, '')
);

create or replace function calc_parte_trabajo() returns trigger
language plpgsql as $$
declare tarifa numeric;
begin
  -- Si hay entrada y salida, las horas se derivan de ellas
  if new.hora_entrada is not null and new.hora_salida is not null
     and new.hora_salida > new.hora_entrada then
    new.horas_por_trabajador :=
      round(extract(epoch from (new.hora_salida - new.hora_entrada)) / 3600.0, 2);
  end if;
  new.horas_totales := new.horas_por_trabajador * new.num_trabajadores;

  tarifa := new.coste_hora;
  if tarifa is null and new.trabajador_id is not null then
    select coste_hora into tarifa from trabajadores where id = new.trabajador_id;
  end if;
  if tarifa is null and new.equipo_id is not null then
    select coste_hora into tarifa from equipos where id = new.equipo_id;
  end if;
  new.coste_hora := tarifa;
  new.coste_total := case when tarifa is null then null
                          else round(new.horas_totales * tarifa, 2) end;
  return new;
end $$;
create trigger trg_parte_calc before insert or update on partes_trabajo
  for each row execute function calc_parte_trabajo();
create trigger trg_parte_upd before update on partes_trabajo
  for each row execute function set_updated_at();

-- ---------- Cosechas ----------
create table cosechas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  finca_id uuid not null references fincas(id),
  parcela_id uuid not null references parcelas(id),
  cultivo text not null,
  variedad text,
  campana_id uuid references campanas(id),
  kg numeric(12,2) not null check (kg > 0),
  cajas integer check (cajas is null or cajas >= 0),
  calibre text,
  calidad text,
  destino text,
  equipo_id uuid references equipos(id),
  observaciones text,
  origen text not null default 'manual',
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on cosechas (finca_id, fecha);
create index on cosechas (parcela_id, fecha);
create index on cosechas (campana_id);
create trigger trg_cosechas_upd before update on cosechas
  for each row execute function set_updated_at();

-- ---------- Documentos ----------
create table documentos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null default 'otro',     -- factura, albaran, parte, informe_cosecha, foto, otro
  mime text,
  tamano_bytes bigint,
  storage_path text not null unique,     -- original inmutable en Storage
  finca_id uuid references fincas(id),
  parcela_id uuid references parcelas(id),
  campana_id uuid references campanas(id),
  fecha_documento date,
  texto_extraido text,
  datos_extraidos jsonb,                 -- vista previa pendiente de revisión
  estado estado_documento not null default 'subido',
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
create index on documentos (finca_id, fecha_documento);
create index documentos_fts on documentos
  using gin (to_tsvector('spanish', coalesce(nombre,'') || ' ' || coalesce(texto_extraido,'')));

-- ---------- Gastos ----------
create table gastos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  proveedor text,
  categoria categoria_gasto not null,
  concepto text,
  importe numeric(12,2) not null check (importe >= 0),
  moneda char(3) not null default 'EUR',
  tipo_importe tipo_importe not null default 'registrado',
  finca_id uuid not null references fincas(id),
  parcela_id uuid references parcelas(id),
  campana_id uuid references campanas(id),
  documento_id uuid references documentos(id),
  observaciones text,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on gastos (finca_id, fecha);
create trigger trg_gastos_upd before update on gastos
  for each row execute function set_updated_at();

-- ---------- Calendario / tareas ----------
create table tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  tipo text not null default 'tarea',    -- tarea | cosecha_prevista | tratamiento | recordatorio
  fecha date not null,
  finca_id uuid references fincas(id),
  parcela_id uuid references parcelas(id),
  completada boolean not null default false,
  asignado_a uuid references profiles(id),
  origen text not null default 'manual',
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
create index on tareas (fecha) where not completada;

-- ---------- Avisos ----------
create table avisos_reglas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                    -- cosecha_proxima | falta_parte | doc_pendiente | anomalia ...
  nombre text not null,
  finca_id uuid references fincas(id),
  parametros jsonb not null default '{}',
  hora time not null default '08:00',
  periodicidad text not null default 'diaria',  -- diaria | semanal | mensual
  prioridad prioridad_aviso not null default 'media',
  destinatarios uuid[] not null default '{}',
  enviar_email boolean not null default true,
  activa boolean not null default true,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);

create table avisos (
  id uuid primary key default gen_random_uuid(),
  regla_id uuid references avisos_reglas(id) on delete set null,
  tipo text not null,
  titulo text not null,
  mensaje text,
  prioridad prioridad_aviso not null default 'media',
  finca_id uuid references fincas(id),
  destinatario_id uuid not null references profiles(id) on delete cascade,
  estado estado_aviso not null default 'pendiente',
  pospuesto_hasta timestamptz,
  -- Evita repetir el mismo aviso para el mismo destinatario
  dedupe_key text not null,
  email_enviado_at timestamptz,
  push_enviado_at timestamptz,           -- reservado para notificaciones push futuras
  created_at timestamptz not null default now(),
  unique (destinatario_id, dedupe_key)
);
create index on avisos (destinatario_id, estado);

-- Dispositivos para push móvil (arquitectura preparada)
create table push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  canal text not null default 'webpush',
  datos jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------- Chat ----------
create table chat_conversaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  titulo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table chat_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references chat_conversaciones(id) on delete cascade,
  rol text not null check (rol in ('user', 'assistant')),
  contenido jsonb not null,              -- bloques de la API (texto, tool_use, tool_result)
  texto text,                            -- texto plano para mostrar/buscar
  created_at timestamptz not null default now()
);
create index on chat_mensajes (conversacion_id, created_at);

-- Instrucciones/compromisos pendientes (distintos de los datos oficiales)
create table acciones_pendientes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid references chat_conversaciones(id) on delete set null,
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  tipo text not null,                    -- registrar_parte | registrar_cosecha | registrar_gasto | crear_tarea
  payload jsonb not null,
  resumen text not null,
  estado estado_accion not null default 'pendiente',
  resultado_id uuid,
  created_at timestamptz not null default now(),
  resuelta_at timestamptz
);
create index on acciones_pendientes (user_id, estado);

-- ---------- Auditoría ----------
create table audit_log (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id text,
  accion text not null,                  -- INSERT | UPDATE | DELETE
  usuario_id uuid default auth.uid(),
  antes jsonb,
  despues jsonb,
  fecha timestamptz not null default now()
);
create index on audit_log (tabla, registro_id);

create or replace function audit_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (tabla, registro_id, accion, antes, despues)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', ''),
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['fincas','parcelas','cultivos_parcela','campanas','trabajadores',
    'equipos','partes_trabajo','cosechas','gastos','documentos','tareas','usuarios_fincas','profiles']
  loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$I
                    for each row execute function audit_trigger()', t);
  end loop;
end $$;

-- ============================================================
-- RLS
-- ============================================================
alter table profiles enable row level security;
alter table fincas enable row level security;
alter table usuarios_fincas enable row level security;
alter table campanas enable row level security;
alter table parcelas enable row level security;
alter table cultivos_parcela enable row level security;
alter table trabajadores enable row level security;
alter table equipos enable row level security;
alter table partes_trabajo enable row level security;
alter table cosechas enable row level security;
alter table documentos enable row level security;
alter table gastos enable row level security;
alter table tareas enable row level security;
alter table avisos_reglas enable row level security;
alter table avisos enable row level security;
alter table push_suscripciones enable row level security;
alter table chat_conversaciones enable row level security;
alter table chat_mensajes enable row level security;
alter table acciones_pendientes enable row level security;
alter table audit_log enable row level security;

-- Perfiles: cada uno ve el suyo; admin ve y gestiona todos
create policy profiles_select on profiles for select to authenticated
  using (id = (select auth.uid()) or es_admin());
create policy profiles_admin_upd on profiles for update to authenticated
  using (es_admin()) with check (es_admin());

-- Fincas
create policy fincas_select on fincas for select to authenticated
  using (puede_ver_finca(id));
create policy fincas_insert on fincas for insert to authenticated
  with check (es_admin());
create policy fincas_update on fincas for update to authenticated
  using (puede_escribir_finca(id, array['responsable']::app_rol[]))
  with check (puede_escribir_finca(id, array['responsable']::app_rol[]));

create policy uf_select on usuarios_fincas for select to authenticated
  using (user_id = (select auth.uid()) or es_admin());
create policy uf_admin on usuarios_fincas for all to authenticated
  using (es_admin()) with check (es_admin());

-- Catálogos globales: lectura para todos los autenticados, escritura admin
create policy campanas_select on campanas for select to authenticated using (true);
create policy campanas_admin on campanas for all to authenticated
  using (es_admin()) with check (es_admin());

-- Parcelas y cultivos: gestiona el responsable de la finca
create policy parcelas_select on parcelas for select to authenticated
  using (puede_ver_finca(finca_id));
create policy parcelas_write on parcelas for all to authenticated
  using (puede_escribir_finca(finca_id, array['responsable']::app_rol[]))
  with check (puede_escribir_finca(finca_id, array['responsable']::app_rol[]));

create policy cultivos_select on cultivos_parcela for select to authenticated
  using (exists (select 1 from parcelas p where p.id = parcela_id and puede_ver_finca(p.finca_id)));
create policy cultivos_write on cultivos_parcela for all to authenticated
  using (exists (select 1 from parcelas p where p.id = parcela_id
        and puede_escribir_finca(p.finca_id, array['responsable']::app_rol[])))
  with check (exists (select 1 from parcelas p where p.id = parcela_id
        and puede_escribir_finca(p.finca_id, array['responsable']::app_rol[])));

-- Trabajadores / equipos
create policy trab_select on trabajadores for select to authenticated
  using (finca_id is null and mi_rol() is not null or puede_ver_finca(finca_id));
create policy trab_write on trabajadores for all to authenticated
  using (es_admin() or (finca_id is not null and puede_escribir_finca(finca_id, array['responsable']::app_rol[])))
  with check (es_admin() or (finca_id is not null and puede_escribir_finca(finca_id, array['responsable']::app_rol[])));

create policy equipos_select on equipos for select to authenticated using (puede_ver_finca(finca_id));
create policy equipos_write on equipos for all to authenticated
  using (puede_escribir_finca(finca_id, array['responsable']::app_rol[]))
  with check (puede_escribir_finca(finca_id, array['responsable']::app_rol[]));

-- Partes y cosechas: encargado, responsable y admin escriben; consulta solo lee
create policy partes_select on partes_trabajo for select to authenticated
  using (puede_ver_finca(finca_id));
create policy partes_insert on partes_trabajo for insert to authenticated
  with check (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]));
create policy partes_update on partes_trabajo for update to authenticated
  using (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]))
  with check (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]));
create policy partes_delete on partes_trabajo for delete to authenticated
  using (puede_escribir_finca(finca_id, array['responsable']::app_rol[]));

create policy cosechas_select on cosechas for select to authenticated
  using (puede_ver_finca(finca_id));
create policy cosechas_insert on cosechas for insert to authenticated
  with check (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]));
create policy cosechas_update on cosechas for update to authenticated
  using (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]))
  with check (puede_escribir_finca(finca_id, array['responsable','encargado']::app_rol[]));
create policy cosechas_delete on cosechas for delete to authenticated
  using (puede_escribir_finca(finca_id, array['responsable']::app_rol[]));

-- Gastos y documentos
create policy gastos_select on gastos for select to authenticated using (puede_ver_finca(finca_id));
create policy gastos_write on gastos for all to authenticated
  using (puede_escribir_finca(finca_id, array['responsable']::app_rol[]))
  with check (puede_escribir_finca(finca_id, array['responsable']::app_rol[]));

create policy docs_select on documentos for select to authenticated
  using ((finca_id is null and created_by = (select auth.uid())) or puede_ver_finca(finca_id) or es_admin());
create policy docs_insert on documentos for insert to authenticated
  with check (mi_rol() in ('administrador','responsable','encargado'));
create policy docs_update on documentos for update to authenticated
  using (created_by = (select auth.uid()) or es_admin())
  with check (created_by = (select auth.uid()) or es_admin());

-- Tareas
create policy tareas_select on tareas for select to authenticated
  using (finca_id is null and created_by = (select auth.uid()) or puede_ver_finca(finca_id));
create policy tareas_write on tareas for all to authenticated
  using (puede_escribir_finca(coalesce(finca_id, '00000000-0000-0000-0000-000000000000'),
         array['responsable','encargado']::app_rol[]) or created_by = (select auth.uid()))
  with check (mi_rol() in ('administrador','responsable','encargado'));

-- Avisos: cada usuario ve y gestiona los suyos; las reglas las gestiona admin/responsable
create policy avisos_select on avisos for select to authenticated
  using (destinatario_id = (select auth.uid()));
create policy avisos_update on avisos for update to authenticated
  using (destinatario_id = (select auth.uid()))
  with check (destinatario_id = (select auth.uid()));
create policy reglas_select on avisos_reglas for select to authenticated
  using (es_admin() or mi_rol() = 'responsable' or (select auth.uid()) = any (destinatarios));
create policy reglas_write on avisos_reglas for all to authenticated
  using (es_admin() or mi_rol() = 'responsable')
  with check (es_admin() or mi_rol() = 'responsable');

create policy push_own on push_suscripciones for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Chat: privado de cada usuario
create policy conv_own on chat_conversaciones for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy msg_own on chat_mensajes for all to authenticated
  using (exists (select 1 from chat_conversaciones c
                 where c.id = conversacion_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from chat_conversaciones c
                 where c.id = conversacion_id and c.user_id = (select auth.uid())));
create policy acc_own on acciones_pendientes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Auditoría: solo lectura para administradores (se escribe desde el trigger)
create policy audit_admin on audit_log for select to authenticated using (es_admin());

-- ---------- Storage: bucket privado de documentos ----------
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

create policy docs_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and mi_rol() is not null);
create policy docs_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and mi_rol() in ('administrador','responsable','encargado'));
-- Sin update/delete: el original se conserva sin modificar.
