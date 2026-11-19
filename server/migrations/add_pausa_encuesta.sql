-- Migración: pausar y reactivar encuesta (solo si no tiene respuestas)

BEGIN;

-- 1. Agregar estado 'pausada' al enum si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'estadistica.estado_encuesta'::regtype
      AND enumlabel = 'pausada'
  ) THEN
    ALTER TYPE estadistica.estado_encuesta ADD VALUE 'pausada';
  END IF;
END;
$$;

COMMIT;

-- Los enum ADD VALUE no pueden ir dentro de la misma transacción que los usos
-- Por eso usamos transacciones separadas.

BEGIN;

-- 2. Stored procedure para pausar encuesta activa sin respuestas
CREATE OR REPLACE PROCEDURE estadistica.usp_pausar_encuesta(
  p_encuesta_id UUID,
  p_usuario_id  UUID
)
LANGUAGE plpgsql AS $$
DECLARE
  v_estado        TEXT;
  v_respuestas    BIGINT;
BEGIN
  SELECT estado::TEXT INTO v_estado
  FROM estadistica.encuestas
  WHERE id = p_encuesta_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'encuesta_no_encontrada';
  END IF;

  IF v_estado <> 'activa' THEN
    RAISE EXCEPTION 'solo_se_pueden_pausar_encuestas_activas';
  END IF;

  SELECT COALESCE(cantidad_respuestas, 0) INTO v_respuestas
  FROM estadistica.vista_resumen_respuestas
  WHERE encuesta_id = p_encuesta_id;

  IF v_respuestas > 0 THEN
    RAISE EXCEPTION 'no_se_puede_pausar_una_encuesta_con_respuestas';
  END IF;

  UPDATE estadistica.encuestas
  SET estado = 'pausada',
      actualizado_en = now(),
      actualizado_por = p_usuario_id
  WHERE id = p_encuesta_id;
END;
$$;

-- 3. Stored procedure para reactivar encuesta pausada
CREATE OR REPLACE PROCEDURE estadistica.usp_reactivar_encuesta(
  p_encuesta_id UUID,
  p_usuario_id  UUID
)
LANGUAGE plpgsql AS $$
DECLARE
  v_estado TEXT;
BEGIN
  SELECT estado::TEXT INTO v_estado
  FROM estadistica.encuestas
  WHERE id = p_encuesta_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'encuesta_no_encontrada';
  END IF;

  IF v_estado <> 'pausada' THEN
    RAISE EXCEPTION 'solo_se_pueden_reactivar_encuestas_pausadas';
  END IF;

  UPDATE estadistica.encuestas
  SET estado = 'activa',
      actualizado_en = now(),
      actualizado_por = p_usuario_id
  WHERE id = p_encuesta_id;
END;
$$;

COMMIT;
