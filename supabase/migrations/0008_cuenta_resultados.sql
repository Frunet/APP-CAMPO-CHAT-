-- Cuenta de Resultados: categorías, proveedores con categoría por defecto, ventas (facturas emitidas),
-- movimientos sin factura (jornales, nóminas, préstamos, tributos) y vista de líneas por finca.
-- Los totales, el margen y el resultado NO se guardan: se calculan siempre (src/lib/resultados.ts).

create table categorias_resultado (
  codigo text primary key,
  nombre text not null,
  bloque text not null check (bloque in ('ingresos','gasto_directo','gasto_estructura')),
  orden int not null
);
insert into categorias_resultado (codigo, nombre, bloque, orden) values
  ('ventas','Ventas','ingresos',10),
  ('insumos','Insumos','gasto_directo',20),
  ('suministros','Suministros','gasto_directo',30),
  ('consumibles','Consumibles','gasto_directo',40),
  ('mano_obra','Mano de obra','gasto_directo',50),
  ('reparaciones','Reparaciones y mantenimiento','gasto_directo',60),
  ('otros_gastos','Otros gastos','gasto_directo',70),
  ('personal_fijo','Personal fijo','gasto_estructura',80),
  ('servicios_profesionales','Servicios profesionales','gasto_estructura',90),
  ('instalaciones','Instalaciones','gasto_estructura',100),
  ('gastos_generales','Gastos generales','gasto_estructura',110),
  ('gastos_financieros','Gastos financieros','gasto_estructura',120);
alter table categorias_resultado enable row level security;
create policy categorias_resultado_select on categorias_resultado for select to authenticated using (true);
create policy categorias_resultado_admin on categorias_resultado for all to authenticated using (es_admin()) with check (es_admin());

-- Proveedores con categoría por defecto (las facturas recibidas de un proveedor se clasifican solas)
create table proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  nif text,
  categoria_defecto text references categorias_resultado(codigo),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index proveedores_nombre_uq on proveedores (lower(trim(nombre)));
alter table proveedores enable row level security;
create policy proveedores_select on proveedores for select to authenticated using (true);
create policy proveedores_admin on proveedores for all to authenticated using (es_admin()) with check (es_admin());

-- Gastos (facturas recibidas): proveedor y categoría de la cuenta de resultados
alter table gastos add column proveedor_id uuid references proveedores(id);
alter table gastos add column categoria_resultado text references categorias_resultado(codigo);

create or replace function gasto_categoria_resultado() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cat text; pid uuid;
begin
  -- enlazar el proveedor por nombre si no viene
  if new.proveedor_id is null and new.proveedor is not null then
    select id into pid from public.proveedores where lower(trim(nombre)) = lower(trim(new.proveedor)) limit 1;
    new.proveedor_id := pid;
  end if;
  if new.categoria_resultado is null then
    select categoria_defecto into cat from public.proveedores where id = new.proveedor_id;
    new.categoria_resultado := coalesce(cat, case new.categoria::text
      when 'mano_obra' then 'mano_obra' when 'insumos' then 'insumos' when 'semillas_plantas' then 'insumos'
      when 'maquinaria' then 'reparaciones' when 'combustible' then 'suministros' when 'riego_agua' then 'suministros'
      when 'herramientas' then 'consumibles' else 'otros_gastos' end);
  end if;
  return new;
end $$;
create trigger trg_gasto_categoria_resultado before insert or update on gastos for each row execute function gasto_categoria_resultado();

-- clasificar lo ya registrado
update gastos g set categoria_resultado = case g.categoria::text
  when 'mano_obra' then 'mano_obra' when 'insumos' then 'insumos' when 'semillas_plantas' then 'insumos'
  when 'maquinaria' then 'reparaciones' when 'combustible' then 'suministros' when 'riego_agua' then 'suministros'
  when 'herramientas' then 'consumibles' else 'otros_gastos' end
where categoria_resultado is null;
alter table gastos alter column categoria_resultado set not null;

-- Ventas (facturas emitidas); importes sin IVA
create table ventas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  finca_id uuid not null references fincas(id),
  cliente text,
  numero_factura text,
  importe numeric(12,2) not null check (importe >= 0),
  campana_id uuid references campanas(id),
  documento_id uuid references documentos(id),
  observaciones text,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ventas (finca_id, fecha);
create unique index ventas_factura_uq on ventas (finca_id, lower(numero_factura)) where numero_factura is not null;
alter table ventas enable row level security;
create policy ventas_select on ventas for select to authenticated using (puede_ver_finca(finca_id));
create policy ventas_write on ventas for all to authenticated
  using (puede_escribir_finca(finca_id, array['responsable']::app_rol[]))
  with check (puede_escribir_finca(finca_id, array['responsable']::app_rol[]));

-- Movimientos sin factura: jornales, nóminas, cuotas de préstamo, tributos…
create table movimientos_resultado (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  finca_id uuid not null references fincas(id),
  tipo text not null check (tipo in ('jornal','nomina','prestamo','tributo','otro')),
  categoria text not null references categorias_resultado(codigo),
  concepto text,
  importe numeric(12,2) not null check (importe >= 0),
  observaciones text,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on movimientos_resultado (finca_id, fecha);
alter table movimientos_resultado enable row level security;
create policy mov_resultado_select on movimientos_resultado for select to authenticated using (puede_ver_finca(finca_id));
create policy mov_resultado_write on movimientos_resultado for all to authenticated
  using (puede_escribir_finca(finca_id, array['responsable']::app_rol[]))
  with check (puede_escribir_finca(finca_id, array['responsable']::app_rol[]));
create or replace function mov_resultado_categoria() returns trigger language plpgsql as $$
begin
  if (select bloque from categorias_resultado where codigo = new.categoria) = 'ingresos' then
    raise exception 'Un movimiento sin factura debe ser un gasto, no una venta' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_mov_resultado_categoria before insert or update on movimientos_resultado for each row execute function mov_resultado_categoria();

-- Todas las líneas de la cuenta (origen único): con security_invoker se aplica la RLS del usuario que consulta
create view v_resultado_lineas with (security_invoker = true) as
  select 'venta'::text as origen, v.id as ref_id, v.fecha, v.finca_id, 'ventas'::text as categoria, v.importe,
         concat_ws(' · ', v.cliente, v.numero_factura) as texto
    from ventas v
  union all
  select 'factura_recibida', g.id, g.fecha, g.finca_id, g.categoria_resultado, g.importe, concat_ws(' · ', g.proveedor, g.concepto)
    from gastos g where g.tipo_importe = 'registrado' and g.moneda = 'EUR'
  union all
  select 'jornal', p.id, p.fecha, p.finca_id, 'mano_obra', p.coste_total, concat_ws(' · ', 'Parte de trabajo', p.tipo_trabajo, p.actividad)
    from partes_trabajo p where p.coste_total is not null
  union all
  select 'movimiento', m.id, m.fecha, m.finca_id, m.categoria, m.importe, concat_ws(' · ', m.tipo, m.concepto)
    from movimientos_resultado m;
grant select on v_resultado_lineas to authenticated;

create trigger trg_audit_proveedores after insert or update or delete on proveedores for each row execute function audit_trigger();
create trigger trg_audit_ventas after insert or update or delete on ventas for each row execute function audit_trigger();
create trigger trg_audit_mov_resultado after insert or update or delete on movimientos_resultado for each row execute function audit_trigger();
