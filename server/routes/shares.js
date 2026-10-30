import { Router } from 'express';
import { authenticateToken } from '../middleware/authenticateToken.js';
import { createRequireDocumentAccess } from '../middleware/requireDocumentAccess.js';
import { requireDocumentOwner } from '../middleware/requireDocumentOwner.js';

/**
 * Creates a shares router using the provided db instance.
 *
 * Mounts on /api/documents and handles:
 *   POST /:id/shares  — owner-only; grant access to a user by username
 *   GET  /:id/shares  — owner-only; list collaborators
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {import('express').Router}
 */
export function createSharesRouter(db) {
  const router = Router();
  const requireDocumentAccess = createRequireDocumentAccess(db);

  // All share routes require authentication
  router.use(authenticateToken);

  // -------------------------------------------------------------------------
  // POST /api/documents/:id/shares
  // Grants access to the document for a given username.
  // Requires owner access.
  // Body: { username }
  // Response: ShareEntry[] (updated collaborator list)
  // -------------------------------------------------------------------------
  router.post('/:id/shares', requireDocumentAccess, requireDocumentOwner, (req, res) => {
    const { username } = req.body ?? {};

    if (!username) {
      return res.status(400).json({ message: "Field 'username' is required" });
    }

    try {
      // Look up the user by username
      const user = db
        .prepare('SELECT id, username FROM users WHERE username = ?')
        .get(username);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const docId = req.document.id;

      // Insert share grant, ignore if already exists
      db.prepare(
        'INSERT OR IGNORE INTO document_shares (document_id, user_id) VALUES (?, ?)'
      ).run(docId, user.id);

      // Return updated collaborator list (NOT including the owner)
      const collaborators = db
        .prepare(
          `SELECT u.id AS userId, u.username
           FROM document_shares ds
           JOIN users u ON u.id = ds.user_id
           WHERE ds.document_id = ?`
        )
        .all(docId);

      return res.status(200).json(collaborators);
    } catch {
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/documents/:id/shares
  // Returns all collaborators for the document (NOT including the owner).
  // Requires owner access.
  // Response: ShareEntry[]
  // -------------------------------------------------------------------------
  router.get('/:id/shares', requireDocumentAccess, requireDocumentOwner, (req, res) => {
    const docId = req.document.id;

    try {
      const collaborators = db
        .prepare(
          `SELECT u.id AS userId, u.username
           FROM document_shares ds
           JOIN users u ON u.id = ds.user_id
           WHERE ds.document_id = ?`
        )
        .all(docId);

      return res.status(200).json(collaborators);
    } catch {
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
}
