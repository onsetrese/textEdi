import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createDb } from './db/schema.js';
import { seedDb } from './db/seed.js';
import { createAuthRouter } from './routes/auth.js';
import { createDocumentsRouter } from './routes/documents.js';
import { createImportRouter } from './routes/import.js';
import { createSharesRouter } from './routes/shares.js';
import { createUsersRouter } from './routes/users.js';

// ---------------------------------------------------------------------------
// Database initialisation
// ---------------------------------------------------------------------------
// When running under Jest (NODE_ENV=test), tests supply their own db via the
// createApp factory.  In normal operation we use the file-based singleton.
// ---------------------------------------------------------------------------

/**
 * Creates and configures the Express application.
 *
 * @param {import('better-sqlite3').Database} [db] - Optional db instance for testing.
 *   When omitted the app opens (or creates) the file-based SQLite database and seeds it.
 * @returns {import('express').Application}
 */
export function createApp(db) {
  if (!db) {
    const dbPath = process.env.DB_PATH || 'data.db';
    db = createDb(dbPath);
    seedDb(db);
  }

  const app = express();

  // Allow the Vite dev origin (configurable via CLIENT_ORIGIN). Defaults to
  // the standard Vite dev server port.
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  app.use(cors({ origin: clientOrigin }));
  app.use(express.json());

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------
  app.use('/api/auth', createAuthRouter(db));
  // Import route MUST be registered before the parameterised documents router
  // so that /api/documents/import is not swallowed by /api/documents/:id.
  app.use('/api/documents/import', createImportRouter(db));
  app.use('/api/documents', createDocumentsRouter(db));
  app.use('/api/documents', createSharesRouter(db));
  app.use('/api/users', createUsersRouter(db));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // ---------------------------------------------------------------------------
  // 404 handler — must come after all route registrations
  // ---------------------------------------------------------------------------
  app.use((_req, res) => {
    res.status(404).json({ message: 'Not found' });
  });

  // ---------------------------------------------------------------------------
  // Global error-handling middleware — Express detects 4-param signature
  // ---------------------------------------------------------------------------
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err); // log to console only, never to HTTP response
    const status = err.status ?? err.statusCode ?? 500;
    const message = err.message ?? 'Internal server error';
    res.status(status).json({ message });
  });

  return app;
}

// Default export: a ready-to-use app instance (used by index.js)
export default createApp();
