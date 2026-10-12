import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function withTransaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function openDatabase(databasePath) {
  if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  const db = new DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) throw new Error('The database schema is newer than this server. Upgrade the server before opening it.');
    if (version < 1) withTransaction(db, () => db.exec(`
      CREATE TABLE IF NOT EXISTS slots (
        id TEXT PRIMARY KEY, starts INTEGER NOT NULL, ends INTEGER NOT NULL, open INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, intake TEXT NOT NULL, status TEXT NOT NULL DEFAULT '신규',
        created INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, nonce TEXT UNIQUE, slot_id TEXT NOT NULL REFERENCES slots(id),
        request_id TEXT REFERENCES requests(id), intake TEXT NOT NULL, amount INTEGER NOT NULL,
        status TEXT NOT NULL, expires INTEGER NOT NULL, payment_key TEXT UNIQUE, receipt TEXT, created INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS booking_slot_status ON bookings(slot_id, status);
      CREATE TABLE IF NOT EXISTS administrator (
        id INTEGER PRIMARY KEY CHECK(id = 1), salt TEXT NOT NULL, password_hash TEXT NOT NULL,
        created INTEGER NOT NULL, updated INTEGER NOT NULL
      );
      PRAGMA user_version = 1;
    `));
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
