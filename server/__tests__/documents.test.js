/**
 * Tests for document CRUD: GET/POST/PUT /api/documents(/:id).
 *
 * Feature: collaborative-doc-editor, Property 3: document creation invariants
 * Feature: collaborative-doc-editor, Property 4: document update round-trip
 * Feature: collaborative-doc-editor, Property 5: document list completeness and shape
 *
 * Uses an in-memory mock db (no native better-sqlite3 binary required).
 * Route handlers are extracted from the router stack and invoked directly with
 * stubbed req.user / req.document, bypassing auth/access middleware which are
 * covered in auth.test.js and sharing.test.js.
 */

import fc from 'fast-check';
import { createDocumentsRouter } from '../routes/documents.js';
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
 * Return the LAST handler (business logic) for a given method + path on the
 * documents router. Middleware layers (requireDocumentAccess) are skipped.
 */
function getHandler(db, method, routePath) {
  const router = createDocumentsRouter(db);
  const routeLayer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
  if (!routeLayer) {
    throw new Error(`Cannot find ${method.toUpperCase()} ${routePath} route layer`);
  }
  const handlers = routeLayer.route.stack.map((l) => l.handle);
  return handlers[handlers.length - 1];
}

const seededUsers = [
  { username: 'alice', id: 1 },
  { username: 'bob', id: 2 },
];

/** Seed a document directly into the mock db arrays. */
function seedDoc(db, { title, content = '', ownerId, updatedAt }) {
  const id = db.documents.length
    ? Math.max(...db.documents.map((d) => d.id)) + 1
    : 1;
  const now = updatedAt ?? new Date().toISOString();
  db.documents.push({
    id,
    title,
    content,
    owner_id: ownerId,
    created_at: now,
    updated_at: now,
  });
  return id;
}

// POST /api/documents — create
function runCreate(db, user, body = {}) {
  const handler = getHandler(db, 'post', '/');
  const req = { user, body };
  const res = mockRes();
  handler(req, res);
  return res;
}

// GET /api/documents/:id — the business handler expects req.document set.
function runGetById(db, user, doc) {
  const handler = getHandler(db, 'get', '/:id');
  const req = { user, params: { id: String(doc.id) }, document: doc };
  const res = mockRes();
  handler(req, res);
  return res;
}

// PUT /api/documents/:id — business handler expects req.document set.
function runUpdate(db, user, doc, body) {
  const handler = getHandler(db, 'put', '/:id');
  const req = { user, params: { id: String(doc.id) }, document: doc, body };
  const res = mockRes();
  handler(req, res);
  return res;
}

// GET /api/documents — list
function runList(db, user) {
  const handler = getHandler(db, 'get', '/');
  const req = { user };
  const res = mockRes();
  handler(req, res);
  return res;
}

// ---------------------------------------------------------------------------
// Example-based (unit) tests
// ---------------------------------------------------------------------------

describe('POST /api/documents — unit tests', () => {
  test('creates a document with default title and empty content (201)', () => {
    const db = createMockDb();
    const res = runCreate(db, { id: 1, username: 'alice' });
    expect(res.statusCode).toBe(201);
    expect(res.body.title).toBe('Untitled Document');
    expect(res.body.content).toBe('');
    expect(res.body.isOwner).toBe(true);
    expect(res.body.ownerUsername).toBe('alice');
  });
});

describe('PUT /api/documents/:id — unit tests', () => {
  test('returns 400 when no fields are provided', () => {
    const db = createMockDb();
    const docId = seedDoc(db, { title: 'Doc', ownerId: 1 });
    const doc = db.documents.find((d) => d.id === docId);
    const res = runUpdate(db, { id: 1, username: 'alice' }, doc, {});
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('No fields to update');
  });
});

describe('GET /api/documents — unit tests', () => {
  test('returns empty list when user has no documents', () => {
    const db = createMockDb();
    const res = runList(db, { id: 1, username: 'alice' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe('document creation — property-based tests', () => {
  // Feature: collaborative-doc-editor, Property 3: document creation invariants
  /**
   * **Validates: Requirements 2.1, 2.3, 2.4**
   *
   * For any seeded user, POST /api/documents produces a record with the default
   * title, empty content, the creating user as owner (isOwner true), and the
   * document is retrievable via GET /api/documents/:id.
   */
  test('P3: created documents satisfy the creation invariants and are retrievable', () => {
    fc.assert(
      fc.property(fc.constantFrom(...seededUsers), (user) => {
        const db = createMockDb();
        const res = runCreate(db, { id: user.id, username: user.username });

        expect(res.statusCode).toBe(201);
        expect(res.body.title).toBe('Untitled Document');
        expect(res.body.content).toBe('');
        expect(res.body.isOwner).toBe(true);
        expect(res.body.ownerUsername).toBe(user.username);

        // Owner id matches in the underlying store.
        const stored = db.documents.find((d) => d.id === res.body.id);
        expect(stored).toBeDefined();
        expect(stored.owner_id).toBe(user.id);

        // Retrievable via GET /:id (business handler receives req.document).
        const getRes = runGetById(db, { id: user.id, username: user.username }, stored);
        expect(getRes.statusCode).toBe(200);
        expect(getRes.body.id).toBe(res.body.id);
        expect(getRes.body.title).toBe('Untitled Document');
        expect(getRes.body.content).toBe('');
        expect(getRes.body.isOwner).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

describe('document update — property-based tests', () => {
  // Feature: collaborative-doc-editor, Property 4: document update round-trip
  /**
   * **Validates: Requirements 2.2, 5.1, 5.3**
   *
   * For any title string and any HTML content string, saving via PUT and then
   * retrieving via GET returns the exact same title and content.
   */
  test('P4: PUT then GET returns identical title and content', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (title, content) => {
        const db = createMockDb();
        const docId = seedDoc(db, { title: 'orig', content: 'orig', ownerId: 1 });
        let doc = db.documents.find((d) => d.id === docId);

        const putRes = runUpdate(db, { id: 1, username: 'alice' }, doc, {
          title,
          content,
        });
        expect(putRes.statusCode).toBe(200);
        expect(putRes.body.title).toBe(title);
        expect(putRes.body.content).toBe(content);

        // Re-fetch fresh document row for the GET handler.
        doc = db.documents.find((d) => d.id === docId);
        const getRes = runGetById(db, { id: 1, username: 'alice' }, doc);
        expect(getRes.statusCode).toBe(200);
        expect(getRes.body.title).toBe(title);
        expect(getRes.body.content).toBe(content);
      }),
      { numRuns: 100 }
    );
  });
});

describe('document list — property-based tests', () => {
  // Feature: collaborative-doc-editor, Property 5: document list completeness and shape
  /**
   * **Validates: Requirements 3.1, 3.4**
   *
   * For any combination of owned + shared documents, GET /api/documents returns
   * exactly those documents with correct title, ownerUsername, updatedAt, and
   * isOwner fields.
   */
  test('P5: list returns exactly owned + shared docs with correct shape', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        (ownedCount, sharedCount) => {
          const db = createMockDb();
          const alice = { id: 1, username: 'alice' };

          // alice-owned documents
          const ownedIds = [];
          for (let i = 0; i < ownedCount; i++) {
            ownedIds.push(seedDoc(db, { title: `owned-${i}`, ownerId: alice.id }));
          }

          // bob-owned documents shared with alice
          const sharedIds = [];
          for (let i = 0; i < sharedCount; i++) {
            const id = seedDoc(db, { title: `shared-${i}`, ownerId: 2 });
            db.shares.push({ document_id: id, user_id: alice.id });
            sharedIds.push(id);
          }

          // A document alice can NOT see (bob-owned, not shared).
          seedDoc(db, { title: 'hidden', ownerId: 2 });

          const res = runList(db, alice);
          expect(res.statusCode).toBe(200);

          const returnedIds = res.body.map((d) => d.id).sort((a, b) => a - b);
          const expectedIds = [...ownedIds, ...sharedIds].sort((a, b) => a - b);
          expect(returnedIds).toEqual(expectedIds);

          for (const entry of res.body) {
            expect(typeof entry.title).toBe('string');
            expect(typeof entry.ownerUsername).toBe('string');
            expect(typeof entry.updatedAt).toBe('string');
            expect(typeof entry.isOwner).toBe('boolean');

            if (ownedIds.includes(entry.id)) {
              expect(entry.isOwner).toBe(true);
              expect(entry.ownerUsername).toBe('alice');
            } else {
              expect(entry.isOwner).toBe(false);
              expect(entry.ownerUsername).toBe('bob');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
