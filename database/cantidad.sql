-- Migración: cantidad por registro de comida (por defecto 1)
alter table public.registros_comida add column if not exists cantidad integer not null default 1;