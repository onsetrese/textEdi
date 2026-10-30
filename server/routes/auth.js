import { Router } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Creates an auth router using the provided db instance.
 * Using a factory function keeps the route testable with an in-memory db.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {import('express').Router}
 */
export function createAuthRouter(db) {
  const router = Router();

  /**
   * POST /login  (mounted at /api/auth, so full path is POST /api/auth/login)
   *
   * Body: { username, password }
   * Returns: { token, user: { id, username } }
   */
  router.post('/login', (req, res) => {
    const { username, password } = req.body ?? {};

    // Missing fields or wrong credentials all return the same 401 to avoid
    // leaking whether a username exists (per task spec: missing fields → 401)
    if (!username || !password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = db.prepare('SELECT id, username, password FROM users WHERE username = ?').get(username);

    if (!user || user.password !== password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const payload = { id: user.id, username: user.username };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      token,
      user: { id: user.id, username: user.username },
    });
  });

  return router;
}
