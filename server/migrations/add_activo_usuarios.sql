-- Migración: agregar columna activo a estadistica.usuarios
-- Ejecutar como superusuario o dueño del schema

BEGIN;

-- 1. Agregar columna activo
ALTER TABLE estadistica.usuarios
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Recrear vw_usuarios para exponer activo
CREATE OR REPLACE VIEW estadistica.vw_usuarios AS
SELECT
  u.id,
  u.correo              AS email,
  u.nombre_visible      AS display_name,
  u.rol::TEXT           AS role,
  u.activo,
  u.creado_en           AS created_at,
  u.creado_por,
  u.actualizado_en      AS updated_at,
  u.actualizado_por
FROM estadistica.usuarios u;

-- 3. Recrear fn_listar_usuarios para respetar el filtro activo
--    Parámetro p_incluir_superusuarios: TRUE solo para superuser
--    Parámetro p_solo_activos: TRUE para ocultar dados de baja
CREATE OR REPLACE FUNCTION estadistica.fn_listar_usuarios(
  p_incluir_superusuarios BOOLEAN DEFAULT FALSE,
  p_solo_activos          BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id            UUID,
  email         TEXT,
  display_name  TEXT,
  role          TEXT,
  activo        BOOLEAN,
  created_at    TIMESTAMPTZ,
  creado_por    UUID,
  updated_at    TIMESTAMPTZ,
  actualizado_por UUID
)
LANGUAGE sql STABLE AS $$
  SELECT
    u.id,
    u.correo              AS email,
    u.nombre_visible      AS display_name,
    u.rol::TEXT           AS role,
    u.activo,
    u.creado_en           AS created_at,
    u.creado_por,
    u.actualizado_en      AS updated_at,
    u.actualizado_por
  FROM estadistica.usuarios u
  WHERE
    (p_incluir_superusuarios OR u.rol <> 'superusuario')
    AND (NOT p_solo_activos OR u.activo = TRUE)
  ORDER BY u.creado_en DESC;
$$;

-- 4. Actualizar fn_autenticar_usuario para rechazar inactivos
--    (asumiendo que la función existe y devuelve la fila del usuario)
CREATE OR REPLACE FUNCTION estadistica.fn_autenticar_usuario(p_correo TEXT)
RETURNS SETOF estadistica.usuarios
LANGUAGE sql STABLE AS $$
  SELECT * FROM estadistica.usuarios
  WHERE correo = p_correo
    AND activo = TRUE
  LIMIT 1;
$$;

COMMIT;
