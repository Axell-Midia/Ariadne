-- FoodTracker Agua — pegar en Supabase SQL Editor (Desde "New query")
-- Ejecutar ANTES de actualizar el frontend para que el sync de vasos de agua funcione.

create table if not exists public.vasos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid(),
  fecha_hora timestamptz not null default now(),
  tipo text
);

create index if not exists idx_vasos_usuario on public.vasos (usuario_id, fecha_hora);

alter table public.vasos enable row level security;

drop policy if exists "vasos_propias" on public.vasos;
create policy "vasos_propias" on public.vasos
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());