import { fileURLToPath } from 'node:url';
import { createBookingServer } from './app.js';

const server = createBookingServer({
  databasePath: process.env.DATABASE_PATH || fileURLToPath(new URL('../data/dalbit.sqlite', import.meta.url)),
  publicOrigin: process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:5173',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminSetupToken: process.env.ADMIN_SETUP_TOKEN || '',
  tossClientKey: process.env.TOSS_CLIENT_KEY || '',
  tossSecretKey: process.env.TOSS_SECRET_KEY || '',
  supportEmail: process.env.SUPPORT_EMAIL || '',
  staticRoot: fileURLToPath(new URL('../dist', import.meta.url)),
});
const port = Number(process.env.PORT || 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port number.');
server.listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log(`DalbitEdu booking API listening on port ${port}.`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
