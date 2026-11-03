-- Permiso para que la consulta externa (ChatGPT) vea datos económicos: apagado por defecto.
alter table public.api_consulta add column if not exists incluye_finanzas boolean not null default false;
comment on column public.api_consulta.incluye_finanzas is 'true: la clave puede consultar gastos, ventas, resultados, costes y tarifas. Por defecto false.';
