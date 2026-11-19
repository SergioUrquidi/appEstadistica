-- Migración: CRUD completo para preguntas (eliminar y editar)
-- Solo aplica cuando la encuesta está en estado 'borrador'

BEGIN;

-- 1. Stored procedure para eliminar una pregunta
CREATE OR REPLACE PROCEDURE estadistica.usp_eliminar_pregunta(
  p_encuesta_id UUID,
  p_pregunta_id UUID,
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

  IF v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'solo_se_pueden_modificar_preguntas_de_borradores';
  END IF;

  DELETE FROM estadistica.preguntas
  WHERE id = p_pregunta_id
    AND encuesta_id = p_encuesta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pregunta_no_encontrada';
  END IF;

  -- Reordenar posiciones
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY posicion, creado_en) AS nueva_pos
    FROM estadistica.preguntas
    WHERE encuesta_id = p_encuesta_id
  )
  UPDATE estadistica.preguntas p
  SET posicion = r.nueva_pos
  FROM ranked r
  WHERE p.id = r.id;
END;
$$;

-- 2. Stored procedure para editar el prompt de una pregunta
CREATE OR REPLACE PROCEDURE estadistica.usp_editar_pregunta(
  p_encuesta_id UUID,
  p_pregunta_id UUID,
  p_prompt      TEXT,
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

  IF v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'solo_se_pueden_modificar_preguntas_de_borradores';
  END IF;

  IF p_prompt IS NULL OR trim(p_prompt) = '' THEN
    RAISE EXCEPTION 'el_texto_de_la_pregunta_no_puede_estar_vacio';
  END IF;

  UPDATE estadistica.preguntas
  SET prompt = trim(p_prompt),
      actualizado_en = now(),
      actualizado_por = p_usuario_id
  WHERE id = p_pregunta_id
    AND encuesta_id = p_encuesta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pregunta_no_encontrada';
  END IF;
END;
$$;

COMMIT;
