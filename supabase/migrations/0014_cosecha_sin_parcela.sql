-- Una finca sin parcelas dadas de alta puede registrar cosechas a nivel de finca.
alter table cosechas alter column parcela_id drop not null;
