-- FoodTracker Realtime — cambios en tiempo real entre dispositivos (celular ↔ web)
-- Pegar en el SQL Editor de Supabase y ejecutar una sola vez.
-- GRATIS: Realtime está incluido en el plan Free de Supabase.

do $$
declare
  t text;
begin
  foreach t in array array['comidas', 'registros_comida', 'tipos_reaccion', 'reacciones', 'notas', 'vasos']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;   -- ya estaba en la publicación
      when undefined_object then null;   -- no existe la publicación
    end;
  end loop;
end $$;

-- Para que los borrados también lleguen con RLS evaluada correctamente,
-- la tabla necesita replica identity completa:
alter table public.comidas          replica identity full;
alter table public.registros_comida replica identity full;
alter table public.tipos_reaccion   replica identity full;
alter table public.reacciones       replica identity full;
alter table public.notas            replica identity full;
alter table public.vasos            replica identity full;
