import jwt from 'jsonwebtoken';

/**
 * Express middleware that validates a Bearer JWT from the Authorization header.
 *
 * On success, attaches the decoded payload ({ id, username }) to `req.user`
 * and calls `next()`.
 *
 * On missing or invalid token, responds with 401 { message: "Unauthorized" }.
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}
