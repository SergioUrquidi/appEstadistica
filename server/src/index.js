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
    `SELECT id, usuario_creador_id AS creator_id, titulo AS title, descripcion AS description,
            CASE estado::text
              WHEN 'borrador' THEN 'draft'
              WHEN 'activa' THEN 'active'
              WHEN 'cerrada' THEN 'closed'
            END AS status,
            creado_en AS created_at, actualizado_en AS updated_at
     FROM estadistica.encuestas WHERE id = $1`,
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
    `SELECT id, pregunta AS prompt FROM estadistica.preguntas
     WHERE encuesta_id = $1 ORDER BY posicion`,
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
        `SELECT valor AS value, count(*)::bigint AS frequency
         FROM estadistica.respuestas_numericas WHERE pregunta_id = $1
         GROUP BY valor ORDER BY valor`,
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
    `SELECT id, correo AS email, hash_contrasena AS password_hash,
            nombre_visible AS display_name,
            CASE rol::text WHEN 'superusuario' THEN 'superuser'
                           WHEN 'administrador' THEN 'admin'
                           WHEN 'usuario' THEN 'user' END AS role
     FROM estadistica.usuarios WHERE correo = lower($1)`,
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
    `SELECT id, correo AS email, nombre_visible AS display_name,
            CASE rol::text WHEN 'superusuario' THEN 'superuser'
                           WHEN 'administrador' THEN 'admin'
                           WHEN 'usuario' THEN 'user' END AS role
     FROM estadistica.usuarios WHERE id = $1`,
    [req.user.sub],
  );
  if (!result.rows[0]) return res.status(401).json({ error: 'La cuenta ya no existe.' });
  return res.json(result.rows[0]);
}));

app.get('/api/users', authenticate, allowRoles('admin', 'superuser'), asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT id, correo AS email, nombre_visible AS display_name,
            CASE rol::text WHEN 'superusuario' THEN 'superuser'
                           WHEN 'administrador' THEN 'admin'
                           WHEN 'usuario' THEN 'user' END AS role,
            creado_en AS created_at
     FROM estadistica.usuarios
     WHERE $1::boolean OR rol <> 'superusuario'
     ORDER BY creado_en DESC`,
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
    const result = await pool.query(
      `INSERT INTO estadistica.usuarios
         (correo, hash_contrasena, nombre_visible, rol, creado_por)
       VALUES (lower($1), $2, $3, $4::estadistica.rol_usuario, $5)
       RETURNING id, correo AS email, nombre_visible AS display_name,
                 CASE rol::text WHEN 'superusuario' THEN 'superuser'
                                WHEN 'administrador' THEN 'admin'
                                WHEN 'usuario' THEN 'user' END AS role,
                 creado_en AS created_at`,
      [input.email, passwordHash, input.displayName, databaseRoles[input.role], req.user.sub],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    throw error;
  }
}));

app.get('/api/surveys', authenticate, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT s.id, s.titulo AS title, s.descripcion AS description,
            CASE s.estado::text WHEN 'borrador' THEN 'draft'
                                WHEN 'activa' THEN 'active'
                                WHEN 'cerrada' THEN 'closed' END AS status,
            s.creado_en AS created_at,
            COALESCE(summary.cantidad_respuestas, 0) AS response_count
     FROM estadistica.encuestas s
     LEFT JOIN estadistica.vista_resumen_respuestas summary ON summary.encuesta_id = s.id
     WHERE $1::boolean OR s.usuario_creador_id = $2
     ORDER BY s.creado_en DESC`,
    [['admin', 'superuser'].includes(req.user.role), req.user.sub],
  );
  return res.json(result.rows);
}));

app.post('/api/surveys', authenticate, asyncRoute(async (req, res) => {
  const input = validate(z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).default(''),
  }), req.body);
  const result = await pool.query(
    `INSERT INTO estadistica.encuestas (usuario_creador_id, titulo, descripcion)
     VALUES ($1, $2, $3)
     RETURNING id, titulo AS title, descripcion AS description,
               'draft' AS status, creado_en AS created_at`,
    [req.user.sub, input.title, input.description],
  );
  return res.status(201).json(result.rows[0]);
}));

app.get('/api/surveys/:surveyId', authenticate, asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  const questions = await pool.query(
    `SELECT id, posicion AS position, pregunta AS prompt,
            valor_minimo AS min_value, valor_maximo AS max_value
     FROM estadistica.preguntas WHERE encuesta_id = $1 ORDER BY posicion`,
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
  const positionResult = await pool.query(
    'SELECT COALESCE(max(posicion), 0) + 1 AS position FROM estadistica.preguntas WHERE encuesta_id = $1',
    [survey.id],
  );
  const result = await pool.query(
    `INSERT INTO estadistica.preguntas
       (encuesta_id, posicion, pregunta, valor_minimo, valor_maximo, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, posicion AS position, pregunta AS prompt,
               valor_minimo AS min_value, valor_maximo AS max_value`,
    [survey.id, positionResult.rows[0].position, input.prompt, input.minValue, input.maxValue, req.user.sub],
  );
  return res.status(201).json(result.rows[0]);
}));

app.post('/api/surveys/:surveyId/activate', authenticate, asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  if (survey.status !== 'draft') return res.status(409).json({ error: 'Solo se pueden activar encuestas en borrador.' });
  const count = await pool.query('SELECT count(*)::int AS count FROM estadistica.preguntas WHERE encuesta_id = $1', [survey.id]);
  if (count.rows[0].count === 0) return res.status(400).json({ error: 'Agrega al menos una pregunta antes de activar la encuesta.' });
  const result = await pool.query(
    `UPDATE estadistica.encuestas
     SET estado = 'activa', actualizado_en = now(), actualizado_por = $2
     WHERE id = $1 RETURNING id, 'active' AS status`,
    [survey.id, req.user.sub],
  );
  return res.json(result.rows[0]);
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
      `INSERT INTO estadistica.codigos_encuesta
         (encuesta_id, usuario_emisor_id, grupo_encuestado, hash_token)
       VALUES ($1, $2, $3, $4)`,
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
    `SELECT s.id AS survey_id, s.titulo AS title, s.descripcion AS description,
            CASE s.estado::text WHEN 'borrador' THEN 'draft'
                                WHEN 'activa' THEN 'active'
                                WHEN 'cerrada' THEN 'closed' END AS status,
            c.usado_en AS used_at, c.vence_en AS expires_at
     FROM estadistica.codigos_encuesta c
     JOIN estadistica.encuestas s ON s.id = c.encuesta_id
     WHERE c.hash_token = $1`,
    [tokenHash(req.params.token)],
  );
  const invitation = result.rows[0];
  if (!invitation || invitation.status !== 'active' || invitation.used_at
      || (invitation.expires_at && new Date(invitation.expires_at) <= new Date())) {
    return res.status(404).json({ error: 'La invitación no es válida, venció o ya fue utilizada.' });
  }
  const questions = await pool.query(
    `SELECT id, posicion AS position, pregunta AS prompt,
            valor_minimo AS min_value, valor_maximo AS max_value
     FROM estadistica.preguntas WHERE encuesta_id = $1 ORDER BY posicion`,
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
  }), req.body);
  try {
    await pool.query('CALL estadistica.sp_registrar_respuesta($1, $2::jsonb)', [
      tokenHash(req.params.token),
      JSON.stringify(input.answers.map(({ questionId, value }) => ({ pregunta_id: questionId, valor: value }))),
    ]);
  } catch (error) {
    if (error.code === 'P0001') return res.status(409).json({ error: error.message.replaceAll('_', ' ') });
    throw error;
  }
  const result = await pool.query(
    `SELECT s.id AS survey_id, r.id AS response_id,
            summary.cantidad_respuestas AS response_count,
            summary.cantidad_participantes AS participants_count,
            summary.cantidad_jurados AS judges_count,
            summary.cantidad_expositores AS exhibitors_count
     FROM estadistica.codigos_encuesta c
     JOIN estadistica.respuestas r ON r.codigo_encuesta_id = c.id
     JOIN estadistica.encuestas s ON s.id = r.encuesta_id
     JOIN estadistica.vista_resumen_respuestas summary ON summary.encuesta_id = s.id
     WHERE c.hash_token = $1`,
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
    `SELECT contenido AS body, version, actualizado_en AS updated_at
     FROM estadistica.borradores_analisis WHERE encuesta_id = $1`,
    [survey.id],
  );
  return res.json(result.rows[0] ?? { body: '', version: 0, updated_at: null });
}));

app.put('/api/surveys/:surveyId/analysis', authenticate, asyncRoute(async (req, res) => {
  const { survey, error, status } = await findSurveyForUser(req.params.surveyId, req.user);
  if (error) return res.status(status).json({ error });
  const input = validate(z.object({ body: z.string().max(50000) }), req.body);
  const result = await pool.query(
    `INSERT INTO estadistica.borradores_analisis AS borrador
       (encuesta_id, contenido, creado_por, actualizado_por)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (encuesta_id) DO UPDATE
       SET contenido = EXCLUDED.contenido,
           version = borrador.version + 1,
           actualizado_por = EXCLUDED.actualizado_por,
           actualizado_en = now()
     RETURNING contenido AS body, version, actualizado_en AS updated_at`,
    [survey.id, input.body, req.user.sub],
  );
  return res.json(result.rows[0]);
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
    'SELECT contenido AS body FROM estadistica.borradores_analisis WHERE encuesta_id = $1',
    [survey.id],
  );
  if (draft.rows[0]?.body) {
    pdf.addPage().fontSize(16).text('Análisis final (borrador)');
    pdf.moveDown().fontSize(10).text(draft.rows[0].body);
  }
  pdf.end();
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
