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

2. Instala y ejecuta la API:

   ```powershell
   cd server
   npm install
   npm run seed
   npm run dev
   ```

3. En otra terminal, instala e inicia Angular:

   ```powershell
   cd client
   npm install
   npm start
   ```

4. Abre <http://localhost:4200> e inicia sesión con `SUPERUSER_EMAIL` y
   `SUPERUSER_PASSWORD`.

Angular reenvía `/api` y `/socket.io` a la API local. Para otros entornos,
configura el proxy/reverse proxy del despliegue y las variables de entorno de
la API.

## Funcionalidad incluida

- Roles `superuser`, `admin` y `user`; cada usuario regular administra sus
  encuestas, y admin/superusuario pueden consultar todas.
- Encuestas con preguntas numéricas, límites opcionales y estados borrador/activa.
- Invitaciones QR separadas por participantes, jurados y expositores. El QR
  contiene un token aleatorio de un solo uso; se almacena únicamente su hash.
  No se usa IMEI, porque un navegador web no puede leerlo de manera fiable.
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

El diagrama se encuentra en [database/modelo-entidad-relacion.md](./database/modelo-entidad-relacion.md).
Las tablas `usuarios`, `encuestas`, `preguntas`, `codigos_encuesta`,
`respuestas`, `respuestas_numericas` y `borradores_analisis` están relacionadas
mediante claves foráneas, restricciones únicas y reglas de integridad.

La base incluye:

- Vista `estadistica.vista_resumen_respuestas`.
- Función `estadistica.fn_estadisticas_pregunta_numerica`.
- Procedimiento `estadistica.sp_registrar_respuesta`.
- Funciones de auditoría y actualización automática de `actualizado_en`.
- Índices con nombres en español para búsquedas, relaciones y auditoría.
- Columnas `creado_en`, `actualizado_en`, `creado_por` y `actualizado_por` en
  las entidades operativas, además de `estadistica.auditoria_general`, que
  registra operación, usuario y valores anteriores/nuevos. La auditoría no
  almacena hashes de contraseñas.

Los usuarios adicionales se crean desde la administración de la aplicación;
no hay registro público de cuentas.