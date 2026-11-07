-- FoodTracker schema — pegar en Supabase SQL Editor (Desde "New query")

-- Comidas (catálogo de alimentos del usuario)
create table if not exists public.comidas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  usuario_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

-- Registros de comida (evento "comí esto a esta hora")
create table if not exists public.registros_comida (
  id uuid primary key default gen_random_uuid(),
  comida_id uuid not null references public.comidas(id) on delete restrict,
  usuario_id uuid not null default auth.uid(),
  cantidad integer not null default 1,
  fecha_hora timestamptz not null default now()
);

-- Tipos de reacción (catálogo: predefinidas globales + personalizadas por usuario)
create table if not exists public.tipos_reaccion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  es_predefinida boolean not null default false,
  usuario_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- Reacciones (evento "me sentí así a esta hora", opcionalmente ligado a una comida)
create table if not exists public.reacciones (
  id uuid primary key default gen_random_uuid(),
  tipo_reaccion_id uuid not null references public.tipos_reaccion(id) on delete restrict,
  registro_comida_id uuid references public.registros_comida(id) on delete set null,
  usuario_id uuid not null default auth.uid(),
  fecha_hora timestamptz not null default now(),
  severidad text not null default 'moderada' check (severidad in ('leve','moderada','fuerte')),
  zonas text[] not null default '{}'
);

create index if not exists idx_registros_usuario on public.registros_comida (usuario_id, fecha_hora);
create index if not exists idx_reacciones_usuario on public.reacciones (usuario_id, fecha_hora);
create index if not exists idx_reacciones_registro on public.reacciones (registro_comida_id);
create index if not exists idx_tipos_predef on public.tipos_reaccion (es_predefinida);

-- Row Level Security: cada usuario solo ve/escribe lo suyo + reacciones estándar
alter table public.comidas enable row level security;
alter table public.registros_comida enable row level security;
alter table public.tipos_reaccion enable row level security;
alter table public.reacciones enable row level security;

drop policy if exists "comidas_propias" on public.comidas;
create policy "comidas_propias" on public.comidas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists "registros_propios" on public.registros_comida;
create policy "registros_propios" on public.registros_comida
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists "tipos_ver" on public.tipos_reaccion;
create policy "tipos_ver" on public.tipos_reaccion
  for select using (usuario_id = auth.uid() or es_predefinida = true);

drop policy if exists "tipos_propios" on public.tipos_reaccion;
create policy "tipos_propios" on public.tipos_reaccion
  for insert with check (usuario_id = auth.uid());

drop policy if exists "tipos_editar" on public.tipos_reaccion;
create policy "tipos_editar" on public.tipos_reaccion
  for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists "tipos_borrar" on public.tipos_reaccion;
create policy "tipos_borrar" on public.tipos_reaccion
  for delete using (usuario_id = auth.uid());

drop policy if exists "reacciones_propias" on public.reacciones;
create policy "reacciones_propias" on public.reacciones
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Notas del día (diario libre con fecha y hora)
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

-- Vasos de agua (tracking diario, hasta 8; rellenable para superar la meta)
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

-- Migración: columna de puntos de dolor en la cabeza (reacciones)
alter table public.reacciones add column if not exists zonas text[] not null default '{}';