import { fileURLToPath } from 'node:url';
import { openDatabase } from './database.js';
import { resetAdministratorPassword } from './adminAuth.js';

if (!process.env.ADMIN_PASSWORD) throw new Error('Set ADMIN_PASSWORD privately in .env before running administrator recovery.');
const db = openDatabase(process.env.DATABASE_PATH || fileURLToPath(new URL('../data/dalbit.sqlite', import.meta.url)));
try {
  await resetAdministratorPassword(db, process.env.ADMIN_PASSWORD);
  console.log('Administrator password reset. All administrator sessions revoked.');
} finally {
  db.close();
}
