/**
 * Tests for authentication: POST /api/auth/login and authenticateToken middleware.
 *
 * Feature: collaborative-doc-editor, Property 1: authentication succeeds for all valid users
 * Feature: collaborative-doc-editor, Property 2: protected routes reject unauthenticated requests
 *
 * Uses an in-memory mock db (no native better-sqlite3 binary required).
 */

// Must be set before any module reads it for JWT signing/verification.
process.env.JWT_SECRET = 'test-secret';

import fc from 'fast-check';
import jwt from 'jsonwebtoken';
import { createAuthRouter } from '../routes/auth.js';
import { authenticateToken } from '../middleware/authenticateToken.js';
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
 * Extract the login handler from the auth router's POST '/login' route.
 * The stack contains only the business handler.
 */
function getLoginHandler(db) {
  const router = createAuthRouter(db);
  const routeLayer = router.stack.find(
    (l) => l.route && l.route.path === '/login'
  );
  if (!routeLayer) throw new Error('Cannot find POST /login route layer');
  const handlers = routeLayer.route.stack.map((l) => l.handle);
  return handlers[handlers.length - 1];
}

function runLogin(db, body) {
  const handler = getLoginHandler(db);
  const req = { body };
  const res = mockRes();
  handler(req, res);
  return res;
}

/**
 * Invoke the authenticateToken middleware with the given headers.
 * Returns { res, nextCalled, req }.
 */
function runAuthMiddleware(headers) {
  const req = { headers };
  const res = mockRes();
  let nextCalled = false;
  authenticateToken(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled, req };
}

// The seeded users (mirrors createMockDb seed data).
const seededUsers = [
  { username: 'alice', password: 'password1', id: 1 },
  { username: 'bob', password: 'password2', id: 2 },
];

// Descriptions of protected routes (for Property 2 coverage clarity).
const protectedRoutes = [
  'GET /api/documents',
  'POST /api/documents',
  'GET /api/documents/:id',
  'PUT /api/documents/:id',
  'POST /api/documents/import',
  'POST /api/documents/:id/shares',
  'GET /api/documents/:id/shares',
  'GET /api/users',
];

// ---------------------------------------------------------------------------
// Example-based (unit) tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/login — unit tests', () => {
  test('valid credentials return 200 with token and user', () => {
    const db = createMockDb();
    const res = runLogin(db, { username: 'alice', password: 'password1' });
    expect(res.statusCode).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toEqual({ id: 1, username: 'alice' });
  });

  test('wrong password returns 401', () => {
    const db = createMockDb();
    const res = runLogin(db, { username: 'alice', password: 'wrong' });
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  test('unknown username returns 401', () => {
    const db = createMockDb();
    const res = runLogin(db, { username: 'nobody', password: 'x' });
    expect(res.statusCode).toBe(401);
  });

  test('missing password returns 401', () => {
    const db = createMockDb();
    const res = runLogin(db, { username: 'alice' });
    expect(res.statusCode).toBe(401);
  });
});

describe('authenticateToken middleware — unit tests', () => {
  test('missing Authorization header returns 401 and does not call next', () => {
    const { res, nextCalled } = runAuthMiddleware({});
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Unauthorized');
    expect(nextCalled).toBe(false);
  });

  test('malformed token returns 401', () => {
    const { res, nextCalled } = runAuthMiddleware({
      authorization: 'Bearer not-a-real-jwt',
    });
    expect(res.statusCode).toBe(401);
    expect(nextCalled).toBe(false);
  });

  test('valid token calls next and attaches req.user', () => {
    const token = jwt.sign({ id: 1, username: 'alice' }, process.env.JWT_SECRET);
    const { res, nextCalled, req } = runAuthMiddleware({
      authorization: `Bearer ${token}`,
    });
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(req.user).toMatchObject({ id: 1, username: 'alice' });
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe('authentication — property-based tests', () => {
  // Feature: collaborative-doc-editor, Property 1: authentication succeeds for all valid users
  /**
   * **Validates: Requirements 1.2**
   *
   * For every seeded user, logging in with the correct password returns 200
   * and a JWT that verifies with JWT_SECRET and decodes to { id, username }.
   */
  test('P1: valid users always receive a verifiable JWT (200)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...seededUsers), (user) => {
        const db = createMockDb();
        const res = runLogin(db, {
          username: user.username,
          password: user.password,
        });

        expect(res.statusCode).toBe(200);
        expect(typeof res.body.token).toBe('string');

        const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
        expect(decoded.id).toBe(user.id);
        expect(decoded.username).toBe(user.username);
        expect(res.body.user).toEqual({ id: user.id, username: user.username });
      }),
      { numRuns: 100 }
    );
  });

  // Feature: collaborative-doc-editor, Property 2: protected routes reject unauthenticated requests
  /**
   * **Validates: Requirements 1.4**
   *
   * For every protected route, a request with a missing or invalid token is
   * rejected with 401 by the authenticateToken middleware (never calls next).
   */
  test('P2: missing or invalid tokens always yield 401 on protected routes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...protectedRoutes),
        // Either omit the header entirely or supply a bad bearer token.
        fc.oneof(
          fc.constant(undefined),
          fc.string().map((s) => `Bearer ${s}`),
          fc.string() // header without Bearer prefix
        ),
        (_route, authValue) => {
          const headers = authValue === undefined ? {} : { authorization: authValue };
          const { res, nextCalled } = runAuthMiddleware(headers);

          expect(res.statusCode).toBe(401);
          expect(res.body.message).toBe('Unauthorized');
          expect(nextCalled).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
