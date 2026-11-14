import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const { Client } = pg;

test('el procedimiento valida el uso único y calcula las estadísticas', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('BEGIN');
  try {
    const suffix = randomUUID();
    const user = await client.query(
      `INSERT INTO estadistica.usuarios (correo, hash_contrasena, nombre_visible, rol)
       VALUES ($1, 'test-hash', 'Prueba de integración', 'superusuario') RETURNING id`,
      [`${suffix}@example.test`],
    );
    const survey = await client.query(
      `INSERT INTO estadistica.encuestas (usuario_creador_id, titulo, estado)
       VALUES ($1, 'Prueba de integración', 'activa') RETURNING id`,
      [user.rows[0].id],
    );
    const question = await client.query(
      `INSERT INTO estadistica.preguntas
         (encuesta_id, posicion, pregunta, valor_minimo, valor_maximo, creado_por)
       VALUES ($1, 1, 'Valor de prueba', 0, 10, $2) RETURNING id`,
      [survey.rows[0].id, user.rows[0].id],
    );

    let duplicateTokenHash;
    for (const value of [2, 2, 4]) {
      const tokenHash = randomUUID().replaceAll('-', '');
      const code = await client.query(
        `INSERT INTO estadistica.codigos_encuesta
           (encuesta_id, usuario_emisor_id, grupo_encuestado, hash_token)
         VALUES ($1, $2, 'participantes', $3) RETURNING id`,
        [survey.rows[0].id, user.rows[0].id, tokenHash],
      );
      await client.query('CALL estadistica.sp_registrar_respuesta($1, $2::jsonb)', [
        tokenHash,
        JSON.stringify([{ pregunta_id: question.rows[0].id, valor: value }]),
      ]);
      if (value === 4) duplicateTokenHash = tokenHash;
      assert.ok(code.rows[0].id);
    }

    await client.query('SAVEPOINT duplicate_response');
    await assert.rejects(
      client.query('CALL estadistica.sp_registrar_respuesta($1, $2::jsonb)', [
        duplicateTokenHash,
        JSON.stringify([{ pregunta_id: question.rows[0].id, valor: 8 }]),
      ]),
      (error) => error.code === 'P0001' && error.message === 'codigo_invalido_o_usado',
    );
    await client.query('ROLLBACK TO SAVEPOINT duplicate_response');

    const stats = await client.query(
      `SELECT universo, media, mediana, moda, rango, maximo, minimo,
              varianza, desviacion_estandar
       FROM estadistica.fn_estadisticas_pregunta_numerica($1)`,
      [question.rows[0].id],
    );
    const result = stats.rows[0];
    assert.equal(Number(result.universo), 3);
    assert.ok(Math.abs(Number(result.media) - 8 / 3) < 1e-10);
    assert.equal(Number(result.mediana), 2);
    assert.equal(Number(result.moda), 2);
    assert.equal(Number(result.rango), 2);
    assert.equal(Number(result.maximo), 4);
    assert.equal(Number(result.minimo), 2);
    assert.ok(Math.abs(Number(result.varianza) - 8 / 9) < 1e-10);
    assert.ok(Math.abs(Number(result.desviacion_estandar) - Math.sqrt(8 / 9)) < 1e-10);

    const outOfRangeToken = randomUUID().replaceAll('-', '');
    await client.query(
      `INSERT INTO estadistica.codigos_encuesta
         (encuesta_id, usuario_emisor_id, grupo_encuestado, hash_token)
       VALUES ($1, $2, 'participantes', $3)`,
      [survey.rows[0].id, user.rows[0].id, outOfRangeToken],
    );
    await client.query('SAVEPOINT out_of_range_response');
    await assert.rejects(
      client.query('CALL estadistica.sp_registrar_respuesta($1, $2::jsonb)', [
        outOfRangeToken,
        JSON.stringify([{ pregunta_id: question.rows[0].id, valor: 11 }]),
      ]),
      (error) => error.code === 'P0001'
        && error.message === 'respuesta_fuera_de_rango_o_pregunta_desconocida',
    );
    await client.query('ROLLBACK TO SAVEPOINT out_of_range_response');

    const summary = await client.query(
      `SELECT cantidad_respuestas, cantidad_participantes
       FROM estadistica.vista_resumen_respuestas WHERE encuesta_id = $1`,
      [survey.rows[0].id],
    );
    assert.equal(Number(summary.rows[0].cantidad_respuestas), 3);
    assert.equal(Number(summary.rows[0].cantidad_participantes), 3);

    await client.query(
      `INSERT INTO estadistica.borradores_analisis
         (encuesta_id, contenido, creado_por, actualizado_por)
       VALUES ($1, 'Conclusión de prueba', $2, $2)`,
      [survey.rows[0].id, user.rows[0].id],
    );
    const draftAudit = await client.query(
      `SELECT registro_id, datos_nuevos->>'actualizado_en' AS actualizado_en
       FROM estadistica.auditoria_general
       WHERE tabla = 'borradores_analisis' AND registro_id = $1 AND operacion = 'INSERT'`,
      [survey.rows[0].id],
    );
    assert.equal(draftAudit.rows[0].registro_id, survey.rows[0].id);
    assert.ok(draftAudit.rows[0].actualizado_en);

    const audit = await client.query(
      `SELECT count(*)::int AS events,
              bool_or(datos_nuevos ? 'hash_contrasena') FILTER (WHERE tabla = 'usuarios') AS stores_password_hash
       FROM estadistica.auditoria_general`,
    );
    assert.ok(audit.rows[0].events >= 10);
    assert.equal(audit.rows[0].stores_password_hash, false);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
