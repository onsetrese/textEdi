/**
 * Middleware factory that checks whether the authenticated user is the OWNER
 * of the requested document.
 *
 * Must be chained AFTER `requireDocumentAccess` (relies on `req.document`
 * already being set).
 *
 * On success:       calls `next()`
 * On access denied: 403 { message: "Forbidden" }
 *
 * @returns {import('express').RequestHandler}
 */
export function requireDocumentOwner(req, res, next) {
  if (!req.document) {
    // Middleware ordering error — requireDocumentAccess should run first
    return res.status(403).json({ message: 'Forbidden' });
  }

  if (req.document.owner_id !== req.user.id) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  return next();
}
