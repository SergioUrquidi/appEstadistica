import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Client } = pg;
const { DATABASE_URL, SUPERUSER_EMAIL, SUPERUSER_PASSWORD } = process.env;

if (!DATABASE_URL || !SUPERUSER_EMAIL || !SUPERUSER_PASSWORD) {
  throw new Error('Configure DATABASE_URL, SUPERUSER_EMAIL y SUPERUSER_PASSWORD.');
}
if (SUPERUSER_PASSWORD.length < 12) {
  throw new Error('SUPERUSER_PASSWORD debe tener al menos 12 caracteres.');
}

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  const hash = await bcrypt.hash(SUPERUSER_PASSWORD, 12);
  await client.query(
    `INSERT INTO estadistica.usuarios (correo, hash_contrasena, nombre_visible, rol)
     VALUES ($1, $2, 'Superusuario', 'superusuario')
     ON CONFLICT (correo) DO NOTHING`,
    [SUPERUSER_EMAIL.toLowerCase(), hash],
  );
  console.log('Superusuario inicial preparado.');
} finally {
  await client.end();
}
