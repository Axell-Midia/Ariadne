-- Reacciones predefinidas globales (usuario_id = NULL, es_predefinida = true)
-- Se ejecuta en SQL Editor; corre con rol postgres así que ignora RLS.
insert into public.tipos_reaccion (nombre, es_predefinida, usuario_id) values
  ('Dolor de estómago', true, null),
  ('Náuseas', true, null),
  ('Acidez / reflujo', true, null),
  ('Hinchazón', true, null),
  ('Alergia / reacción en piel', true, null),
  ('Fatiga', true, null),
  ('Dolor de cabeza', true, null),
  ('Mareos', true, null),
  ('Diarrea', true, null),
  ('Estreñimiento', true, null),
  ('Gases', true, null),
  ('Cólicos', true, null);