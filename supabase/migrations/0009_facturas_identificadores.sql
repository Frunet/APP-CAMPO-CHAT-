-- Facturas por el chat: identificadores de finca (para asignar cada línea a su finca), empresa propia (para saber si una factura es emitida o recibida)
-- y datos de factura en gastos y ventas.

create table finca_identificadores (
  id uuid primary key default gen_random_uuid(),
  finca_id uuid not null references fincas(id) on delete cascade,
  tipo text not null check (tipo in ('alias','catastro','direccion','cups','contador','matricula','otro')),
  valor text not null check (length(trim(valor)) > 0),
  valor_norm text not null,            -- minúsculas, sin tildes ni signos (lo calcula la aplicación)
  created_at timestamptz not null default now()
);
create unique index finca_identificadores_uq on finca_identificadores (finca_id, valor_norm);
create index on finca_identificadores (valor_norm);
alter table finca_identificadores enable row level security;
create policy finca_ident_select on finca_identificadores for select to authenticated using (puede_ver_finca(finca_id));
create policy finca_ident_admin on finca_identificadores for all to authenticated using (es_admin()) with check (es_admin());

-- NIF/CIF de nuestras empresas: si el cliente de una factura es una de ellas, es una factura recibida (gasto); si es el emisor, una venta
create table empresas_propias (
  id uuid primary key default gen_random_uuid(),
  nif text not null,
  nombre text not null,
  created_at timestamptz not null default now()
);
create unique index empresas_propias_nif_uq on empresas_propias (upper(replace(nif, ' ', '')));
alter table empresas_propias enable row level security;
create policy empresas_propias_select on empresas_propias for select to authenticated using (true);
create policy empresas_propias_admin on empresas_propias for all to authenticated using (es_admin()) with check (es_admin());

-- Datos de la factura en cada línea registrada (importe = base imponible de la línea, sin IVA)
alter table gastos add column numero_factura text;
alter table gastos add column proveedor_nif text;
alter table gastos add column iva_importe numeric(12,2);
alter table gastos add column linea int;
create unique index gastos_factura_linea_uq on gastos (coalesce(upper(replace(proveedor_nif, ' ', '')), lower(trim(proveedor))), lower(trim(numero_factura)), coalesce(linea, 1))
  where numero_factura is not null and (proveedor_nif is not null or proveedor is not null);

alter table ventas add column cliente_nif text;
alter table ventas add column iva_importe numeric(12,2);

create trigger trg_audit_finca_ident after insert or update or delete on finca_identificadores for each row execute function audit_trigger();
create trigger trg_audit_empresas_propias after insert or update or delete on empresas_propias for each row execute function audit_trigger();
