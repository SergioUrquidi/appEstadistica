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
      `INSERT INTO estadistica.encuestas (usuario_creador_id, titulo, estado, modo_codigo)
       VALUES ($1, 'Prueba de integración', 'activa', 'conocimiento') RETURNING id`,
      [user.rows[0].id],
    );
    const question = await client.query(
      `INSERT INTO estadistica.preguntas
         (encuesta_id, posicion, pregunta, valor_minimo, valor_maximo, tipo_codigo, valor_correcto, creado_por)
       VALUES ($1, 1, 'Valor de prueba', 0, 10, 'numerica', 2, $2) RETURNING id`,
      [survey.rows[0].id, user.rows[0].id],
    );
    const choiceSurvey = await client.query(
      `INSERT INTO estadistica.encuestas (usuario_creador_id, titulo, estado, modo_codigo)
       VALUES ($1, 'Prueba de selección', 'borrador', 'conocimiento') RETURNING id`,
      [user.rows[0].id],
    );
    const singleChoice = await client.query(
      `CALL estadistica.usp_agregar_pregunta(
         $1, $2, NULL, NULL, NULL, $3, $4, $5::jsonb, NULL, NULL
       )`,
      [
        choiceSurvey.rows[0].id,
        'Selecciona una alternativa',
        user.rows[0].id,
        'opcion_unica',
        JSON.stringify([
          { label: 'Alternativa A', is_correct: false },
          { label: 'Alternativa B', is_correct: true },
          { label: 'Alternativa C', is_correct: false },
        ]),
      ],
    );
    const multipleChoice = await client.query(
      `CALL estadistica.usp_agregar_pregunta(
         $1, $2, NULL, NULL, NULL, $3, $4, $5::jsonb, NULL, NULL
       )`,
      [
        choiceSurvey.rows[0].id,
        'Selecciona todas las alternativas aplicables',
        user.rows[0].id,
        'opcion_multiple',
        JSON.stringify([
          { label: 'Alternativa A', is_correct: true },
          { label: 'Alternativa B', is_correct: false },
          { label: 'Alternativa C', is_correct: true },
        ]),
      ],
    );
    const singleOptions = await client.query(
      `SELECT id, etiqueta FROM estadistica.opciones_pregunta
       WHERE pregunta_id = $1 ORDER BY posicion`,
      [singleChoice.rows[0].p_id],
    );
    const multipleOptions = await client.query(
      `SELECT id, etiqueta FROM estadistica.opciones_pregunta
       WHERE pregunta_id = $1 ORDER BY posicion`,
      [multipleChoice.rows[0].p_id],
    );
    const questionDefinition = await client.query(
      'SELECT * FROM estadistica.fn_preguntas_encuesta($1) WHERE id = $2',
      [choiceSurvey.rows[0].id, multipleChoice.rows[0].p_id],
    );
    const keyedQuestionDefinition = await client.query(
      'SELECT * FROM estadistica.fn_preguntas_encuesta_admin($1) WHERE id = $2',
      [choiceSurvey.rows[0].id, multipleChoice.rows[0].p_id],
    );
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    assert.equal(questionDefinition.rows[0].question_type, 'opcion_multiple');
    assert.deepEqual(
      questionDefinition.rows[0].options.map((option) => option.label),
      ['Alternativa A', 'Alternativa B', 'Alternativa C'],
    );
    assert.equal(Object.hasOwn(questionDefinition.rows[0], 'correct_value'), false);
    assert.ok(questionDefinition.rows[0].options.every((option) => !Object.hasOwn(option, 'is_correct')));
    assert.deepEqual(
      keyedQuestionDefinition.rows[0].options.map((option) => option.is_correct),
      [true, false, true],
    );
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    const activatedChoiceSurvey = await client.query(
      'CALL estadistica.usp_activar_encuesta($1, $2, NULL)',
      [choiceSurvey.rows[0].id, user.rows[0].id],
    );
    assert.equal(activatedChoiceSurvey.rows[0].p_ok, true);

    const groupName = `prueba_${suffix.replaceAll('-', '')}`;
    const createdGroup = await client.query(
      'CALL estadistica.usp_crear_grupo($1, $2, $3, $4, $5, NULL, NULL)',
      [groupName, 'Grupo de prueba', '📊', 1, user.rows[0].id],
    );
    const groupId = createdGroup.rows[0].p_id;
    assert.ok(groupId);
    await client.query(
      'UPDATE estadistica.encuestas SET grupo = $1 WHERE id = $2',
      [groupName, survey.rows[0].id],
    );
    const createdGroupAudit = await client.query(
      `SELECT usuario_id FROM estadistica.auditoria_general
       WHERE tabla = 'grupos' AND registro_id = $1 AND operacion = 'INSERT'`,
      [groupId],
    );
    assert.equal(createdGroupAudit.rows[0].usuario_id, user.rows[0].id);

    const updatedGroup = await client.query(
      'CALL estadistica.usp_actualizar_grupo($1, $2, $3, $4, $5, $6, NULL, NULL)',
      [groupId, 'Grupo actualizado', '📊', 2, true, user.rows[0].id],
    );
    assert.equal(updatedGroup.rows[0].p_ok, true);
    const updatedGroupAudit = await client.query(
      `SELECT usuario_id FROM estadistica.auditoria_general
       WHERE tabla = 'grupos' AND registro_id = $1 AND operacion = 'UPDATE'`,
      [groupId],
    );
    assert.equal(updatedGroupAudit.rows[0].usuario_id, user.rows[0].id);

    const blockedDelete = await client.query(
      'CALL estadistica.usp_eliminar_grupo($1, $2, NULL, NULL)',
      [groupId, user.rows[0].id],
    );
    assert.equal(blockedDelete.rows[0].p_ok, false);
    assert.equal(
      blockedDelete.rows[0].p_error,
      'No se puede eliminar: el grupo tiene encuestas activas.',
    );

    const removableGroup = await client.query(
      'CALL estadistica.usp_crear_grupo($1, $2, $3, $4, $5, NULL, NULL)',
      [`eliminar_${suffix.replaceAll('-', '')}`, 'Grupo eliminable', '📊', 2, user.rows[0].id],
    );
    const deletedGroup = await client.query(
      'CALL estadistica.usp_eliminar_grupo($1, $2, NULL, NULL)',
      [removableGroup.rows[0].p_id, user.rows[0].id],
    );
    assert.equal(deletedGroup.rows[0].p_ok, true);
    const deletedGroupAudit = await client.query(
      `SELECT usuario_id FROM estadistica.auditoria_general
       WHERE tabla = 'grupos' AND registro_id = $1 AND operacion = 'DELETE'`,
      [removableGroup.rows[0].p_id],
    );
    assert.equal(deletedGroupAudit.rows[0].usuario_id, user.rows[0].id);

    for (const group of ['participantes', 'jurados', 'expositores']) {
      const invitationHash = randomUUID().replaceAll('-', '');
      await client.query(
        'CALL estadistica.usp_insertar_codigo_encuesta($1, $2, $3, $4)',
        [survey.rows[0].id, user.rows[0].id, group, invitationHash],
      );
      const invitation = await client.query(
        'SELECT grupo_encuestado::text AS grupo FROM estadistica.codigos_encuesta WHERE hash_token = $1',
        [invitationHash],
      );
      assert.equal(invitation.rows[0].grupo, group);
    }

    let correctTokenHash;
    let duplicateTokenHash;
    for (const value of [2, 2, 4]) {
      const tokenHash = randomUUID().replaceAll('-', '');
      const code = await client.query(
        `INSERT INTO estadistica.codigos_encuesta
           (encuesta_id, usuario_emisor_id, grupo_encuestado, hash_token)
         VALUES ($1, $2, 'participantes', $3) RETURNING id`,
        [survey.rows[0].id, user.rows[0].id, tokenHash],
      );
      await client.query('CALL estadistica.sp_registrar_respuesta($1, $2::jsonb, $3)', [
        tokenHash,
        JSON.stringify([{ pregunta_id: question.rows[0].id, valor: value }]),
        null,
      ]);
      if (value === 2 && !correctTokenHash) correctTokenHash = tokenHash;
      if (value === 4) duplicateTokenHash = tokenHash;
      assert.ok(code.rows[0].id);
    }

    const correctNumericGrade = await client.query(
      'SELECT * FROM estadistica.fn_calificar_respuesta($1)',
      [correctTokenHash],
    );
    assert.equal(Number(correctNumericGrade.rows[0].puntuacion_porcentual), 100);
    assert.equal(correctNumericGrade.rows[0].resultados[0].scorePercent, 100);
    assert.equal(correctNumericGrade.rows[0].resultados[0].correctAnswer, 2);
    const incorrectNumericGrade = await client.query(
      'SELECT * FROM estadistica.fn_calificar_respuesta($1)',
      [duplicateTokenHash],
    );
    assert.equal(Number(incorrectNumericGrade.rows[0].puntuacion_porcentual), 0);

    const ungradedSurvey = await client.query(
      `INSERT INTO estadistica.encuestas (usuario_creador_id, titulo, estado, modo_codigo)
       VALUES ($1, 'Prueba antigua sin clave', 'activa', 'conocimiento') RETURNING id`,
      [user.rows[0].id],
    );
    const ungradedQuestion = await client.query(
      `INSERT INTO estadistica.preguntas
         (encuesta_id, posicion, pregunta, tipo_codigo, creado_por)
       VALUES ($1, 1, 'Pregunta sin clave', 'numerica', $2) RETURNING id`,
      [ungradedSurvey.rows[0].id, user.rows[0].id],
    );
    const ungradedTokenHash = randomUUID().replaceAll('-', '');
    await client.query(
      `INSERT INTO estadistica.codigos_encuesta
         (encuesta_id, usuario_emisor_id, grupo_encuestado, hash_token)
       VALUES ($1, $2, 'participantes', $3)`,
      [ungradedSurvey.rows[0].id, user.rows[0].id, ungradedTokenHash],
    );
    await client.query('CALL estadistica.sp_registrar_respuesta($1, $2::jsonb, $3)', [
      ungradedTokenHash,
      JSON.stringify([{ pregunta_id: ungradedQuestion.rows[0].id, valor: 6 }]),
      null,
    ]);
    const ungradedResult = await client.query(
      'SELECT * FROM estadistica.fn_calificar_respuesta($1)',
      [ungradedTokenHash],
    );
    assert.equal(ungradedResult.rows[0].puntuacion_porcentual, null);
    assert.equal(Number(ungradedResult.rows[0].preguntas_calificadas), 0);
    assert.equal(ungradedResult.rows[0].resultados[0].scorePercent, null);
    assert.equal(ungradedResult.rows[0].resultados[0].correctAnswer, null);

    await client.query('SAVEPOINT duplicate_response');
    await assert.rejects(
      client.query('CALL estadistica.sp_registrar_respuesta($1, $2::jsonb, $3)', [
        duplicateTokenHash,
        JSON.stringify([{ pregunta_id: question.rows[0].id, valor: 8 }]),
        null,
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

    await client.query('SAVEPOINT two_argument_response');
    await assert.rejects(
      client.query(
        'CALL estadistica.sp_registrar_respuesta($1, $2::jsonb)',
        [randomUUID(), '[]'],
      ),
      (error) => error.code === 'P0001'
        && error.message === 'codigo_invalido_o_usado',
    );
    await client.query('ROLLBACK TO SAVEPOINT two_argument_response');

    const choiceTokenHash = randomUUID().replaceAll('-', '');
    await client.query(
      `INSERT INTO estadistica.codigos_encuesta
         (encuesta_id, usuario_emisor_id, grupo_encuestado, hash_token)
       VALUES ($1, $2, 'participantes', $3)`,
      [choiceSurvey.rows[0].id, user.rows[0].id, choiceTokenHash],
    );
    await client.query('CALL estadistica.sp_registrar_respuesta($1, $2::jsonb, $3)', [
      choiceTokenHash,
      JSON.stringify([
        {
          pregunta_id: singleChoice.rows[0].p_id,
          valor: null,
          opciones: [singleOptions.rows[1].id],
        },
        {
          pregunta_id: multipleChoice.rows[0].p_id,
          valor: null,
          opciones: [multipleOptions.rows[0].id, multipleOptions.rows[1].id],
        },
      ]),
      null,
    ]);
    const choiceGrade = await client.query(
      'SELECT * FROM estadistica.fn_calificar_respuesta($1)',
      [choiceTokenHash],
    );
    assert.equal(Number(choiceGrade.rows[0].puntuacion_porcentual), 75);
    assert.equal(Number(choiceGrade.rows[0].preguntas_calificadas), 2);
    assert.deepEqual(
      choiceGrade.rows[0].resultados.map((result) => result.scorePercent),
      [100, 50],
    );
    assert.deepEqual(choiceGrade.rows[0].resultados[1].correctAnswer, ['Alternativa A', 'Alternativa C']);
    const choiceFrequencies = await client.query(
      'SELECT value, frequency, universe FROM estadistica.fn_frecuencias_opciones_pregunta($1)',
      [singleChoice.rows[0].p_id],
    );
    assert.deepEqual(
      choiceFrequencies.rows.map((row) => [row.value, Number(row.frequency), Number(row.universe)]),
      [['Alternativa A', 0, 1], ['Alternativa B', 1, 1], ['Alternativa C', 0, 1]],
    );
    const multipleFrequencies = await client.query(
      'SELECT value, frequency, universe FROM estadistica.fn_frecuencias_opciones_pregunta($1)',
      [multipleChoice.rows[0].p_id],
    );
    assert.deepEqual(
      multipleFrequencies.rows.map((row) => [row.value, Number(row.frequency), Number(row.universe)]),
      [['Alternativa A', 1, 1], ['Alternativa B', 1, 1], ['Alternativa C', 0, 1]],
    );

    const modes = await client.query(
      `SELECT codigo, requiere_clave_correcta, califica_respuestas
       FROM estadistica.modos_encuesta ORDER BY orden`,
    );
    assert.deepEqual(
      modes.rows.map((mode) => [mode.codigo, mode.requiere_clave_correcta, mode.califica_respuestas]),
      [['opinion', false, false], ['conocimiento', true, true]],
    );
    const opinionSurvey = await client.query(
      `CALL estadistica.usp_crear_encuesta($1, $2, $3, $4, NULL, NULL)`,
      ['Encuesta de opinión', '', 'opinion', user.rows[0].id],
    );
    const opinionSurveyId = opinionSurvey.rows[0].p_id;
    const opinionNumeric = await client.query(
      `CALL estadistica.usp_agregar_pregunta(
         $1, $2, NULL, NULL, NULL, $3, $4, $5::jsonb, NULL, NULL
       )`,
      [opinionSurveyId, 'Horas según el participante', user.rows[0].id, 'numerica', '[]'],
    );
    const opinionChoice = await client.query(
      `CALL estadistica.usp_agregar_pregunta(
         $1, $2, NULL, NULL, NULL, $3, $4, $5::jsonb, NULL, NULL
       )`,
      [
        opinionSurveyId,
        'Preferencia del participante',
        user.rows[0].id,
        'opcion_unica',
        JSON.stringify([
          { label: 'Opción A', is_correct: false },
          { label: 'Opción B', is_correct: false },
        ]),
      ],
    );
    const opinionOptions = await client.query(
      `SELECT id, es_correcta FROM estadistica.opciones_pregunta
       WHERE pregunta_id = $1 ORDER BY posicion`,
      [opinionChoice.rows[0].p_id],
    );
    assert.ok(opinionOptions.rows.every((option) => !option.es_correcta));
    await client.query('SAVEPOINT opinion_key_rejected');
    await assert.rejects(
      client.query(
        `CALL estadistica.usp_agregar_pregunta(
           $1, $2, NULL, NULL, 4, $3, $4, '[]'::jsonb, NULL, NULL
         )`,
        [opinionSurveyId, 'No debe llevar clave', user.rows[0].id, 'numerica'],
      ),
      (error) => error.code === 'P0001'
        && error.message === 'encuesta_de_opinion_no_admite_claves',
    );
    await client.query('ROLLBACK TO SAVEPOINT opinion_key_rejected');
    const opinionActivation = await client.query(
      'CALL estadistica.usp_activar_encuesta($1, $2, NULL)',
      [opinionSurveyId, user.rows[0].id],
    );
    assert.equal(opinionActivation.rows[0].p_ok, true);
    const opinionTokenHash = randomUUID().replaceAll('-', '');
    await client.query(
      `INSERT INTO estadistica.codigos_encuesta
         (encuesta_id, usuario_emisor_id, grupo_encuestado, hash_token)
       VALUES ($1, $2, 'participantes', $3)`,
      [opinionSurveyId, user.rows[0].id, opinionTokenHash],
    );
    await client.query('CALL estadistica.sp_registrar_respuesta($1, $2::jsonb, $3)', [
      opinionTokenHash,
      JSON.stringify([
        { pregunta_id: opinionNumeric.rows[0].p_id, valor: 6 },
        { pregunta_id: opinionChoice.rows[0].p_id, valor: null, opciones: [opinionOptions.rows[1].id] },
      ]),
      null,
    ]);
    const opinionResult = await client.query(
      'SELECT * FROM estadistica.fn_calificar_respuesta($1)',
      [opinionTokenHash],
    );
    assert.equal(opinionResult.rows[0].mostrar_resultado, false);
    assert.equal(opinionResult.rows[0].revelar_respuestas_correctas, false);
    assert.equal(opinionResult.rows[0].puntuacion_porcentual, null);
    assert.deepEqual(opinionResult.rows[0].resultados, []);

    const legacyDraft = await client.query(
      `INSERT INTO estadistica.encuestas (usuario_creador_id, titulo)
       VALUES ($1, 'Borrador anterior') RETURNING id`,
      [user.rows[0].id],
    );
    const legacyQuestion = await client.query(
      `INSERT INTO estadistica.preguntas
         (encuesta_id, posicion, pregunta, tipo_codigo, creado_por)
       VALUES ($1, 1, 'Pregunta anterior', 'numerica', $2) RETURNING id`,
      [legacyDraft.rows[0].id, user.rows[0].id],
    );
    await client.query(
      'CALL estadistica.usp_definir_modo_encuesta($1, $2, $3)',
      [legacyDraft.rows[0].id, 'conocimiento', user.rows[0].id],
    );
    await client.query(
      'CALL estadistica.usp_definir_clave_pregunta($1, $2, $3, $4::jsonb, $5)',
      [legacyDraft.rows[0].id, legacyQuestion.rows[0].id, 3, '[]', user.rows[0].id],
    );
    const legacyActivated = await client.query(
      'CALL estadistica.usp_activar_encuesta($1, $2, NULL)',
      [legacyDraft.rows[0].id, user.rows[0].id],
    );
    assert.equal(legacyActivated.rows[0].p_ok, true);

    const invalidChoiceTokenHash = randomUUID().replaceAll('-', '');
    await client.query(
      `INSERT INTO estadistica.codigos_encuesta
         (encuesta_id, usuario_emisor_id, grupo_encuestado, hash_token)
       VALUES ($1, $2, 'participantes', $3)`,
      [choiceSurvey.rows[0].id, user.rows[0].id, invalidChoiceTokenHash],
    );
    await client.query('SAVEPOINT invalid_single_choice');
    await assert.rejects(
      client.query('CALL estadistica.sp_registrar_respuesta($1, $2::jsonb, $3)', [
        invalidChoiceTokenHash,
        JSON.stringify([
          {
            pregunta_id: singleChoice.rows[0].p_id,
            valor: null,
            opciones: [singleOptions.rows[0].id, singleOptions.rows[1].id],
          },
          {
            pregunta_id: multipleChoice.rows[0].p_id,
            valor: null,
            opciones: [multipleOptions.rows[0].id],
          },
        ]),
        null,
      ]),
      (error) => error.code === 'P0001'
        && error.message === 'respuestas_incompatibles_con_tipo_pregunta',
    );
    await client.query('ROLLBACK TO SAVEPOINT invalid_single_choice');
    await client.query('SAVEPOINT foreign_question_option');
    await assert.rejects(
      client.query('CALL estadistica.sp_registrar_respuesta($1, $2::jsonb, $3)', [
        invalidChoiceTokenHash,
        JSON.stringify([
          {
            pregunta_id: singleChoice.rows[0].p_id,
            valor: null,
            opciones: [singleOptions.rows[0].id],
          },
          {
            pregunta_id: multipleChoice.rows[0].p_id,
            valor: null,
            opciones: [singleOptions.rows[1].id],
          },
        ]),
        null,
      ]),
      (error) => error.code === 'P0001'
        && error.message === 'alternativa_no_pertenece_a_pregunta',
    );
    await client.query('ROLLBACK TO SAVEPOINT foreign_question_option');

    const outOfRangeToken = randomUUID().replaceAll('-', '');
    await client.query(
      `INSERT INTO estadistica.codigos_encuesta
         (encuesta_id, usuario_emisor_id, grupo_encuestado, hash_token)
       VALUES ($1, $2, 'participantes', $3)`,
      [survey.rows[0].id, user.rows[0].id, outOfRangeToken],
    );
    await client.query('SAVEPOINT out_of_range_response');
    await assert.rejects(
      client.query('CALL estadistica.sp_registrar_respuesta($1, $2::jsonb, $3)', [
        outOfRangeToken,
        JSON.stringify([{ pregunta_id: question.rows[0].id, valor: 11 }]),
        null,
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

    const study = await client.query(
      `INSERT INTO estadistica.estudios (titulo, turno, estado, creado_por)
       VALUES ('Estudio de prueba', 'mañana', 'borrador', $1) RETURNING id`,
      [user.rows[0].id],
    );
    const studyInsertAudit = await client.query(
      `SELECT usuario_id FROM estadistica.auditoria_general
       WHERE tabla = 'estudios' AND registro_id = $1 AND operacion = 'INSERT'`,
      [study.rows[0].id],
    );
    assert.equal(studyInsertAudit.rows[0].usuario_id, user.rows[0].id);
    const generatedStudy = await client.query(
      `CALL estadistica.usp_crear_estudio($1, $2, $3, $4, $5, $6, $7, NULL)`,
      ['Feria con enfoque', '', 'mañana', null, user.rows[0].id, [groupName], 'opinion'],
    );
    const generatedSurveyModes = await client.query(
      'SELECT modo_codigo FROM estadistica.encuestas WHERE estudio_id = $1',
      [generatedStudy.rows[0].p_estudio_id],
    );
    assert.deepEqual(generatedSurveyModes.rows.map((row) => row.modo_codigo), ['opinion']);
    await client.query('DELETE FROM estadistica.estudios WHERE id = $1', [generatedStudy.rows[0].p_estudio_id]);
    await client.query("SELECT set_config('app.usuario_id', '', true)");
    await client.query('DELETE FROM estadistica.estudios WHERE id = $1', [study.rows[0].id]);
    const studyDeleteAudit = await client.query(
      `SELECT usuario_id FROM estadistica.auditoria_general
       WHERE tabla = 'estudios' AND registro_id = $1 AND operacion = 'DELETE'`,
      [study.rows[0].id],
    );
    assert.equal(studyDeleteAudit.rows[0].usuario_id, user.rows[0].id);

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
