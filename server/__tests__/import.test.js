/**
 * Tests for POST /api/documents/import
 *
 * Feature: collaborative-doc-editor, Property 6: file import round-trip
 * Validates: Requirements 6.1, 6.2, 6.3, 6.5
 *
 * Uses an in-memory mock db (no native better-sqlite3 binary required).
 */

import fc from 'fast-check';
import { createImportRouter } from '../routes/import.js';
import { createMockDb } from './helpers/mockDb.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRes() {
  const res = { statusCode: 200 };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

/**
 * Build a minimal mock multer file object.
 */
function makeFile({ name = 'notes.txt', content = 'hello world', size } = {}) {
  const buf = Buffer.from(content, 'utf8');
  return {
    originalname: name,
    mimetype: 'text/plain',
    buffer: buf,
    size: size ?? buf.byteLength,
  };
}

/**
 * Extract the business-logic handler from the import router's POST '/' route.
 * The route stack is: [authenticateToken, multer, businessHandler].
 * We skip the first two since authenticateToken is tested elsewhere and
 * multer is stubbed via req.file.
 */
function getBusinessHandler(db) {
  const router = createImportRouter(db);
  const routeLayer = router.stack.find((l) => l.route && l.route.path === '/');
  if (!routeLayer) throw new Error('Cannot find POST / route layer');
  const handlers = routeLayer.route.stack.map((l) => l.handle);
  // Last handler is the actual business logic
  return handlers[handlers.length - 1];
}

/**
 * Run the handler with a stubbed req.user (alice) and the provided file.
 */
function runHandler(db, file) {
  const handler = getBusinessHandler(db);
  const req = { user: { id: 1, username: 'alice' }, file };
  const res = mockRes();
  handler(req, res);
  return res;
}

// ---------------------------------------------------------------------------
// Example-based (unit) tests
// ---------------------------------------------------------------------------

describe('POST /api/documents/import — unit tests', () => {
  test('returns 400 when no file is uploaded', () => {
    const db = createMockDb();
    const res = runHandler(db, undefined);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('No file uploaded');
  });

  test('returns 400 for unsupported extension .pdf', () => {
    const db = createMockDb();
    const res = runHandler(db, makeFile({ name: 'report.pdf' }));
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(
      'Unsupported file type. Supported types: .txt, .md'
    );
  });

  test('returns 400 for unsupported extension .exe', () => {
    const db = createMockDb();
    const res = runHandler(db, makeFile({ name: 'virus.exe' }));
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(
      'Unsupported file type. Supported types: .txt, .md'
    );
  });

  test('returns 400 when file exceeds 10 MB', () => {
    const db = createMockDb();
    const oversized = makeFile({
      name: 'big.txt',
      content: 'x',
      size: 10 * 1024 * 1024 + 1,
    });
    const res = runHandler(db, oversized);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('File exceeds the 10 MB size limit');
  });

  test('accepts file exactly at 10 MB (boundary)', () => {
    const db = createMockDb();
    const exact = makeFile({ name: 'exact.txt', content: 'x', size: 10 * 1024 * 1024 });
    const res = runHandler(db, exact);
    expect(res.statusCode).toBe(201);
  });

  test('creates document from .txt file and returns 201 DocumentDetail', () => {
    const db = createMockDb();
    const res = runHandler(db, makeFile({ name: 'readme.txt', content: 'Hello, world!' }));

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      title: 'readme',
      content: 'Hello, world!',
      ownerUsername: 'alice',
      isOwner: true,
    });
    expect(typeof res.body.id).toBe('number');
    expect(typeof res.body.updatedAt).toBe('string');
  });

  test('creates document from .md file and returns 201 DocumentDetail', () => {
    const db = createMockDb();
    const res = runHandler(db, makeFile({ name: 'notes.md', content: '# Title\nSome content' }));

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      title: 'notes',
      content: '# Title\nSome content',
      ownerUsername: 'alice',
      isOwner: true,
    });
  });

  test('uses filename without extension as document title', () => {
    const db = createMockDb();
    const res = runHandler(db, makeFile({ name: 'my-document.txt', content: 'body' }));
    expect(res.body.title).toBe('my-document');
  });

  test('document is stored in db after import', () => {
    const db = createMockDb();
    const res = runHandler(db, makeFile({ name: 'stored.txt', content: 'persisted content' }));

    expect(res.statusCode).toBe(201);
    const docId = res.body.id;
    const saved = db.documents.find((d) => d.id === docId);
    expect(saved).toBeDefined();
    expect(saved.content).toBe('persisted content');
    expect(saved.title).toBe('stored');
  });
});

// ---------------------------------------------------------------------------
// Property-based tests (Property 6)
// ---------------------------------------------------------------------------
// Feature: collaborative-doc-editor, Property 6: file import round-trip

describe('POST /api/documents/import — property-based tests', () => {
  /**
   * **Validates: Requirements 6.1, 6.2, 6.5**
   *
   * For any text string uploaded as a .txt or .md file (within 10 MB),
   * the endpoint SHALL create a document whose content equals that text and
   * return 201 with the correct DocumentDetail shape.
   */
  test('P6a: any text content in a supported file produces a matching document (201)', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 1000 }),
        fc.constantFrom('.txt', '.md'),
        fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/),
        (content, ext, stem) => {
          const db = createMockDb();
          const buf = Buffer.from(content, 'utf8');
          const res = runHandler(db, {
            originalname: `${stem}${ext}`,
            buffer: buf,
            size: buf.byteLength,
          });

          expect(res.statusCode).toBe(201);
          expect(res.body.content).toBe(content);
          expect(res.body.title).toBe(stem);
          expect(res.body.isOwner).toBe(true);
          expect(res.body.ownerUsername).toBe('alice');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 6.3**
   *
   * Unsupported file extensions SHALL always return 400 with the correct message.
   */
  test('P6b: unsupported extensions always return 400 with the correct message', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('.pdf', '.exe', '.docx', '.png', '.csv', '.json', '.zip'),
        fc.string({ maxLength: 100 }),
        (ext, content) => {
          const db = createMockDb();
          const buf = Buffer.from(content, 'utf8');
          const res = runHandler(db, {
            originalname: `file${ext}`,
            buffer: buf,
            size: buf.byteLength,
          });

          expect(res.statusCode).toBe(400);
          expect(res.body.message).toBe(
            'Unsupported file type. Supported types: .txt, .md'
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 6.2**
   *
   * Files exceeding 10 MB SHALL always return 400 with the size-limit message.
   */
  test('P6c: files exceeding 10 MB always return 400 with the size-limit message', () => {
    const TEN_MB = 10 * 1024 * 1024;
    fc.assert(
      fc.property(
        fc.constantFrom('.txt', '.md'),
        fc.integer({ min: TEN_MB + 1, max: TEN_MB * 2 }),
        (ext, size) => {
          const db = createMockDb();
          const res = runHandler(db, {
            originalname: `big${ext}`,
            buffer: Buffer.alloc(1),
            size,
          });

          expect(res.statusCode).toBe(400);
          expect(res.body.message).toBe('File exceeds the 10 MB size limit');
        }
      ),
      { numRuns: 100 }
    );
  });
});
