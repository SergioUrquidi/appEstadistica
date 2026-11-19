-- Fix: eliminar la versión antigua de fn_listar_usuarios (1 parámetro)
-- que causa ambigüedad con la versión nueva (2 parámetros) creada en add_activo_usuarios.sql
-- Ejecutar una sola vez como superusuario o dueño del schema

DROP FUNCTION IF EXISTS estadistica.fn_listar_usuarios(boolean);
