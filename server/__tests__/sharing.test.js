/**
 * Tests for sharing: POST/GET /api/documents/:id/shares.
 *
 * Feature: collaborative-doc-editor, Property 7: sharing round-trip and collaborator access
 * Feature: collaborative-doc-editor, Property 8: non-owner share control is forbidden
 *
 * Uses an in-memory mock db (no native better-sqlite3 binary required).
 */

import fc from 'fast-check';
import { createSharesRouter } from '../routes/shares.js';
import { createDocumentsRouter } from '../routes/documents.js';
import { requireDocumentOwner } from '../middleware/requireDocumentOwner.js';
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

/** Last (business) handler for a method + path on a router. */
function getHandler(router, method, routePath) {
  const routeLayer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
  if (!routeLayer) {
    throw new Error(`Cannot find ${method.toUpperCase()} ${routePath} route layer`);
  }
  const handlers = routeLayer.route.stack.map((l) => l.handle);
  return handlers[handlers.length - 1];
}

function seedDoc(db, { title, content = '', ownerId }) {
  const id = db.documents.length
    ? Math.max(...db.documents.map((d) => d.id)) + 1
    : 1;
  const now = new Date().toISOString();
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

// POST /:id/shares business handler — expects req.document + req.user set.
function runPostShare(db, user, doc, body) {
  const handler = getHandler(createSharesRouter(db), 'post', '/:id/shares');
  const req = { user, params: { id: String(doc.id) }, document: doc, body };
  const res = mockRes();
  handler(req, res);
  return res;
}

// GET /:id/shares business handler.
function runGetShares(db, user, doc) {
  const handler = getHandler(createSharesRouter(db), 'get', '/:id/shares');
  const req = { user, params: { id: String(doc.id) }, document: doc };
  const res = mockRes();
  handler(req, res);
  return res;
}

// GET /api/documents (list) via documents router.
function runList(db, user) {
  const handler = getHandler(createDocumentsRouter(db), 'get', '/');
  const req = { user };
  const res = mockRes();
  handler(req, res);
  return res;
}

// GET /api/documents/:id via documents router (business handler, req.document set).
function runGetDoc(db, user, doc) {
  const handler = getHandler(createDocumentsRouter(db), 'get', '/:id');
  const req = { user, params: { id: String(doc.id) }, document: doc };
  const res = mockRes();
  handler(req, res);
  return res;
}

// PUT /api/documents/:id via documents router (business handler, req.document set).
function runPutDoc(db, user, doc, body) {
  const handler = getHandler(createDocumentsRouter(db), 'put', '/:id');
  const req = { user, params: { id: String(doc.id) }, document: doc, body };
  const res = mockRes();
  handler(req, res);
  return res;
}

// Invoke the requireDocumentOwner middleware directly.
function runOwnerMiddleware(user, doc) {
  const req = { user, document: doc };
  const res = mockRes();
  let nextCalled = false;
  requireDocumentOwner(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

const alice = { id: 1, username: 'alice' };
const bob = { id: 2, username: 'bob' };

// ---------------------------------------------------------------------------
// Example-based (unit) tests
// ---------------------------------------------------------------------------

describe('POST /api/documents/:id/shares — unit tests', () => {
  test('sharing with a non-existent username returns 404 User not found', () => {
    const db = createMockDb();
    const docId = seedDoc(db, { title: 'Doc', ownerId: alice.id });
    const doc = db.documents.find((d) => d.id === docId);
    const res = runPostShare(db, alice, doc, { username: 'ghost' });
    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe('User not found');
  });

  test('missing username field returns 400', () => {
    const db = createMockDb();
    const docId = seedDoc(db, { title: 'Doc', ownerId: alice.id });
    const doc = db.documents.find((d) => d.id === docId);
    const res = runPostShare(db, alice, doc, {});
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Field 'username' is required");
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe('sharing — property-based tests', () => {
  // Feature: collaborative-doc-editor, Property 7: sharing round-trip and collaborator access
  /**
   * **Validates: Requirements 7.2, 7.4**
   *
   * Sharing alice's document with bob (a) adds bob to the collaborator list,
   * (b) makes the doc appear in bob's GET /api/documents list, and
   * (c) lets bob GET and PUT the document.
   */
  test('P7: sharing grants bob visibility and read/write access', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (newTitle, newContent) => {
        const db = createMockDb();
        const docId = seedDoc(db, { title: 'shared-doc', ownerId: alice.id });
        const doc = db.documents.find((d) => d.id === docId);

        // (a) alice shares with bob → bob appears in collaborator list.
        const shareRes = runPostShare(db, alice, doc, { username: 'bob' });
        expect(shareRes.statusCode).toBe(200);
        expect(shareRes.body.some((c) => c.username === 'bob')).toBe(true);

        // Confirm via GET /:id/shares as owner.
        const listShares = runGetShares(db, alice, doc);
        expect(listShares.statusCode).toBe(200);
        expect(listShares.body.some((c) => c.username === 'bob')).toBe(true);

        // (b) document appears in bob's document list.
        const bobList = runList(db, bob);
        expect(bobList.statusCode).toBe(200);
        expect(bobList.body.some((d) => d.id === docId)).toBe(true);

        // (c) bob can GET the document (share grant present).
        const bobDoc = db.documents.find((d) => d.id === docId);
        const bobGet = runGetDoc(db, bob, bobDoc);
        expect(bobGet.statusCode).toBe(200);
        expect(bobGet.body.isOwner).toBe(false);

        // ...and bob can PUT it (round-trips title/content).
        const bobPut = runPutDoc(db, bob, bobDoc, {
          title: newTitle,
          content: newContent,
        });
        expect(bobPut.statusCode).toBe(200);
        expect(bobPut.body.title).toBe(newTitle);
        expect(bobPut.body.content).toBe(newContent);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: collaborative-doc-editor, Property 8: non-owner share control is forbidden
  /**
   * **Validates: Requirements 7.5, 7.6**
   *
   * For a document owned by alice, a non-owner (bob) is forbidden (403) from
   * both POST /:id/shares and GET /:id/shares. Enforced by requireDocumentOwner.
   */
  test('P8: non-owner is forbidden from managing shares (403)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), (rawId) => {
        const db = createMockDb();
        // alice owns the document.
        const doc = {
          id: rawId,
          title: 't',
          content: '',
          owner_id: alice.id,
          created_at: 'now',
          updated_at: 'now',
        };

        // requireDocumentOwner (runs after requireDocumentAccess set req.document)
        // must reject bob for BOTH share operations.
        const { res: postRes, nextCalled: postNext } = runOwnerMiddleware(bob, doc);
        expect(postRes.statusCode).toBe(403);
        expect(postRes.body.message).toBe('Forbidden');
        expect(postNext).toBe(false);

        const { res: getRes, nextCalled: getNext } = runOwnerMiddleware(bob, doc);
        expect(getRes.statusCode).toBe(403);
        expect(getRes.body.message).toBe('Forbidden');
        expect(getNext).toBe(false);

        // Sanity: the owner (alice) passes the same middleware.
        const { nextCalled: ownerNext } = runOwnerMiddleware(alice, doc);
        expect(ownerNext).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
