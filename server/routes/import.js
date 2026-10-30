import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticateToken } from '../middleware/authenticateToken.js';

// ---------------------------------------------------------------------------
// Multer configuration — store files in memory (no disk I/O)
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  // No limits set here; we enforce the 10 MB cap manually after upload so we
  // can return a consistent JSON error rather than relying on multer's error.
});

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB in bytes
const SUPPORTED_EXTENSIONS = ['.txt', '.md'];

/**
 * Creates the import router using the provided db instance.
 *
 * POST /  (mounted at /api/documents/import)
 *   - Auth required
 *   - Accepts a multipart upload with a single file field named "file"
 *   - Validates extension (.txt, .md) and size (≤ 10 MB)
 *   - Creates a new document and returns a DocumentDetail (201)
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {import('express').Router}
 */
export function createImportRouter(db) {
  const router = Router();

  router.post('/', authenticateToken, upload.single('file'), (req, res) => {
    const userId = req.user.id;

    // No file was attached
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const originalName = req.file.originalname ?? '';
    const ext = path.extname(originalName).toLowerCase();

    // Validate file extension
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return res
        .status(400)
        .json({ message: 'Unsupported file type. Supported types: .txt, .md' });
    }

    // Validate file size
    if (req.file.size > MAX_FILE_SIZE) {
      return res
        .status(400)
        .json({ message: 'File exceeds the 10 MB size limit' });
    }

    // Derive document title from filename (strip extension)
    const title = path.basename(originalName, ext) || 'Untitled Document';

    // Decode buffer to UTF-8 string
    const content = req.file.buffer.toString('utf8');

    try {
      const result = db
        .prepare(
          `INSERT INTO documents (title, content, owner_id)
           VALUES (?, ?, ?)`
        )
        .run(title, content, userId);

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

  return router;
}
