import { DatabaseSync } from 'node:sqlite';

/**
 * Creates (or opens) a SQLite database at `dbPath` and runs the DDL to
 * create all required tables if they don't already exist.
 *
 * Uses Node's built-in `node:sqlite` module (Node 22+) — synchronous, no
 * native compilation required. Pass ':memory:' in tests to get a fresh
 * in-memory database with no file I/O side effects.
 *
 * @param {string} dbPath  File path or ':memory:'
 * @returns {import('node:sqlite').DatabaseSync}
 */
export function createDb(dbPath) {
  const db = new DatabaseSync(dbPath);

  // Enable foreign-key enforcement (off by default in SQLite)
  db.exec('PRAGMA foreign_keys = ON');

  // Create tables idempotently
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT    NOT NULL DEFAULT 'Untitled Document',
      content    TEXT    NOT NULL DEFAULT '',
      owner_id   INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS document_shares (
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
      PRIMARY KEY (document_id, user_id)
    );
  `);

  return db;
}
