import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import pg from 'pg';
import { Server } from 'socket.io';
import { z, ZodError } from 'zod';

const { Pool } = pg;
const requiredEnvironment = ['DATABASE_URL', 'JWT_SECRET', 'CLIENT_ORIGIN', 'PUBLIC_APP_URL'];
for (const name of requiredEnvironment) {
  if (!process.env[name])   throw new Error(`Debe configurar la variable ${name}.`);
}
if (process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_ORIGIN } });
const port = Number(process.env.PORT ?? 3000);
const roles = ['superuser', 'admin', 'user', 'encuestador'];
const databaseRoles = {
  superuser: 'superusuario',
  admin: 'administrador',
  user: 'usuario',
  encuestador: 'encuestador',
};

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN }));
app.use(express.json({ limit: '100kb' }));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function validate(schema, input) {
  return schema.parse(input);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signUser(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '8h' },
  );
}

function authenticate(req, res, next) {
  const authorization = req.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Se requiere iniciar sesión.' });
  }
  try {
    req.user = jwt.verify(authorization.slice(7), process.env.JWT_SECRET);
    if (!roles.includes(req.user.role)) return res.status(401).json({ error: 'El token de acceso no es válido.' });
    return next();
  } catch {
    return res.status(401).json({ error: 'El token de acceso es inválido o venció.' });
  }
}

function allowRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permisos para esta operación.' });
    }
    return next();
  };
}

async function findSurveyForUser(surveyId, user) {
  const result = await pool.query(
    'SELECT * FROM estadistica.fn_encuesta_por_id($1)',
    [surveyId],
  );
  const survey = result.rows[0];
  if (!survey) return { error: 'No se encontró la encuesta.', status: 404 };
  if (!['admin', 'superuser'].includes(user.role) && survey.creator_id !== user.sub) {
    if (user.role === 'encuestador') {
      const assigned = await pool.query(
        'SELECT estadistica.fn_encuestador_asignado($1, $2) AS asignado',
        [user.sub, surveyId],
      );
      if (!assigned.rows[0]?.asignado) {
        return { error: 'No tienes permisos para esta operación.', status: 403 };
      }
    } else {
      return { error: 'No tienes permisos para esta operación.', status: 403 };
    }
  }
  const modeResult = await pool.query(
    'SELECT * FROM estadistica.fn_modo_de_encuesta($1)',
    [survey.id],
  );
  if (!modeResult.rows[0]) throw new Error('No se pudo recuperar el modo de la encuesta.');
  return { survey: { ...survey, ...modeResult.rows[0] } };
}

async function buildReport(survey) {
  const summary = await pool.query(
    `SELECT encuesta_id AS survey_id, cantidad_respuestas AS response_count,
            cantidad_participantes AS participants_count, cantidad_jurados AS judges_count,
            cantidad_expositores AS exhibitors_count, ultima_respuesta_en AS last_response_at
     FROM estadistica.vista_resumen_respuestas WHERE encuesta_id = $1`,
    [survey.id],
  );
  const questions = await pool.query(
    'SELECT * FROM estadistica.fn_preguntas_encuesta($1)',
    [survey.id],
  );
  const toNullableNumber = (value) =>
    value === null || value === undefined ? null : Number(value);
  const statistics = [];
  for (const question of questions.rows) {
    const statsQuery = question.is_numeric
      ? pool.query(
        `SELECT universo AS universe, media AS mean, mediana AS median, moda AS mode,
                rango AS value_range, maximo AS maximum, minimo AS minimum,
                coeficiente_variacion AS coefficient_of_variation, varianza AS variance,
                desviacion_estandar AS standard_deviation
         FROM estadistica.fn_estadisticas_pregunta_numerica($1)`,
        [question.id],
      )
      : null;
    const frequenciesQuery = pool.query(
      question.is_numeric
        ? 'SELECT value::text, frequency FROM estadistica.fn_frecuencias_pregunta($1)'
        : 'SELECT value, frequency, universe FROM estadistica.fn_frecuencias_opciones_pregunta($1)',
      [question.id],
    );
    const [statsResult, frequencies] = await Promise.all([
      statsQuery,
      frequenciesQuery,
    ]);
    const numericStats = statsResult?.rows[0] ?? null;
    const categoricalUniverse = frequencies.rows[0]?.universe;
    statistics.push({
      questionId: question.id,
      prompt: question.prompt,
      questionTypeLabel: question.question_type_label,
      isNumeric: question.is_numeric,
      universe: Number(numericStats?.universe ?? categoricalUniverse ?? 0),
      mean: toNullableNumber(numericStats?.mean),
      median: toNullableNumber(numericStats?.median),
      mode: toNullableNumber(numericStats?.mode),
      value_range: toNullableNumber(numericStats?.value_range),
      maximum: toNullableNumber(numericStats?.maximum),
      minimum: toNullableNumber(numericStats?.minimum),
      coefficient_of_variation: toNullableNumber(numericStats?.coefficient_of_variation),
      variance: toNullableNumber(numericStats?.variance),
      standard_deviation: toNullableNumber(numericStats?.standard_deviation),
      frequencies: frequencies.rows.map((row) => ({
        value: question.is_numeric ? String(Number(row.value)) : String(row.value),
        frequency: Number(row.frequency),
      })),
    });
  }
  const counts = Object.fromEntries(
    ['response_count', 'participants_count', 'judges_count', 'exhibitors_count']
      .map((key) => [key, Number(summary.rows[0]?.[key] ?? 0)]),
  );
  return { survey, summary: counts, questions: statistics };
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const input = validate(z.object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(200),
  }), req.body);
  const result = await pool.query(
    'SELECT * FROM estadistica.fn_autenticar_usuario($1)',
    [input.email],
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }
  const { password_hash: _passwordHash, ...safeUser } = user;
  return res.json({ token: signUser(user), user: safeUser });
}));

app.get('/api/me', authenticate, asyncRoute(async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM estadistica.vw_usuarios WHERE id = $1',
    [req.user.sub],
  );
  if (!result.rows[0]) return res.status(401).json({ error: 'La cuenta ya no existe.' });
  return res.json(result.rows[0]);
}));

app.get('/api/users', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM estadistica.fn_listar_usuarios($1::boolean, FALSE)',
    [req.user.role === 'superuser'],
  );
  return res.json(result.rows);
}));

app.post('/api/users', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const input = validate(z.object({
    email: z.string().email().max(254),
    displayName: z.string().trim().min(1).max(120),
    password: z.string().min(12).max(200),
    role: z.enum(['superuser', 'admin', 'user', 'encuestador']),
  }), req.body);
  if (req.user.role !== 'superuser' && !['user', 'encuestador'].includes(input.role)) {
    return res.status(403).json({ error: 'Los administradores solo pueden crear usuarios regulares o encuestadores.' });
  }
  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    const callResult = await pool.query(
      'CALL estadistica.usp_crear_usuario($1, $2, $3, $4::estadistica.rol_usuario, $5, NULL, NULL, NULL, NULL, NULL)',
      [input.email, passwordHash, input.displayName, databaseRoles[input.role], req.user.sub],
    );
    const r = callResult.rows[0];
    return res.status(201).json({ id: r.p_id, email: r.p_email, display_name: r.p_display_name, role: r.p_role, created_at: r.p_created_at });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    throw error;
  }
}));

app.put('/api/users/:userId', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const input = validate(z.object({
    displayName: z.string().trim().min(1).max(120),
    role: z.enum(['superuser', 'admin', 'user', 'encuestador']),
    password: z.string().min(12).max(200).optional(),
  }), req.body);
  if (req.user.role !== 'superuser' && !['user', 'encuestador'].includes(input.role)) {
    return res.status(403).json({ error: 'Los administradores solo pueden asignar roles de usuario o encuestador.' });
  }
  const target = await pool.query(
    'SELECT id, rol FROM estadistica.usuarios WHERE id = $1',
    [req.params.userId],
  );
  if (!target.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
  if (req.user.role !== 'superuser' && target.rows[0].rol === 'superusuario') {
    return res.status(403).json({ error: 'No puedes modificar a un superusuario.' });
  }
  const fields = [
    'nombre_visible = $1',
    'rol = $2::estadistica.rol_usuario',
    'actualizado_por = $3',
  ];
  const params = [input.displayName, databaseRoles[input.role], req.user.sub];
  if (input.password) {
    fields.push(`hash_contrasena = $${params.length + 1}`);
    params.push(await bcrypt.hash(input.password, 12));
  }
  params.push(req.params.userId);
  await pool.query(
    `UPDATE estadistica.usuarios SET ${fields.join(', ')} WHERE id = $${params.length}`,
    params,
  );
  const updated = await pool.query('SELECT * FROM estadistica.vw_usuarios WHERE id = $1', [req.params.userId]);
  return res.json(updated.rows[0]);
}));

app.get('/api/surveys', authenticate, asyncRoute(async (req, res) => {
  const groupId = req.query.groupId
    ? validate(z.string().uuid(), req.query.groupId)
    : null;
  if (groupId) {
    const group = await pool.query(
      'SELECT id FROM estadistica.vw_grupos_activos WHERE id = $1',
      [groupId],
    );
    if (!group.rows[0]) return res.status(404).json({ error: 'No se encontró el grupo activo.' });
  }
  // IDs de encuestas que pertenecen a ferias activas
  const activaIds = await pool.query(
    `SELECT es.id FROM estadistica.encuestas es
     JOIN estadistica.estudios et ON et.id = es.estudio_id
     WHERE et.estado = 'activo'`,
  );
  const activaSet = new Set(activaIds.rows.map((r) => r.id));

  if (req.user.role === 'encuestador') {
    const result = await pool.query(
      'SELECT * FROM estadistica.fn_encuestas_asignadas_encuestador($1, $2)',
      [req.user.sub, groupId],
    );
    return res.json(
      result.rows
        .filter((r) => activaSet.has(r.id))
        .map((r) => ({
          id: r.id,
          title: r.titulo,
          description: r.descripcion,
          status: r.estado === 'activa' ? 'active'
                : r.estado === 'pausada' ? 'paused'
                : r.estado === 'cerrada' ? 'closed'
                : 'draft',
          created_at: r.creado_en,
        })),
    );
  }
  const result = await pool.query(
    'SELECT * FROM estadistica.fn_encuestas_usuario_por_grupo($1, $2, $3)',
    [req.user.sub, ['admin', 'superuser'].includes(req.user.role), groupId],
  );
  return res.json(result.rows.filter((r) => activaSet.has(r.id)));
}));

app.patch('/api/users/:userId/activo', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const input = validate(z.object({ activo: z.boolean() }), req.body);
  const target = await pool.query(
    'SELECT id, rol FROM estadistica.usuarios WHERE id = $1',
    [req.params.userId],
  );
  if (!target.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
  if (req.user.role !== 'superuser' && target.rows[0].rol === 'superusuario') {
    return res.status(403).json({ error: 'No puedes modificar a un superusuario.' });
  }
  if (req.user.sub === req.params.userId) {
    return res.status(400).json({ error: 'No puedes darte de baja a ti mismo.' });
  }
  await pool.query(
    'UPDATE estadistica.usuarios SET activo = $1, actualizado_por = $2 WHERE id = $3',
    [input.activo, req.user.sub, req.params.userId],
  );
  const updated = await pool.query('SELECT * FROM estadistica.vw_usuarios WHERE id = $1', [req.params.userId]);
  return res.json(updated.rows[0]);
}));

app.get('/api/respondent-groups', authenticate, asyncRoute(async (_req, res) => {
  const result = await pool.query('SELECT * FROM estadistica.fn_grupos_encuestados()');
  return res.json(result.rows);
}));

app.get('/api/respondent-groups/con-encuesta-activa', authenticate, asyncRoute(async (_req, res) => {
  // Solo tipos de encuestado que tienen encuesta en feria activa
  const result = await pool.query(
    `SELECT value, label FROM estadistica.fn_grupos_encuestados_con_encuesta_activa()`,
  );
  return res.json(result.rows);
}));

app.get('/api/survey-modes', authenticate, asyncRoute(async (_req, res) => {
  const result = await pool.query('SELECT * FROM estadistica.fn_modos_activos()');
  return res.json(result.rows);
}));

app.post('/api/surveys', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const input = validate(z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).default(''),
    modeCode: z.string().trim().min(1),
  }), req.body);
  let callResult;
  try {
    callResult = await pool.query(
      'CALL estadistica.usp_crear_encuesta($1, $2, $3, $4, NULL, NULL)',
      [input.title, input.description, input.modeCode, req.user.sub],
    );
  } catch (error) {
    if (error.code === 'P0001') return res.status(400).json({ error: error.message.replaceAll('_', ' ') });
    throw error;
  }
  const modeResult = await pool.query(
    'SELECT * FROM estadistica.fn_modo_por_codigo($1)', [input.modeCode],
  );
  return res.status(201).json({
    id: callResult.rows[0].p_id,
    title: input.title,
    description: input.description,
    status: 'draft',
    created_at: callResult.rows[0].p_created_at,
    ...modeResult.rows[0],
  });
}));

app.get('/api/surveys/:surveyId', authenticate, asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  const questions = await pool.query(
    'SELECT * FROM estadistica.fn_preguntas_encuesta_admin($1)',
    [survey.id],
  );
  return res.json({ ...survey, questions: questions.rows });
}));

app.get('/api/question-types', authenticate, asyncRoute(async (_req, res) => {
  const result = await pool.query('SELECT * FROM estadistica.fn_tipos_pregunta_activos()');
  return res.json(result.rows);
}));

app.put('/api/surveys/:surveyId/mode', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  if (survey.status !== 'draft') return res.status(409).json({ error: 'Solo se puede definir el enfoque de un borrador.' });
  const input = validate(z.object({ modeCode: z.string().trim().min(1) }), req.body);
  try {
    await pool.query(
      'CALL estadistica.usp_definir_modo_encuesta($1, $2, $3)',
      [survey.id, input.modeCode, req.user.sub],
    );
  } catch (error) {
    if (error.code === 'P0001') return res.status(400).json({ error: error.message.replaceAll('_', ' ') });
    throw error;
  }
  const result = await pool.query(
    'SELECT * FROM estadistica.fn_modo_por_codigo($1)', [input.modeCode],
  );
  if (!result.rows[0]) throw new Error('No se pudo recuperar el modo recién definido.');
  return res.json(result.rows[0]);
}));

app.post('/api/surveys/:surveyId/questions', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  if (!['draft', 'paused'].includes(survey.status)) return res.status(409).json({ error: 'No se pueden cambiar preguntas después de activar la encuesta.' });
  if (!survey.mode_code) return res.status(409).json({ error: 'Define el enfoque de la encuesta antes de agregar preguntas.' });
  const input = validate(z.object({
    prompt: z.string().trim().min(1).max(1000),
    questionType: z.string().trim().min(1),
    options: z.array(z.object({
      label: z.string().trim().min(1).max(300),
      is_correct: z.boolean(),
    })).default([]),
    minValue: z.number().finite().nullable().default(null),
    maxValue: z.number().finite().nullable().default(null),
    correctValue: z.number().finite().nullable().default(null),
  }).refine((value) =>
    (value.minValue === null || value.maxValue === null || value.minValue <= value.maxValue)
      && (value.minValue === null || value.correctValue === null || value.correctValue >= value.minValue)
      && (value.maxValue === null || value.correctValue === null || value.correctValue <= value.maxValue),
  ), req.body);
  let callResult;
  try {
    callResult = await pool.query(
      'CALL estadistica.usp_agregar_pregunta($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NULL, NULL)',
      [
        survey.id,
        input.prompt,
        input.minValue,
        input.maxValue,
        input.correctValue,
        req.user.sub,
        input.questionType,
        JSON.stringify(input.options),
      ],
    );
  } catch (error) {
    if (error.code === 'P0001') return res.status(400).json({ error: error.message.replaceAll('_', ' ') });
    throw error;
  }
  const question = await pool.query(
    'SELECT * FROM estadistica.fn_preguntas_encuesta_admin($1) WHERE id = $2',
    [survey.id, callResult.rows[0].p_id],
  );
  return res.status(201).json(question.rows[0]);
}));

app.put('/api/surveys/:surveyId/questions/:questionId/answer-key', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  if (survey.status !== 'draft' || !survey.requires_correct_answer) {
    return res.status(409).json({ error: 'Solo una prueba de conocimiento en borrador admite claves de respuesta.' });
  }
  const input = validate(z.object({
    correctValue: z.number().finite().nullable().default(null),
    optionIds: z.array(z.string().uuid()).default([]),
  }), req.body);
  try {
    await pool.query(
      'CALL estadistica.usp_definir_clave_pregunta($1, $2, $3, $4::jsonb, $5)',
      [survey.id, req.params.questionId, input.correctValue, JSON.stringify(input.optionIds), req.user.sub],
    );
  } catch (error) {
    if (error.code === 'P0001') return res.status(400).json({ error: error.message.replaceAll('_', ' ') });
    throw error;
  }
  const question = await pool.query(
    'SELECT * FROM estadistica.fn_preguntas_encuesta_admin($1) WHERE id = $2',
    [survey.id, req.params.questionId],
  );
  if (!question.rows[0]) return res.status(404).json({ error: 'No se encontró la pregunta.' });
  return res.json(question.rows[0]);
}));

app.put('/api/surveys/:surveyId/questions/:questionId', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  if (!['draft', 'paused'].includes(survey.status)) return res.status(409).json({ error: 'No se pueden cambiar preguntas después de activar la encuesta.' });
  const input = validate(z.object({
    prompt: z.string().trim().min(1).max(1000),
    questionType: z.string().trim().min(1).nullable().default(null),
    options: z.array(z.object({
      label: z.string().trim().min(1).max(300),
      is_correct: z.boolean(),
    })).nullable().default(null),
    minValue: z.number().finite().nullable().default(null),
    maxValue: z.number().finite().nullable().default(null),
  }), req.body);
  try {
    await pool.query(
      'CALL estadistica.usp_editar_pregunta($1, $2, $3, $4, $5, $6, $7, $8::jsonb)',
      [
        survey.id,
        req.params.questionId,
        input.prompt,
        req.user.sub,
        input.questionType,
        input.minValue,
        input.maxValue,
        input.options !== null ? JSON.stringify(input.options) : null,
      ],
    );
  } catch (error) {
    if (error.code === 'P0001') return res.status(400).json({ error: error.message.replaceAll('_', ' ') });
    throw error;
  }
  const question = await pool.query(
    'SELECT * FROM estadistica.fn_preguntas_encuesta_admin($1) WHERE id = $2',
    [survey.id, req.params.questionId],
  );
  if (!question.rows[0]) return res.status(404).json({ error: 'No se encontró la pregunta.' });
  return res.json(question.rows[0]);
}));

app.delete('/api/surveys/:surveyId/questions/:questionId', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  if (!['draft', 'paused'].includes(survey.status)) return res.status(409).json({ error: 'No se pueden cambiar preguntas después de activar la encuesta.' });
  try {
    await pool.query(
      'CALL estadistica.usp_eliminar_pregunta($1, $2, $3)',
      [survey.id, req.params.questionId, req.user.sub],
    );
  } catch (error) {
    if (error.code === 'P0001') return res.status(400).json({ error: error.message.replaceAll('_', ' ') });
    throw error;
  }
  return res.status(204).send();
}));

app.post('/api/surveys/:surveyId/activate', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  if (survey.status !== 'draft') return res.status(409).json({ error: 'Solo se pueden activar encuestas en borrador.' });
  if (!survey.mode_code) return res.status(400).json({ error: 'Define el enfoque antes de activar la encuesta.' });
  const readiness = await pool.query(
    'SELECT * FROM estadistica.fn_verificar_activacion_encuesta($1)', [survey.id],
  );
  if (!Number(readiness.rows[0].question_count)) {
    return res.status(400).json({ error: 'Agrega al menos una pregunta antes de activar la encuesta.' });
  }
  if (survey.requires_correct_answer && Number(readiness.rows[0].missing_keys)) {
    return res.status(400).json({ error: 'Configura la respuesta correcta de cada pregunta antes de activar la prueba.' });
  }
  if (!survey.requires_correct_answer && Number(readiness.rows[0].configured_keys)) {
    return res.status(400).json({ error: 'Una encuesta de opinión no puede contener claves de respuesta.' });
  }
  const callResult = await pool.query(
    'CALL estadistica.usp_activar_encuesta($1, $2, NULL)',
    [survey.id, req.user.sub],
  );
  if (!callResult.rows[0].p_ok) return res.status(400).json({ error: 'Revisa el enfoque y las claves de respuesta antes de activar.' });
  return res.json({ id: survey.id, status: 'active' });
}));

app.post('/api/surveys/:surveyId/pause', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  if (survey.status !== 'active') return res.status(409).json({ error: 'Solo se pueden pausar encuestas activas.' });
  const summary = await pool.query(
    `SELECT COALESCE(cantidad_respuestas, 0) AS response_count
     FROM estadistica.vista_resumen_respuestas WHERE encuesta_id = $1`,
    [survey.id],
  );
  const responseCount = Number(summary.rows[0]?.response_count ?? 0);
  if (responseCount > 0) {
    return res.status(409).json({ error: 'No se puede pausar una encuesta que ya tiene respuestas.' });
  }
  try {
    await pool.query(
      'CALL estadistica.usp_pausar_encuesta($1, $2)',
      [survey.id, req.user.sub],
    );
  } catch (error) {
    if (error.code === 'P0001') return res.status(400).json({ error: error.message.replaceAll('_', ' ') });
    throw error;
  }
  return res.json({ id: survey.id, status: 'paused' });
}));

app.post('/api/surveys/:surveyId/reactivate', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  if (survey.status !== 'paused') return res.status(409).json({ error: 'Solo se pueden reactivar encuestas pausadas.' });
  try {
    await pool.query(
      'CALL estadistica.usp_reactivar_encuesta($1, $2)',
      [survey.id, req.user.sub],
    );
  } catch (error) {
    if (error.code === 'P0001') return res.status(400).json({ error: error.message.replaceAll('_', ' ') });
    throw error;
  }
  return res.json({ id: survey.id, status: 'active' });
}));

app.get('/api/surveys/:surveyId/cupos', authenticate, asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  const result = await pool.query(
    'SELECT * FROM estadistica.fn_cupos_encuesta($1)', [survey.id],
  );
  return res.json(result.rows.map((r) => ({
    grupoEncuestado: r.grupo_encuestado,
    cupo: Number(r.cupo),
    cupoCompletados: Number(r.cupo_completados),
    cupoDisponible: Number(r.cupo_disponible),
  })));
}));

app.put('/api/surveys/:surveyId/cupos/:grupo', authenticate, allowRoles('superuser'), asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  const grupo = req.params.grupo;
  const allowedGroup = await pool.query(
    'SELECT estadistica.fn_grupo_encuestado_activo($1) AS activo', [grupo],
  );
  if (!allowedGroup.rows[0]?.activo) return res.status(400).json({ error: 'El tipo de encuestado no existe.' });
  const input = validate(z.object({
    cupo: z.number().int().min(0).max(10000),
  }), req.body);
  await pool.query(
    'CALL estadistica.usp_set_cupo_encuesta($1, $2, $3, $4)',
    [survey.id, grupo, input.cupo, req.user.sub],
  );
  const result = await pool.query('SELECT * FROM estadistica.fn_cupos_encuesta($1)', [survey.id]);
  return res.json(result.rows.map((r) => ({
    grupoEncuestado: r.grupo_encuestado,
    cupo: Number(r.cupo),
    cupoCompletados: Number(r.cupo_completados),
    cupoDisponible: Number(r.cupo_disponible),
  })));
}));

app.delete('/api/surveys/:surveyId/cupos/:grupo', authenticate, allowRoles('superuser'), asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  await pool.query(
    'CALL estadistica.usp_del_cupo_encuesta($1, $2)',
    [survey.id, req.params.grupo],
  );
  return res.status(204).end();
}));

app.post('/api/surveys/:surveyId/codes', authenticate, asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  if (survey.status !== 'active') return res.status(409).json({ error: 'Activa la encuesta antes de generar invitaciones.' });
  const isSuperuser = req.user.role === 'superuser';
  const input = validate(z.object({
    surveyGroupId: z.string().uuid(),
    respondentGroup: z.string().trim().min(1),
    count: isSuperuser
      ? z.number().int().min(1).max(100)
      : z.number().int().min(1).max(1),
  }), req.body);
  const surveyGroup = await pool.query(
    'SELECT * FROM estadistica.fn_grupo_de_encuesta($1)', [survey.id],
  );
  if (!surveyGroup.rows[0] || surveyGroup.rows[0].id !== input.surveyGroupId) {
    return res.status(409).json({ error: 'La encuesta no pertenece al grupo seleccionado.' });
  }
  const allowedGroup = await pool.query(
    'SELECT estadistica.fn_grupo_encuestado_activo($1) AS activo', [input.respondentGroup],
  );
  if (!allowedGroup.rows[0]?.activo) return res.status(400).json({ error: 'El tipo de encuestado no existe.' });
  if (req.user.role === 'encuestador') {
    const assignedGroups = await pool.query(
      'SELECT grupo_encuestado FROM estadistica.fn_grupos_encuestador_en_encuesta($1, $2)',
      [req.user.sub, survey.id],
    );
    const allowed = assignedGroups.rows.some((r) => r.grupo_encuestado === input.respondentGroup);
    if (!allowed) {
      return res.status(403).json({ error: 'No tienes asignación para este tipo de encuestado en esta encuesta.' });
    }
  }
  const disponible = await pool.query(
    'SELECT estadistica.fn_cupo_grupo_encuesta($1, $2) AS disponible',
    [survey.id, input.respondentGroup],
  );
  const disp = disponible.rows[0]?.disponible;
  if (disp !== null && disp !== undefined && Number(disp) < input.count) {
    const n = Number(disp);
    return res.status(409).json({
      error: n === 0
        ? `El cupo para "${input.respondentGroup}" se agotó en esta encuesta.`
        : `Solo quedan ${n} QR disponibles para "${input.respondentGroup}".`,
    });
  }
  const baseUrl = process.env.PUBLIC_APP_URL.replace(/\/$/, '');
  const invitations = [];
  for (let index = 0; index < input.count; index += 1) {
    const token = crypto.randomBytes(24).toString('base64url');
    await pool.query(
      'CALL estadistica.usp_insertar_codigo_encuesta($1, $2, $3, $4, $5)',
      [survey.id, req.user.sub, input.respondentGroup, tokenHash(token), token],
    );
    const url = `${baseUrl}/respond/${token}`;
    invitations.push({
      respondentGroup: input.respondentGroup,
      url,
      qrCode: await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1 }),
    });
  }
  return res.status(201).json({ invitations });
}));

app.get('/api/surveys/:surveyId/codes/pending', authenticate, asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  const grupo = validate(z.string().trim().min(1), req.query.grupo);
  const result = await pool.query(
    'SELECT * FROM estadistica.fn_codigos_pendientes($1, $2)',
    [survey.id, grupo],
  );
  const baseUrl = process.env.PUBLIC_APP_URL.replace(/\/$/, '');
  const rows = await Promise.all(result.rows.map(async (r) => {
    const url = `${baseUrl}/respond/${r.token}`;
    return {
      id: r.id,
      grupoEncuestado: r.grupo_encuestado,
      url,
      qrCode: await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1 }),
      creadoEn: r.creado_en,
    };
  }));
  return res.json(rows);
}));

app.get('/api/respond/:token', asyncRoute(async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM estadistica.fn_validar_invitacion($1)',
    [tokenHash(req.params.token)],
  );
  const invitation = result.rows[0];
  if (!invitation) {
    return res.status(404).json({ error: 'La invitación no es válida, venció o ya fue utilizada.' });
  }
  if (invitation.used_at) {
    return res.status(410).json({
      code: 'INVITATION_ALREADY_USED',
      error: 'Esta encuesta ya fue contestada satisfactoriamente.',
    });
  }
  if (invitation.status !== 'active'
      || (invitation.expires_at && new Date(invitation.expires_at) <= new Date())) {
    return res.status(404).json({ error: 'La invitación no es válida o venció.' });
  }
  const questions = await pool.query(
    'SELECT * FROM estadistica.fn_preguntas_encuesta($1)',
    [invitation.survey_id],
  );
  const mode = await pool.query(
    'SELECT * FROM estadistica.fn_modo_respuesta_por_encuesta($1)', [invitation.survey_id],
  );
  if (!mode.rows[0]) throw new Error('No se pudo recuperar el enfoque de la encuesta.');
  return res.json({
    surveyId: invitation.survey_id,
    title: invitation.title,
    description: invitation.description,
    mode_label: mode.rows[0].mode_label,
    grades_answers: mode.rows[0].grades_answers,
    questions: questions.rows,
  });
}));

app.post('/api/respond/:token', asyncRoute(async (req, res) => {
  const input = validate(z.object({
    answers: z.array(z.object({
      questionId: z.string().uuid(),
      value: z.number().finite().nullable().optional(),
      optionIds: z.array(z.string().uuid()).optional().default([]),
    })).min(1).max(500),
    deviceFingerprint: z.string().max(128).nullable().optional(),
  }), req.body);
  const client = await pool.connect();
  let response;
  let grade;
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query('CALL estadistica.sp_registrar_respuesta($1, $2::jsonb, $3)', [
      tokenHash(req.params.token),
      JSON.stringify(input.answers.map(({ questionId, value, optionIds }) => ({
        pregunta_id: questionId,
        valor: value ?? null,
        opciones: optionIds,
      }))),
      input.deviceFingerprint ?? null,
    ]);
    const responseResult = await client.query(
      'SELECT * FROM estadistica.fn_datos_respuesta_enviada($1)',
      [tokenHash(req.params.token)],
    );
    response = responseResult.rows[0];
    if (!response) throw new Error('No se pudo recuperar la respuesta recién registrada.');
    const gradeResult = await client.query(
      'SELECT * FROM estadistica.fn_calificar_respuesta($1)',
      [tokenHash(req.params.token)],
    );
    const gradeRow = gradeResult.rows[0];
    if (!gradeRow) throw new Error('No se pudo calcular el resultado de la respuesta.');
    const modeResult = await client.query(
      'SELECT * FROM estadistica.fn_modo_respuesta_por_token($1)',
      [tokenHash(req.params.token)],
    );
    if (!modeResult.rows[0]) throw new Error('No se pudo recuperar el enfoque de la respuesta.');
    grade = {
      show_result: gradeRow.mostrar_resultado,
      reveal_correct_answers: gradeRow.revelar_respuestas_correctas,
      grades_answers: modeResult.rows[0].grades_answers,
      mode_label: modeResult.rows[0].mode_label,
      score_percent: gradeRow.puntuacion_porcentual === null
        ? null
        : Number(gradeRow.puntuacion_porcentual),
      graded_questions: Number(gradeRow.preguntas_calificadas),
      questions: gradeRow.resultados,
    };
    await client.query('COMMIT');
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    if (error.code === 'P0001' && error.message === 'codigo_invalido_o_usado') {
      const invitationResult = await client.query(
        'SELECT * FROM estadistica.fn_validar_invitacion($1)',
        [tokenHash(req.params.token)],
      );
      if (invitationResult.rows[0]?.used_at) {
        return res.status(410).json({
          code: 'INVITATION_ALREADY_USED',
          error: 'Esta encuesta ya fue contestada satisfactoriamente.',
        });
      }
    }
    if (error.code === 'P0001') return res.status(409).json({ error: error.message.replaceAll('_', ' ') });
    throw error;
  } finally {
    client.release();
  }
  io.to(`survey:${response.survey_id}`).emit('response:created', {
    surveyId: response.survey_id,
    responseCount: Number(response.response_count),
    groups: {
      participants: Number(response.participants_count),
      judges: Number(response.judges_count),
      exhibitors: Number(response.exhibitors_count),
    },
  });
  if (response.study_id) {
    const studyCounts = await pool.query(
      'SELECT * FROM estadistica.fn_conteo_respuestas_estudio($1)',
      [response.study_id],
    );
    const byGroup = Object.fromEntries(studyCounts.rows.map((r) => [r.group, r.count]));
    io.to(`estudio:${response.study_id}`).emit('estudio:respuesta', {
      studyId: response.study_id,
      byGroup,
      total: studyCounts.rows.reduce((sum, r) => sum + r.count, 0),
    });
  }
  return res.status(201).json({ submitted: true, result: grade });
}));

app.get('/api/surveys/:surveyId/report', authenticate, asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  return res.json(await buildReport(survey));
}));

app.get('/api/surveys/:surveyId/analysis', authenticate, asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  const result = await pool.query(
    'SELECT * FROM estadistica.fn_analisis_borrador($1)',
    [survey.id],
  );
  return res.json(result.rows[0] ?? { body: '', version: 0, updated_at: null });
}));

app.put('/api/surveys/:surveyId/analysis', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  const input = validate(z.object({ body: z.string().max(50000) }), req.body);
  const callResult = await pool.query(
    'CALL estadistica.usp_guardar_borrador($1, $2, $3, NULL, NULL, NULL)',
    [survey.id, input.body, req.user.sub],
  );
  const r = callResult.rows[0];
  return res.json({ body: r.p_body, version: r.p_version, updated_at: r.p_updated_at });
}));

app.get('/api/surveys/:surveyId/report.pdf', authenticate, asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  const report = await buildReport(survey);
  res.setHeader('content-type', 'application/pdf');
  res.setHeader('content-disposition', `attachment; filename="encuesta-${survey.id}.pdf"`);
  const pdf = new PDFDocument({ margin: 48 });
  pdf.pipe(res);
  pdf.fontSize(20).text(survey.title);
  pdf.moveDown().fontSize(10).text(`Respuestas: ${report.summary.response_count}`);
  pdf.text(`Participantes: ${report.summary.participants_count} | Jurados: ${report.summary.judges_count} | Expositores: ${report.summary.exhibitors_count}`);
  for (const question of report.questions) {
    pdf.moveDown().fontSize(14).text(question.prompt);
    pdf.fontSize(9).text(`Tipo: ${question.questionTypeLabel} | Respuestas: ${question.universe}`);
    if (question.isNumeric) {
      pdf.text(
        `Media: ${question.mean ?? 'N/D'} | Mediana: ${question.median ?? 'N/D'} | Moda: ${question.mode ?? 'N/D'} | Rango: ${question.value_range ?? 'N/D'}`,
      );
      pdf.text(
        `Mínimo: ${question.minimum ?? 'N/D'} | Máximo: ${question.maximum ?? 'N/D'} | CV: ${question.coefficient_of_variation ?? 'N/D'}% | Varianza: ${question.variance ?? 'N/D'} | Desviación estándar: ${question.standard_deviation ?? 'N/D'}`,
      );
    }
    pdf.text('Tabla de frecuencias:');
    for (const row of question.frequencies) pdf.text(`${row.value}: ${row.frequency}`);
  }
  const draft = await pool.query(
    'SELECT * FROM estadistica.fn_analisis_borrador($1)',
    [survey.id],
  );
  if (draft.rows[0]?.body) {
    pdf.addPage().fontSize(16).text('Análisis final (borrador)');
    pdf.moveDown().fontSize(10).text(draft.rows[0].body);
  }
  pdf.end();
}));

// ── ENCUESTADORES ─────────────────────────────────────────────────────────────

app.get('/api/encuestadores', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (_req, res) => {
  const result = await pool.query('SELECT * FROM estadistica.fn_listar_encuestadores()');
  return res.json(result.rows);
}));

app.get('/api/surveys/:surveyId/asignaciones', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  const result = await pool.query(
    'SELECT * FROM estadistica.fn_encuestadores_de_encuesta($1)',
    [survey.id],
  );
  return res.json(result.rows);
}));

app.post('/api/surveys/:surveyId/asignaciones', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  const input = validate(z.object({
    usuarioId: z.string().uuid(),
    grupoEncuestado: z.string().trim().min(1),
  }), req.body);
  const userCheck = await pool.query(
    'SELECT id FROM estadistica.vw_usuarios WHERE id = $1 AND role = $2',
    [input.usuarioId, 'encuestador'],
  );
  if (!userCheck.rows[0]) return res.status(400).json({ error: 'El usuario no existe o no es encuestador.' });
  const groupCheck = await pool.query(
    'SELECT estadistica.fn_grupo_encuestado_activo($1) AS activo', [input.grupoEncuestado],
  );
  if (!groupCheck.rows[0]?.activo) return res.status(400).json({ error: 'El tipo de encuestado no existe.' });
  try {
    await pool.query(
      'CALL estadistica.usp_asignar_encuestador($1, $2, $3)',
      [input.usuarioId, survey.id, input.grupoEncuestado],
    );
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Esta asignación ya existe.' });
    throw err;
  }
  const updated = await pool.query(
    'SELECT * FROM estadistica.fn_encuestadores_de_encuesta($1)', [survey.id],
  );
  return res.status(201).json(updated.rows);
}));

app.delete('/api/surveys/:surveyId/asignaciones/:asignacionId', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  await pool.query(
    'CALL estadistica.usp_desasignar_encuestador($1)',
    [req.params.asignacionId],
  );
  void survey;
  return res.status(204).end();
}));

// ── ESTUDIOS ──────────────────────────────────────────────────────────────────

app.get('/api/estudios', authenticate, asyncRoute(async (_req, res) => {
  const result = await pool.query('SELECT * FROM estadistica.vw_estudios_lista');
  return res.json(result.rows);
}));

app.get('/api/grupos', authenticate, asyncRoute(async (_req, res) => {
  const result = await pool.query('SELECT * FROM estadistica.vw_grupos_activos');
  return res.json(result.rows);
}));

app.get('/api/grupos/con-encuesta-activa', authenticate, asyncRoute(async (req, res) => {
  // IDs de grupos que tienen al menos una encuesta en una feria activa
  let grupoIds = null;
  try {
    const gruposConFeriaActiva = await pool.query(
      `SELECT DISTINCT g.id FROM estadistica.grupos g
       JOIN estadistica.encuestas es ON es.grupo = g.nombre
       JOIN estadistica.estudios et ON et.id = es.estudio_id
       WHERE et.estado = 'activo' AND es.estado = 'activa'`,
    );
    grupoIds = new Set(gruposConFeriaActiva.rows.map((r) => r.id));
  } catch {
    // Si el schema difiere, no filtramos (fallback seguro)
  }

  if (req.user.role === 'encuestador') {
    const result = await pool.query(
      'SELECT * FROM estadistica.fn_grupos_activos_encuestador($1)',
      [req.user.sub],
    );
    return res.json(grupoIds ? result.rows.filter((r) => grupoIds.has(r.id)) : result.rows);
  }
  const result = await pool.query('SELECT * FROM estadistica.fn_grupos_con_encuesta_activa()');
  return res.json(grupoIds ? result.rows.filter((r) => grupoIds.has(r.id)) : result.rows);
}));

// Admin — mapa de asignaciones de todos los encuestadores
app.get('/api/admin/asignaciones-encuestadores', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT
      a.id            AS asignacion_id,
      a.usuario_id,
      a.encuesta_id   AS survey_id,
      e.titulo        AS survey_titulo,
      a.grupo_encuestado
    FROM estadistica.asignaciones_encuestador a
    JOIN estadistica.encuestas e ON e.id = a.encuesta_id
  `);
  return res.json(result.rows);
}));

// Admin — todas las encuestas sin filtro de estado
app.get('/api/admin/encuestas', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT e.id, e.titulo, e.estado
    FROM estadistica.encuestas e
    ORDER BY e.titulo
  `);
  return res.json(result.rows);
}));

// Admin CRUD — grupos
app.get('/api/admin/grupos', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (_req, res) => {
  const result = await pool.query('SELECT * FROM estadistica.fn_listar_grupos_admin()');
  return res.json(result.rows);
}));

app.post('/api/admin/grupos', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const input = validate(z.object({
    nombre: z.string().trim().min(1).max(50).regex(/^[a-z0-9_áéíóúñ]+$/i, 'Solo letras, números y guiones bajos'),
    etiqueta: z.string().trim().min(1).max(100),
    icono: z.string().trim().max(10).default('📊'),
    orden: z.number().int().min(0).max(99).default(0),
  }), req.body);
  const r = await pool.query(
    'CALL estadistica.usp_crear_grupo($1, $2, $3, $4, NULL, NULL)',
    [input.nombre, input.etiqueta, input.icono, input.orden],
  );
  const row = r.rows[0];
  if (row.p_error) return res.status(400).json({ error: row.p_error });
  return res.status(201).json({ id: row.p_id, ...input });
}));

app.put('/api/admin/grupos/:id', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const input = validate(z.object({
    etiqueta: z.string().trim().min(1).max(100),
    icono: z.string().trim().max(10).default('📊'),
    orden: z.number().int().min(0).max(99).default(0),
    activo: z.boolean().default(true),
  }), req.body);
  const r = await pool.query(
    'CALL estadistica.usp_actualizar_grupo($1, $2, $3, $4, $5, NULL, NULL)',
    [req.params.id, input.etiqueta, input.icono, input.orden, input.activo],
  );
  const row = r.rows[0];
  if (row.p_error) return res.status(400).json({ error: row.p_error });
  return res.json({ ok: true });
}));

app.delete('/api/admin/grupos/:id', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const r = await pool.query(
    'CALL estadistica.usp_eliminar_grupo($1, NULL, NULL)',
    [req.params.id],
  );
  const row = r.rows[0];
  if (row.p_error) return res.status(400).json({ error: row.p_error });
  return res.json({ ok: true });
}));

// Admin — tipos de pregunta
app.get('/api/admin/tipos-pregunta', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (_req, res) => {
  const result = await pool.query('SELECT codigo, etiqueta, es_numerica, permite_multiple, orden, activo FROM estadistica.tipos_pregunta ORDER BY orden');
  return res.json(result.rows);
}));

app.patch('/api/admin/tipos-pregunta/:codigo', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const { activo } = validate(z.object({ activo: z.boolean() }), req.body);
  const { codigo } = req.params;
  const result = await pool.query(
    'UPDATE estadistica.tipos_pregunta SET activo = $1 WHERE codigo = $2 RETURNING codigo, etiqueta, activo',
    [activo, codigo],
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Tipo no encontrado' });
  return res.json(result.rows[0]);
}));

app.post('/api/estudios', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const input = validate(z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).default(''),
    shift: z.enum(['mañana', 'noche']),
    modeCode: z.string().trim().min(1),
    date: z.string().optional(),
    groups: z.array(z.string().trim().min(1)).min(1),
    groupTargets: z.array(z.object({
      group: z.string().trim().min(1),
      targetCount: z.number().int().min(0).max(2147483647),
    })).min(1),
    respondentTargets: z.array(z.object({
      respondentGroup: z.string().trim().min(1),
      targetCount: z.number().int().min(0).max(2147483647),
    })).default([]),
  }), req.body);
  const selectedGroups = [...new Set(input.groups)];
  const targetsByGroup = new Map(input.groupTargets.map(({ group, targetCount }) => [group, targetCount]));
  const respondentTargetsByGroup = new Map(
    input.respondentTargets.map(({ respondentGroup, targetCount }) => [respondentGroup, targetCount]),
  );
  if (selectedGroups.length !== input.groups.length
      || targetsByGroup.size !== input.groupTargets.length
      || targetsByGroup.size !== selectedGroups.length
      || selectedGroups.some((group) => !targetsByGroup.has(group))
      || respondentTargetsByGroup.size !== input.respondentTargets.length) {
    return res.status(400).json({ error: 'Las metas deben ser únicas por grupo y tipo de encuestado.' });
  }
  const metasGrupo = JSON.stringify(
    selectedGroups.map((nombre) => ({ grupo_nombre: nombre, cantidad: targetsByGroup.get(nombre) })),
  );
  const metasEncuestado = JSON.stringify(
    [...respondentTargetsByGroup.entries()].map(([grupo_encuestado, cantidad]) => ({ grupo_encuestado, cantidad })),
  );
  let callResult;
  try {
    callResult = await pool.query(
      'CALL estadistica.usp_crear_estudio_completo($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,NULL,NULL)',
      [input.title, input.description, input.shift, input.date ?? null,
       req.user.sub, selectedGroups, input.modeCode, metasGrupo, metasEncuestado],
    );
  } catch (error) {
    if (error.code === 'P0001') return res.status(400).json({ error: error.message.replaceAll('_', ' ') });
    throw error;
  }
  if (callResult.rows[0].p_error) {
    return res.status(400).json({ error: callResult.rows[0].p_error });
  }
  const studyId = callResult.rows[0].p_estudio_id;
  const studyResult = await pool.query(
    'SELECT * FROM estadistica.vw_estudios_lista WHERE id = $1',
    [studyId],
  );
  return res.status(201).json(studyResult.rows[0]);
}));

app.patch('/api/estudios/:studyId/status', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const input = validate(z.object({ status: z.enum(['borrador', 'activo', 'cerrado']) }), req.body);
  const existing = await pool.query(
    'SELECT id FROM estadistica.vw_estudios_lista WHERE id = $1',
    [req.params.studyId],
  );
  if (!existing.rows[0]) return res.status(404).json({ error: 'Estudio no encontrado.' });
  await pool.query(
    "UPDATE estadistica.estudios SET estado = $1 WHERE id = $2",
    [input.status, req.params.studyId],
  );
  const updated = await pool.query(
    'SELECT * FROM estadistica.vw_estudios_lista WHERE id = $1',
    [req.params.studyId],
  );
  return res.json(updated.rows[0]);
}));

app.get('/api/estudios/:studyId', authenticate, asyncRoute(async (req, res) => {
  const studyResult = await pool.query(
    'SELECT * FROM estadistica.vw_estudios_lista WHERE id = $1',
    [req.params.studyId],
  );
  if (!studyResult.rows[0]) return res.status(404).json({ error: 'Estudio no encontrado.' });
  const study = studyResult.rows[0];
  const surveysResult = await pool.query(
    'SELECT * FROM estadistica.fn_encuestas_por_estudio_completo($1)', [study.id],
  );
  const totalResponses = surveysResult.rows.reduce((sum, row) => sum + row.response_count, 0);
  const respondentTargets = await pool.query(
    'SELECT * FROM estadistica.fn_metas_encuestado_estudio($1)', [study.id],
  );
  return res.json({
    ...study,
    surveys: surveysResult.rows,
    totalResponses,
    respondentTargets: respondentTargets.rows,
  });
}));

// ── REPORTE ESTADÍSTICO POR FERIA (solo superuser) ────────────────────────────

async function buildEstudioReporte(studyId) {
  const studyResult = await pool.query(
    'SELECT * FROM estadistica.vw_estudios_lista WHERE id = $1', [studyId],
  );
  if (!studyResult.rows[0]) return null;
  const study = studyResult.rows[0];
  const surveysResult = await pool.query(
    'SELECT * FROM estadistica.fn_encuestas_por_estudio_completo($1)', [study.id],
  );
  const surveys = surveysResult.rows;
  const reports = [];
  for (const survey of surveys) {
    const surveyObj = {
      id: survey.id, title: survey.titulo ?? survey.title,
      group: survey.grupo ?? survey.group, group_id: survey.grupo_id ?? survey.group_id,
      status: survey.estado ?? survey.status,
    };
    const r = await buildReport(surveyObj);
    reports.push({ ...r, group: surveyObj.group, group_id: surveyObj.group_id });
  }
  const respondentTargets = await pool.query(
    'SELECT * FROM estadistica.fn_metas_encuestado_estudio($1)', [study.id],
  );
  return { study, surveys: reports, respondentTargets: respondentTargets.rows };
}

app.get('/api/estudios/:studyId/reporte-estadistico', authenticate, allowRoles('superuser'), asyncRoute(async (req, res) => {
  const data = await buildEstudioReporte(req.params.studyId);
  if (!data) return res.status(404).json({ error: 'Estudio no encontrado.' });
  return res.json(data);
}));

app.get('/api/estudios/:studyId/reporte-estadistico.pdf', authenticate, allowRoles('superuser'), asyncRoute(async (req, res) => {
  const data = await buildEstudioReporte(req.params.studyId);
  if (!data) return res.status(404).json({ error: 'Estudio no encontrado.' });
  const { study, surveys, respondentTargets } = data;

  res.setHeader('content-type', 'application/pdf');
  res.setHeader('content-disposition', `attachment; filename="reporte-${study.id}.pdf"`);

  const pdf = new PDFDocument({ margin: 50, size: 'A4' });
  pdf.pipe(res);

  const W = pdf.page.width - 100;
  const dateStr = study.date ? new Date(study.date).toLocaleDateString('es-BO', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Sin fecha';
  const now = new Date().toLocaleDateString('es-BO', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── Portada ──────────────────────────────────────────────────────────────────
  pdf.rect(50, 50, W, 160).fill('#0d2b24');
  pdf.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
     .text('INFORME ESTADÍSTICO CUANTITATIVO', 70, 75, { width: W - 40, align: 'center' });
  pdf.fontSize(14).font('Helvetica')
     .text(study.title ?? 'Feria', 70, 110, { width: W - 40, align: 'center' });
  pdf.fontSize(10)
     .text(`Fecha: ${dateStr}  ·  Turno: ${study.shift ?? '—'}`, 70, 140, { width: W - 40, align: 'center' });
  pdf.text(`Generado: ${now}`, 70, 158, { width: W - 40, align: 'center' });
  pdf.fillColor('#000000');

  pdf.moveDown(2);
  pdf.fontSize(11).font('Helvetica-Bold').text('TIPO DE ESTUDIO', { underline: false });
  pdf.fontSize(10).font('Helvetica').list([
    'Tipo: Cuantitativo',
    'Diseño: Descriptivo-propositivo',
    'Técnica: Encuesta estructurada',
    'Universo: Participantes de la feria (expositores, jurados, participantes y público)',
  ], { bulletRadius: 2, textIndent: 10, lineGap: 2 });

  // ── Resumen global ───────────────────────────────────────────────────────────
  pdf.addPage();
  pdf.fontSize(16).font('Helvetica-Bold').text('RESUMEN GENERAL');
  pdf.moveDown(0.5);

  let totalResponses = 0, totalParticipants = 0, totalJudges = 0, totalExhibitors = 0;
  for (const r of surveys) {
    totalResponses   += r.summary.response_count ?? 0;
    totalParticipants += r.summary.participants_count ?? 0;
    totalJudges      += r.summary.judges_count ?? 0;
    totalExhibitors  += r.summary.exhibitors_count ?? 0;
  }
  const tableData = [
    ['Encuestas analizadas', String(surveys.length)],
    ['Total de respuestas', String(totalResponses)],
    ['Participantes', String(totalParticipants)],
    ['Jurados', String(totalJudges)],
    ['Expositores', String(totalExhibitors)],
  ];
  if (respondentTargets.length > 0) {
    for (const t of respondentTargets) {
      tableData.push([`Meta ${t.grupo_encuestado ?? t.respondentGroup ?? '—'}`, String(t.target_count ?? '—')]);
    }
  }
  const col1 = 50, col2 = 300, rowH = 20;
  let ty = pdf.y;
  pdf.rect(col1, ty, W, rowH).fill('#0d2b24');
  pdf.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
     .text('Indicador', col1 + 5, ty + 5, { width: 240 })
     .text('Valor', col2 + 5, ty + 5, { width: 100 });
  pdf.fillColor('#000000');
  ty += rowH;
  for (let i = 0; i < tableData.length; i++) {
    const bg = i % 2 === 0 ? '#f0f7f4' : '#ffffff';
    pdf.rect(col1, ty, W, rowH).fill(bg);
    pdf.fillColor('#000000').fontSize(10).font('Helvetica')
       .text(tableData[i][0], col1 + 5, ty + 5, { width: 240 })
       .text(tableData[i][1], col2 + 5, ty + 5, { width: 100 });
    ty += rowH;
  }
  pdf.y = ty + 10;

  // ── Por cada encuesta/grupo ──────────────────────────────────────────────────
  for (const surveyReport of surveys) {
    pdf.addPage();
    const groupLabel = surveyReport.group ?? 'Encuesta';
    const { summary, questions } = surveyReport;

    pdf.rect(50, pdf.y, W, 28).fill('#1a4a3a');
    pdf.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold')
       .text(`GRUPO: ${groupLabel}`, 60, pdf.y + 7, { width: W - 20 });
    pdf.fillColor('#000000');
    pdf.moveDown(2);

    pdf.fontSize(10).font('Helvetica')
       .text(`Respuestas: ${summary.response_count}  |  Participantes: ${summary.participants_count}  |  Jurados: ${summary.judges_count}  |  Expositores: ${summary.exhibitors_count}`);
    pdf.moveDown(1);

    for (const q of questions) {
      if (pdf.y > pdf.page.height - 180) pdf.addPage();

      pdf.rect(50, pdf.y, W, 20).fill('#e8f4ee');
      pdf.fillColor('#000000').fontSize(11).font('Helvetica-Bold')
         .text(q.prompt, 55, pdf.y + 4, { width: W - 10 });
      pdf.moveDown(1.5);

      pdf.fontSize(9).font('Helvetica').fillColor('#444444')
         .text(`Tipo: ${q.questionTypeLabel}  |  Universo (N): ${q.universe}`);
      pdf.fillColor('#000000');
      pdf.moveDown(0.5);

      if (q.isNumeric && q.universe > 0) {
        // Tabla de estadísticos
        const stats = [
          ['Media (x̄)', q.mean != null ? Number(q.mean).toFixed(4) : 'N/D'],
          ['Mediana', q.median != null ? Number(q.median).toFixed(4) : 'N/D'],
          ['Moda', q.mode != null ? Number(q.mode).toFixed(4) : 'N/D'],
          ['Rango', q.value_range != null ? Number(q.value_range).toFixed(4) : 'N/D'],
          ['Mínimo', q.minimum != null ? Number(q.minimum).toFixed(4) : 'N/D'],
          ['Máximo', q.maximum != null ? Number(q.maximum).toFixed(4) : 'N/D'],
          ['Varianza (S²)', q.variance != null ? Number(q.variance).toFixed(4) : 'N/D'],
          ['Desviación estándar (S)', q.standard_deviation != null ? Number(q.standard_deviation).toFixed(4) : 'N/D'],
          ['Coef. de variación (%)', q.coefficient_of_variation != null ? Number(q.coefficient_of_variation).toFixed(2) + '%' : 'N/D'],
        ];
        const colW = Math.floor(W / 3);
        let sx = 50, sy = pdf.y;
        for (let i = 0; i < stats.length; i++) {
          const col = i % 3, row = Math.floor(i / 3);
          const cx = sx + col * colW, cy = sy + row * 18;
          if (i === 0) {
            pdf.rect(sx, sy - 2, W, Math.ceil(stats.length / 3) * 18 + 4).fill('#f9fdfc').stroke('#c8e6d8');
          }
          pdf.fillColor('#1a4a3a').fontSize(8).font('Helvetica-Bold')
             .text(stats[i][0] + ':', cx + 3, cy + 3, { width: colW - 6 });
          pdf.fillColor('#000000').fontSize(8).font('Helvetica')
             .text(stats[i][1], cx + 3, cy + 11, { width: colW - 6 });
        }
        pdf.y = sy + Math.ceil(stats.length / 3) * 18 + 10;
      }

      // Tabla de frecuencias
      if (q.frequencies.length > 0) {
        if (pdf.y > pdf.page.height - 100) pdf.addPage();
        pdf.fontSize(9).font('Helvetica-Bold').text('Distribución de frecuencias:');
        pdf.moveDown(0.3);
        const fH = 16;
        let fy = pdf.y;
        const fW1 = Math.floor(W * 0.5), fW2 = Math.floor(W * 0.25), fW3 = Math.floor(W * 0.25);
        pdf.rect(50, fy, W, fH).fill('#0d2b24');
        pdf.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
           .text('Valor / Categoría', 55, fy + 4, { width: fW1 - 5 })
           .text('Frecuencia (fi)', 55 + fW1, fy + 4, { width: fW2 - 5 })
           .text('Frecuencia rel. (%)', 55 + fW1 + fW2, fy + 4, { width: fW3 - 5 });
        pdf.fillColor('#000000');
        fy += fH;
        const totalFreq = q.frequencies.reduce((s, f) => s + f.frequency, 0);
        for (let i = 0; i < q.frequencies.length; i++) {
          const f = q.frequencies[i];
          const pct = totalFreq > 0 ? ((f.frequency / totalFreq) * 100).toFixed(1) + '%' : '—';
          const bg = i % 2 === 0 ? '#f0f7f4' : '#ffffff';
          pdf.rect(50, fy, W, fH).fill(bg);
          pdf.fillColor('#000000').fontSize(8).font('Helvetica')
             .text(String(f.value), 55, fy + 4, { width: fW1 - 5 })
             .text(String(f.frequency), 55 + fW1, fy + 4, { width: fW2 - 5 })
             .text(pct, 55 + fW1 + fW2, fy + 4, { width: fW3 - 5 });
          fy += fH;
          if (fy > pdf.page.height - 60) { pdf.addPage(); fy = 50; }
        }
        pdf.y = fy + 8;
      }
      pdf.moveDown(1);
    }
  }

  // ── Análisis propositivo (IA almacenada) ─────────────────────────────────────
  // Si existe un análisis guardado en alguna encuesta de la feria, incluirlo
  for (const surveyReport of surveys) {
    const draft = await pool.query(
      'SELECT * FROM estadistica.fn_analisis_borrador($1)', [surveyReport.survey.id],
    );
    if (draft.rows[0]?.body) {
      pdf.addPage();
      pdf.rect(50, pdf.y, W, 28).fill('#0d2b24');
      pdf.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold')
         .text(`ANÁLISIS PROPOSITIVO — ${surveyReport.group ?? 'Encuesta'}`, 60, pdf.y + 7, { width: W - 20 });
      pdf.fillColor('#000000');
      pdf.moveDown(2);
      pdf.fontSize(10).font('Helvetica').text(draft.rows[0].body, { lineGap: 4 });
    }
  }

  // ── Pie de página informativo ─────────────────────────────────────────────────
  pdf.addPage();
  pdf.fontSize(11).font('Helvetica-Bold').text('NOTAS METODOLÓGICAS');
  pdf.moveDown(0.5);
  pdf.fontSize(9).font('Helvetica').list([
    'El presente informe corresponde a un estudio cuantitativo-descriptivo con enfoque propositivo.',
    'Los datos fueron recolectados mediante encuesta estructurada aplicada en campo durante la feria.',
    'La media aritmética, mediana, moda y distribuciones de frecuencia se calcularon sobre el total de respuestas válidas (universo N).',
    'El rango se obtiene como la diferencia entre el valor máximo y el mínimo observado.',
    'La varianza y la desviación estándar corresponden a la varianza muestral (denominador N-1).',
    'El coeficiente de variación (CV%) permite comparar la dispersión relativa entre variables de distinta escala.',
    'Los grupos analizados corresponden a las categorías de encuestados definidas en el sistema: participantes, jurados, expositores y público general.',
  ], { bulletRadius: 2, textIndent: 10, lineGap: 3 });
  pdf.moveDown(1);
  pdf.fontSize(9).fillColor('#666666')
     .text(`Universidad de los Andes — UNANDES · Estadística I (EST-343) · ${now}`);

  pdf.end();
}));

app.get('/api/dashboard/ferias', asyncRoute(async (_req, res) => {
  const result = await pool.query(
    "SELECT * FROM estadistica.vw_estudios_lista WHERE status = 'activo' ORDER BY created_at DESC",
  );
  return res.json(result.rows.map((r) => ({ id: r.id, titulo: r.title, turno: r.shift, fecha: r.date })));
}));

app.get('/api/estudios/:studyId/dashboard', asyncRoute(async (req, res) => {
  const resumen = await pool.query(
    'SELECT * FROM estadistica.fn_dashboard_feria_resumen($1)',
    [req.params.studyId],
  );
  if (!resumen.rows[0]) return res.status(404).json({ error: 'Estudio no encontrado.' });
  const preguntas = await pool.query(
    'SELECT * FROM estadistica.fn_dashboard_preguntas_feria($1)',
    [req.params.studyId],
  );
  return res.json({
    ...resumen.rows[0],
    preguntas: preguntas.rows,
  });
}));

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Se requiere iniciar sesión.'));
    socket.data.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return next(new Error('El token de acceso es inválido o venció.'));
  }
});

io.on('connection', (socket) => {
  socket.on('survey:join', async (surveyId, acknowledge = () => {}) => {
    try {
      const { error } = await findSurveyForUser(surveyId, socket.data.user);
      if (error) return acknowledge({ error });
      await socket.join(`survey:${surveyId}`);
      return acknowledge({ joined: true });
    } catch (error) {
      console.error('No se pudo unir a la sala de la encuesta:', error);
      return acknowledge({ error: 'No se pudo activar la actualización de la encuesta.' });
    }
  });

  socket.on('estudio:join', async (studyId, acknowledge = () => {}) => {
    try {
      const study = await pool.query('SELECT id FROM estadistica.vw_estudios_lista WHERE id = $1', [studyId]);
      if (!study.rows[0]) return acknowledge({ error: 'Estudio no encontrado.' });
      await socket.join(`estudio:${studyId}`);
      return acknowledge({ joined: true });
    } catch (error) {
      console.error('No se pudo unir a la sala del estudio:', error);
      return acknowledge({ error: 'No se pudo activar la actualización del estudio.' });
    }
  });
});

app.use((error, _req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'La solicitud no es válida.', details: error.issues });
  }
  console.error('Error en la solicitud:', error);
  return res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor.' });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.join(__dirname, '../../client/dist/client/browser');
app.use(express.static(clientDist));
app.get('/{*splat}', (_req, res) => res.sendFile('index.html', { root: clientDist }));

server.listen(port, () => {
  console.log(`API de estadística escuchando en el puerto ${port}.`);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await pool.end();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
