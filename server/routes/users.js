import { Router } from 'express';
import { authenticateToken } from '../middleware/authenticateToken.js';

/**
 * Creates a users router using the provided db instance.
 *
 * Mounts on /api/users and handles:
 *   GET /  — auth required; returns all users (id + username, no passwords)
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {import('express').Router}
 */
export function createUsersRouter(db) {
  const router = Router();

  // -------------------------------------------------------------------------
  // GET /api/users
  // Returns all users as { id, username }[] (passwords excluded).
  // Auth required.
  // -------------------------------------------------------------------------
  router.get('/', authenticateToken, (req, res) => {
    try {
      const users = db
        .prepare('SELECT id, username FROM users ORDER BY username ASC')
        .all();

      return res.status(200).json(users);
    } catch {
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
}
