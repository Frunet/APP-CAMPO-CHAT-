-- El nombre de quien anota se guarda en la propia anotación (los perfiles son privados: un usuario no puede leer el de otro).
alter table diario_fincas add column autor_nombre text;
create or replace function diario_autor() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.autor_nombre is null then
    select nombre into new.autor_nombre from public.profiles where id = coalesce(new.created_by, auth.uid());
  end if;
  return new;
end $$;
create trigger trg_diario_autor before insert on diario_fincas for each row execute function diario_autor();
