import { createDb } from '../../db/schema.js';
import { seedDb } from '../../db/seed.js';

/**
 * Creates a fresh in-memory SQLite database with the schema applied and
 * the two seeded users (alice/password1, bob/password2) inserted.
 *
 * Use this in tests to get an isolated, repeatable database for each test run.
 *
 * @returns {import('better-sqlite3').Database}
 */
export default function createTestDb() {
  const db = createDb(':memory:');
  seedDb(db);
  return db;
}
