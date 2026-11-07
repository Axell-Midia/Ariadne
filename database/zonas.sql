-- FoodTracker Zonas de dolor — pegar en Supabase SQL Editor (Desde "New query")
-- Ejecutar ANTES de actualizar el frontend para que el sync de zonas funcione.
-- Agrega la columna zonas (puntos de dolor marcados en la cabeza) a reacciones.

alter table public.reacciones add column if not exists zonas text[] not null default '{}';