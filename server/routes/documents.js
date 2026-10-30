import { Router } from 'express';
import { authenticateToken } from '../middleware/authenticateToken.js';
import { createRequireDocumentAccess } from '../middleware/requireDocumentAccess.js';
import { requireDocumentOwner } from '../middleware/requireDocumentOwner.js';

/**
 * Creates a documents router using the provided db instance.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {import('express').Router}
 */
export function createDocumentsRouter(db) {
  const router = Router();
  const requireDocumentAccess = createRequireDocumentAccess(db);

  // All document routes require authentication
  router.use(authenticateToken);

  // -------------------------------------------------------------------------
  // GET /api/documents
  // Returns all documents owned by or shared with the authenticated user.
  // Response: DocumentSummary[]
  // -------------------------------------------------------------------------
  router.get('/', (req, res) => {
    const userId = req.user.id;

    try {
      const rows = db
        .prepare(
          `SELECT
             d.id,
             d.title,
             d.owner_id,
             d.updated_at,
             u.username AS owner_username
           FROM documents d
           JOIN users u ON u.id = d.owner_id
           WHERE d.owner_id = ?
              OR EXISTS (
                   SELECT 1 FROM document_shares ds
                   WHERE ds.document_id = d.id
                     AND ds.user_id = ?
                 )
           ORDER BY d.updated_at DESC`
        )
        .all(userId, userId);

      const summaries = rows.map((row) => ({
        id: row.id,
        title: row.title,
        ownerUsername: row.owner_username,
        isOwner: row.owner_id === userId,
        updatedAt: row.updated_at,
      }));

      return res.status(200).json(summaries);
    } catch {
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/documents
  // Creates a new document owned by the authenticated user.
  // Body: { title? }  — title defaults to "Untitled Document"
  // Response: DocumentDetail
  // -------------------------------------------------------------------------
  router.post('/', (req, res) => {
    const userId = req.user.id;
    const title = (req.body?.title ?? 'Untitled Document') || 'Untitled Document';

    try {
      const result = db
        .prepare(
          `INSERT INTO documents (title, content, owner_id)
           VALUES (?, '', ?)`
        )
        .run(title, userId);

      const document = db
        .prepare(
          `SELECT d.id, d.title, d.content, d.owner_id, d.updated_at,
                  u.username AS owner_username
           FROM documents d
           JOIN users u ON u.id = d.owner_id
           WHERE d.id = ?`
        )
        .get(result.lastInsertRowid);

      return res.status(201).json({
        id: document.id,
        title: document.title,
        content: document.content,
        ownerUsername: document.owner_username,
        isOwner: true,
        updatedAt: document.updated_at,
      });
    } catch {
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/documents/:id
  // Returns a full document record (DocumentDetail).
  // Requires owner or collaborator access.
  // -------------------------------------------------------------------------
  router.get('/:id', requireDocumentAccess, (req, res) => {
    const userId = req.user.id;
    const doc = req.document;

    try {
      const owner = db
        .prepare('SELECT username FROM users WHERE id = ?')
        .get(doc.owner_id);

      return res.status(200).json({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        ownerUsername: owner.username,
        isOwner: doc.owner_id === userId,
        updatedAt: doc.updated_at,
      });
    } catch {
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // PUT /api/documents/:id
  // Updates title and/or content, bumps updated_at.
  // Requires owner or collaborator access.
  // Body: { title?, content? }
  // Response: DocumentDetail
  // -------------------------------------------------------------------------
  router.put('/:id', requireDocumentAccess, (req, res) => {
    const userId = req.user.id;
    const doc = req.document;
    const { title, content } = req.body ?? {};

    // At least one field must be provided
    if (title === undefined && content === undefined) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    try {
      const newTitle = title !== undefined ? title : doc.title;
      const newContent = content !== undefined ? content : doc.content;

      db.prepare(
        `UPDATE documents
         SET title = ?, content = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(newTitle, newContent, doc.id);

      const updated = db
        .prepare(
          `SELECT d.id, d.title, d.content, d.owner_id, d.updated_at,
                  u.username AS owner_username
           FROM documents d
           JOIN users u ON u.id = d.owner_id
           WHERE d.id = ?`
        )
        .get(doc.id);

      return res.status(200).json({
        id: updated.id,
        title: updated.title,
        content: updated.content,
        ownerUsername: updated.owner_username,
        isOwner: updated.owner_id === userId,
        updatedAt: updated.updated_at,
      });
    } catch {
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
}
