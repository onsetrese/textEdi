/**
 * Seeds the database with the two required demo users if they don't already
 * exist.  Safe to call multiple times — uses INSERT OR IGNORE so it won't
 * error or create duplicates on subsequent runs.
 *
 * Wrapped in an explicit transaction via `exec('BEGIN'/'COMMIT')` because
 * `node:sqlite` (unlike better-sqlite3) does not provide a `db.transaction()`
 * helper. On error the transaction is rolled back.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function seedDb(db) {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)'
  );

  db.exec('BEGIN');
  try {
    insert.run('alice', 'password1');
    insert.run('bob', 'password2');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
