-- Claves de acceso de solo lectura para consultar las horas desde fuera (p. ej. un GPT de ChatGPT). Se guarda solo el hash de la clave.
create table api_consulta (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  clave_hash text not null unique,
  activa boolean not null default true,
  expone_nombres boolean not null default true,   -- false: la consulta devuelve solo códigos de trabajador, sin nombres
  created_at timestamptz not null default now(),
  ultimo_uso timestamptz
);
alter table api_consulta enable row level security;  -- sin políticas: solo accede la función del servidor (clave de servicio)
comment on table api_consulta is 'Claves de solo lectura para la función consulta-horas. Sin políticas RLS a propósito.';
