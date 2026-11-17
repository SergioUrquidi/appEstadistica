# Sistema de estadística y encuestas

Aplicación inicial de encuestas cuantitativas con PostgreSQL, API Node.js/Express
y cliente Angular. Los datos se almacenan en PostgreSQL; el panel se actualiza
por Socket.IO al recibir respuestas.

## Requisitos

- Node.js 20.19+ (probado con Node 22)
- npm
- PostgreSQL 17+ en ejecución, con la base y el esquema ya creados directamente
  en PostgreSQL.

## Inicio local

1. Configura `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, `PUBLIC_APP_URL`,
   `SUPERUSER_EMAIL` y `SUPERUSER_PASSWORD` en `server/.env`. El backend se
   conecta directamente a PostgreSQL; no ejecuta migraciones ni crea el esquema.
   Usa una contraseña de aplicación de al menos 12 caracteres y no reutilices la
   contraseña de PostgreSQL. El archivo `.env` está excluido de Git.

2. Antes de iniciar una versión que incluya cambios de esquema, aplica en
   PostgreSQL cada archivo pendiente de `database/migrations`. La aplicación no
   ejecuta esas migraciones automáticamente.

3. Instala y ejecuta la API:

   ```powershell
   cd server
   npm install
   npm run seed
   npm run dev
   ```

4. En otra terminal, instala e inicia Angular:

   ```powershell
   cd client
   npm install
   npm start
   ```

5. Abre <http://localhost:4200> e inicia sesión con `SUPERUSER_EMAIL` y
   `SUPERUSER_PASSWORD`.

Angular reenvía `/api` y `/socket.io` a la API local. Para otros entornos,
configura el proxy/reverse proxy del despliegue y las variables de entorno de
la API.

## Funcionalidad incluida

- Roles `superuser`, `admin` y `user`; cada usuario regular administra sus
  encuestas, y admin/superusuario pueden consultar todas.
- Encuestas de opinión y pruebas de conocimiento, con preguntas numéricas, de
  selección única o múltiple y límites numéricos opcionales. En opinión no se
  definen respuestas correctas ni se calcula puntaje; en conocimiento se
  configura una clave y se califica automáticamente.
- Las ferias asignan el enfoque seleccionado a todas las encuestas de sus
  grupos. Las encuestas preexistentes sin enfoque requieren clasificación
  explícita antes de continuar.
- El menú QR y sus encuestas se cargan por grupo activo desde PostgreSQL. El
  tipo de encuestado sigue siendo el enum existente en PostgreSQL, consultado
  desde la API para no duplicar sus valores en el cliente.
- Metas ingresadas explícitamente por cada feria, separadas entre grupos de
  encuesta y tipos de encuestado; los registros históricos no reciben
  cantidades predeterminadas.
- Invitaciones QR con un token aleatorio de un solo uso; se almacena únicamente
  su hash. No se usa IMEI, porque un navegador web no puede leerlo de manera
  fiable.
- Captura pública, con validación en API y base de datos, bloqueo concurrente y
  rechazo de respuestas duplicadas.
- Panel con actualización en tiempo real; estadísticas, frecuencias y descarga
  de resultados en PDF.
- Borrador editable del análisis final, versionado y agregado al PDF.
- La estructura relacional (tablas, restricciones, índices, vista, función
  estadística y procedimiento de captura) reside en PostgreSQL y es consultada
  directamente por el backend.
- Esquema PostgreSQL `estadistica` con nombres de tablas, columnas y objetos en
  español; auditoría por disparadores y una tabla central de auditoría.

## Modelo entidad-relación y objetos PostgreSQL

Las tablas `usuarios`, `encuestas`, `preguntas`, `tipos_pregunta`,
`opciones_pregunta`, `codigos_encuesta`, `respuestas`, `respuestas_numericas`,
`respuestas_opciones` y `borradores_analisis` están relacionadas mediante
claves foráneas, restricciones únicas y reglas de integridad.

Los tipos de pregunta y los enfoques disponibles se consultan desde PostgreSQL.
Las alternativas de selección única o múltiple se almacenan por pregunta en
`opciones_pregunta`; las selecciones recibidas se guardan en
`respuestas_opciones`. Solo las pruebas de conocimiento usan claves guardadas
en `preguntas.valor_correcto` o `opciones_pregunta.es_correcta`; no se exponen
antes de enviar una respuesta. La calificación numérica es exacta, la selección
múltiple otorga crédito proporcional a las alternativas correctas elegidas y
el resultado es el promedio porcentual de las preguntas con clave configurada.
Las encuestas de opinión se analizan estadísticamente sin definir claves ni
generar puntaje.

La base incluye las vistas `estadistica.vista_resumen_respuestas`,
`estadistica.vw_estudios_lista`, `estadistica.vw_grupos_activos` y
`estadistica.vw_usuarios`.

También incluye:

- Función `estadistica.fn_estadisticas_pregunta_numerica`.
- Funciones de frecuencias para respuestas numéricas y alternativas.
- Función `estadistica.fn_calificar_respuesta`, con resultado posterior al envío.
- Procedimiento `estadistica.sp_registrar_respuesta`.
- Procedimientos para crear y administrar encuestas, preguntas, grupos,
  estudios, usuarios e invitaciones.
- Funciones de auditoría y actualización automática de `actualizado_en`.
- Índices definidos para búsquedas, unicidad y consultas de auditoría.
- Disparadores de auditoría en las entidades operativas, incluida la gestión
  de estudios y grupos. `estadistica.auditoria_general` registra operación,
  usuario y valores anteriores/nuevos; no almacena hashes de contraseñas.
- Campos de creación y actualización según cada entidad, con sus respectivas
  claves foráneas y restricciones.

Los usuarios adicionales se crean desde la administración de la aplicación;
no hay registro público de cuentas.