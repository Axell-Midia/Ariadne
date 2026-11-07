-- FoodTracker Notas — pegar en Supabase SQL Editor (Desde "New query")
-- Ejecutar ANTES de actualizar el frontend para que el sync de notas funcione.

create table if not exists public.notas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid(),
  contenido text not null,
  fecha_hora timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_notas_usuario on public.notas (usuario_id, fecha_hora);

alter table public.notas enable row level security;

drop policy if exists "notas_propias" on public.notas;
create policy "notas_propias" on public.notas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());