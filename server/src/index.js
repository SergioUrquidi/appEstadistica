import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
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
const roles = ['superuser', 'admin', 'user'];
const respondentGroups = ['participants', 'judges', 'exhibitors'];
const databaseRoles = {
  superuser: 'superusuario',
  admin: 'administrador',
  user: 'usuario',
};
const databaseGroups = {
  participants: 'participantes',
  judges: 'jurados',
  exhibitors: 'expositores',
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
    return { error: 'No tienes permisos para esta operación.', status: 403 };
  }
  return { survey };
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
  const statistics = [];
  for (const question of questions.rows) {
    const [stats, frequencies] = await Promise.all([
      pool.query(
        `SELECT universo AS universe, media AS mean, mediana AS median, moda AS mode,
                rango AS value_range, maximo AS maximum, minimo AS minimum,
                coeficiente_variacion AS coefficient_of_variation, varianza AS variance,
                desviacion_estandar AS standard_deviation
         FROM estadistica.fn_estadisticas_pregunta_numerica($1)`,
        [question.id],
      ),
      pool.query(
        'SELECT * FROM estadistica.fn_frecuencias_pregunta($1)',
        [question.id],
      ),
    ]);
    statistics.push({
      questionId: question.id,
      prompt: question.prompt,
      ...Object.fromEntries(Object.entries(stats.rows[0]).map(([key, value]) => [key, value === null ? null : Number(value)])),
      frequencies: frequencies.rows.map((row) => ({
        value: Number(row.value),
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
    'SELECT * FROM estadistica.fn_listar_usuarios($1)',
    [req.user.role === 'superuser'],
  );
  return res.json(result.rows);
}));

app.post('/api/users', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const input = validate(z.object({
    email: z.string().email().max(254),
    displayName: z.string().trim().min(1).max(120),
    password: z.string().min(12).max(200),
    role: z.enum(['superuser', 'admin', 'user']),
  }), req.body);
  if (req.user.role !== 'superuser' && input.role !== 'user') {
    return res.status(403).json({ error: 'Los administradores solo pueden crear usuarios regulares.' });
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

app.get('/api/surveys', authenticate, asyncRoute(async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM estadistica.fn_encuestas_usuario($1, $2)',
    [req.user.sub, ['admin', 'superuser'].includes(req.user.role)],
  );
  return res.json(result.rows);
}));

app.post('/api/surveys', authenticate, asyncRoute(async (req, res) => {
  const input = validate(z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).default(''),
  }), req.body);
  const callResult = await pool.query(
    'CALL estadistica.usp_crear_encuesta($1, $2, $3, NULL, NULL)',
    [input.title, input.description, req.user.sub],
  );
  return res.status(201).json({ id: callResult.rows[0].p_id, title: input.title, description: input.description, status: 'draft', created_at: callResult.rows[0].p_created_at });
}));

app.get('/api/surveys/:surveyId', authenticate, asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  const questions = await pool.query(
    'SELECT * FROM estadistica.fn_preguntas_encuesta($1)',
    [survey.id],
  );
  return res.json({ ...survey, questions: questions.rows });
}));

app.post('/api/surveys/:surveyId/questions', authenticate, asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  if (survey.status !== 'draft') return res.status(409).json({ error: 'No se pueden cambiar preguntas después de activar la encuesta.' });
  const input = validate(z.object({
    prompt: z.string().trim().min(1).max(1000),
    minValue: z.number().finite().nullable().default(null),
    maxValue: z.number().finite().nullable().default(null),
  }).refine((value) =>
    value.minValue === null || value.maxValue === null || value.minValue <= value.maxValue,
  ), req.body);
  const callResult = await pool.query(
    'CALL estadistica.usp_agregar_pregunta($1, $2, $3, $4, $5, NULL, NULL, NULL, NULL)',
    [survey.id, input.prompt, input.minValue, input.maxValue, req.user.sub],
  );
  const r = callResult.rows[0];
  return res.status(201).json({ id: r.p_id, position: r.p_position, prompt: input.prompt, min_value: r.p_min, max_value: r.p_max });
}));

app.post('/api/surveys/:surveyId/activate', authenticate, asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  if (survey.status !== 'draft') return res.status(409).json({ error: 'Solo se pueden activar encuestas en borrador.' });
  const callResult = await pool.query(
    'CALL estadistica.usp_activar_encuesta($1, $2, NULL)',
    [survey.id, req.user.sub],
  );
  if (!callResult.rows[0].p_ok) return res.status(400).json({ error: 'Agrega al menos una pregunta antes de activar la encuesta.' });
  return res.json({ id: survey.id, status: 'active' });
}));

app.post('/api/surveys/:surveyId/codes', authenticate, asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  if (survey.status !== 'active') return res.status(409).json({ error: 'Activa la encuesta antes de generar invitaciones.' });
  const input = validate(z.object({
    group: z.enum(respondentGroups),
    count: z.number().int().min(1).max(100),
  }), req.body);
  const invitations = [];
  for (let index = 0; index < input.count; index += 1) {
    const token = crypto.randomBytes(24).toString('base64url');
    await pool.query(
      'CALL estadistica.usp_insertar_codigo_encuesta($1, $2, $3, $4)',
      [survey.id, req.user.sub, databaseGroups[input.group], tokenHash(token)],
    );
    const url = `${process.env.PUBLIC_APP_URL.replace(/\/$/, '')}/respond/${token}`;
    invitations.push({
      group: input.group,
      url,
      qrCode: await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1 }),
    });
  }
  return res.status(201).json({ invitations });
}));

app.get('/api/respond/:token', asyncRoute(async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM estadistica.fn_validar_invitacion($1)',
    [tokenHash(req.params.token)],
  );
  const invitation = result.rows[0];
  if (!invitation || invitation.status !== 'active' || invitation.used_at
      || (invitation.expires_at && new Date(invitation.expires_at) <= new Date())) {
    return res.status(404).json({ error: 'La invitación no es válida, venció o ya fue utilizada.' });
  }
  const questions = await pool.query(
    'SELECT * FROM estadistica.fn_preguntas_encuesta($1)',
    [invitation.survey_id],
  );
  return res.json({
    surveyId: invitation.survey_id,
    title: invitation.title,
    description: invitation.description,
    questions: questions.rows,
  });
}));

app.post('/api/respond/:token', asyncRoute(async (req, res) => {
  const input = validate(z.object({
    answers: z.array(z.object({
      questionId: z.string().uuid(),
      value: z.number().finite(),
    })).min(1).max(500),
    deviceFingerprint: z.string().max(128).nullable().optional(),
  }), req.body);
  try {
    await pool.query('CALL estadistica.sp_registrar_respuesta($1, $2::jsonb, $3)', [
      tokenHash(req.params.token),
      JSON.stringify(input.answers.map(({ questionId, value }) => ({ pregunta_id: questionId, valor: value }))),
      input.deviceFingerprint ?? null,
    ]);
  } catch (error) {
    if (error.code === 'P0001') return res.status(409).json({ error: error.message.replaceAll('_', ' ') });
    throw error;
  }
  const result = await pool.query(
    'SELECT * FROM estadistica.fn_datos_respuesta_enviada($1)',
    [tokenHash(req.params.token)],
  );
  const response = result.rows[0];
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
  return res.status(201).json({ submitted: true });
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

app.put('/api/surveys/:surveyId/analysis', authenticate, asyncRoute(async (req, res) => {
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
    pdf.fontSize(9).text(
      `Universo: ${question.universe} | Media: ${question.mean ?? 'N/D'} | Mediana: ${question.median ?? 'N/D'} | Moda: ${question.mode ?? 'N/D'} | Rango: ${question.value_range ?? 'N/D'}`,
    );
    pdf.text(
      `Mínimo: ${question.minimum ?? 'N/D'} | Máximo: ${question.maximum ?? 'N/D'} | CV: ${question.coefficient_of_variation ?? 'N/D'}% | Varianza: ${question.variance ?? 'N/D'} | Desviación estándar: ${question.standard_deviation ?? 'N/D'}`,
    );
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

// ── ESTUDIOS ──────────────────────────────────────────────────────────────────

app.get('/api/estudios', authenticate, asyncRoute(async (_req, res) => {
  const result = await pool.query('SELECT * FROM estadistica.vw_estudios_lista');
  return res.json(result.rows);
}));

app.get('/api/grupos', authenticate, asyncRoute(async (_req, res) => {
  const result = await pool.query('SELECT * FROM estadistica.vw_grupos_activos');
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

app.post('/api/estudios', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const input = validate(z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).default(''),
    shift: z.enum(['mañana', 'noche']),
    date: z.string().optional(),
    groups: z.array(z.string()).optional(),
  }), req.body);
  const selectedGroups = input.groups?.length > 0 ? input.groups : null;
  const callResult = await pool.query(
    'CALL estadistica.usp_crear_estudio($1, $2, $3, $4, $5, $6, NULL)',
    [input.title, input.description, input.shift, input.date ?? null, req.user.sub, selectedGroups],
  );
  const studyId = callResult.rows[0].p_estudio_id;
  const studyResult = await pool.query(
    'SELECT * FROM estadistica.vw_estudios_lista WHERE id = $1',
    [studyId],
  );
  return res.status(201).json(studyResult.rows[0]);
}));

app.get('/api/estudios/:studyId', authenticate, asyncRoute(async (req, res) => {
  const studyResult = await pool.query(
    'SELECT * FROM estadistica.vw_estudios_lista WHERE id = $1',
    [req.params.studyId],
  );
  if (!studyResult.rows[0]) return res.status(404).json({ error: 'Estudio no encontrado.' });
  const study = studyResult.rows[0];
  const surveysResult = await pool.query(
    'SELECT * FROM estadistica.fn_encuestas_estudio($1)',
    [study.id],
  );
  const totalResponses = surveysResult.rows.reduce((sum, row) => sum + row.response_count, 0);
  return res.json({ ...study, surveys: surveysResult.rows, totalResponses });
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

server.listen(port, () => {
  console.log(`API de estadística escuchando en el puerto ${port}.`);
});

async function shutdown() {
  await pool.end();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
