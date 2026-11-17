BEGIN;

CREATE TABLE IF NOT EXISTS estadistica.estudio_metas_grupo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estudio_id uuid NOT NULL REFERENCES estadistica.estudios(id) ON DELETE CASCADE,
  grupo_id uuid NOT NULL REFERENCES estadistica.grupos(id) ON DELETE RESTRICT,
  cantidad_objetivo integer NOT NULL CHECK (cantidad_objetivo >= 0),
  creado_por uuid NOT NULL REFERENCES estadistica.usuarios(id) ON DELETE RESTRICT,
  actualizado_por uuid REFERENCES estadistica.usuarios(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estudio_metas_grupo_estudio_grupo_uq UNIQUE (estudio_id, grupo_id)
);

CREATE INDEX IF NOT EXISTS estudio_metas_grupo_grupo_idx
  ON estadistica.estudio_metas_grupo (grupo_id);

DROP TRIGGER IF EXISTS estudio_metas_grupo_actualizar_fecha
  ON estadistica.estudio_metas_grupo;
CREATE TRIGGER estudio_metas_grupo_actualizar_fecha
  BEFORE UPDATE ON estadistica.estudio_metas_grupo
  FOR EACH ROW EXECUTE FUNCTION estadistica.fn_actualizar_fecha_modificacion();

DROP TRIGGER IF EXISTS estudio_metas_grupo_auditoria
  ON estadistica.estudio_metas_grupo;
CREATE TRIGGER estudio_metas_grupo_auditoria
  AFTER INSERT OR DELETE OR UPDATE ON estadistica.estudio_metas_grupo
  FOR EACH ROW EXECUTE FUNCTION estadistica.fn_auditar_cambio();

CREATE TABLE IF NOT EXISTS estadistica.estudio_metas_encuestado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estudio_id uuid NOT NULL REFERENCES estadistica.estudios(id) ON DELETE CASCADE,
  grupo_encuestado estadistica.grupo_encuestado NOT NULL,
  cantidad_objetivo integer NOT NULL CHECK (cantidad_objetivo >= 0),
  creado_por uuid NOT NULL REFERENCES estadistica.usuarios(id) ON DELETE RESTRICT,
  actualizado_por uuid REFERENCES estadistica.usuarios(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estudio_metas_encuestado_estudio_grupo_uq UNIQUE (estudio_id, grupo_encuestado)
);

DROP TRIGGER IF EXISTS estudio_metas_encuestado_actualizar_fecha
  ON estadistica.estudio_metas_encuestado;
CREATE TRIGGER estudio_metas_encuestado_actualizar_fecha
  BEFORE UPDATE ON estadistica.estudio_metas_encuestado
  FOR EACH ROW EXECUTE FUNCTION estadistica.fn_actualizar_fecha_modificacion();

DROP TRIGGER IF EXISTS estudio_metas_encuestado_auditoria
  ON estadistica.estudio_metas_encuestado;
CREATE TRIGGER estudio_metas_encuestado_auditoria
  AFTER INSERT OR DELETE OR UPDATE ON estadistica.estudio_metas_encuestado
  FOR EACH ROW EXECUTE FUNCTION estadistica.fn_auditar_cambio();

COMMIT;
