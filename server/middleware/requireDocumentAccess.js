/**
 * Middleware factory that checks whether the authenticated user has access
 * to the requested document (owner OR collaborator).
 *
 * On success, attaches the document row to `req.document` and calls `next()`.
 * On missing document: 404 { message: "Document not found" }
 * On access denied:    403 { message: "Forbidden" }
 *
 * Requires `authenticateToken` to have run first (needs `req.user.id`).
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {import('express').RequestHandler}
 */
export function createRequireDocumentAccess(db) {
  return function requireDocumentAccess(req, res, next) {
    const docId = parseInt(req.params.id, 10);
    if (Number.isNaN(docId)) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const document = db
      .prepare('SELECT * FROM documents WHERE id = ?')
      .get(docId);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const userId = req.user.id;

    // Owner always has access
    if (document.owner_id === userId) {
      req.document = document;
      return next();
    }

    // Check for a share grant
    const share = db
      .prepare(
        'SELECT 1 FROM document_shares WHERE document_id = ? AND user_id = ?'
      )
      .get(docId, userId);

    if (!share) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    req.document = document;
    return next();
  };
}
