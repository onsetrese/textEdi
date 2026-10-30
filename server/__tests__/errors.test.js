/**
 * Tests for error response shape across the API.
 *
 * Feature: collaborative-doc-editor, Property 9: error responses are always human-readable JSON
 *
 * Uses an in-memory mock db (no native better-sqlite3 binary required).
 * Each error-triggering scenario invokes the relevant handler/middleware and
 * asserts the response body is valid JSON with a non-empty `message` string and
 * NO `stack` key.
 */

process.env.JWT_SECRET = 'test-secret';

import fc from 'fast-check';
import { createAuthRouter } from '../routes/auth.js';
import { createSharesRouter } from '../routes/shares.js';
import { createImportRouter } from '../routes/import.js';
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

function lastHandler(router, method, routePath) {
  const routeLayer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
  if (!routeLayer) {
    throw new Error(`Cannot find ${method.toUpperCase()} ${routePath} route layer`);
  }
  const handlers = routeLayer.route.stack.map((l) => l.handle);
  return handlers[handlers.length - 1];
}

const alice = { id: 1, username: 'alice' };
const bob = { id: 2, username: 'bob' };

/**
 * Error-triggering scenarios. Each returns a mock res after invoking the
 * relevant handler/middleware, along with the expected status code.
 */
const scenarios = [
  {
    name: 'bad auth (missing token) -> 401',
    expectedStatus: 401,
    run: () => {
      const req = { headers: {} };
      const res = mockRes();
      authenticateToken(req, res, () => { });
      return res;
    },
  },
  {
    name: 'bad auth (invalid token) -> 401',
    expectedStatus: 401,
    run: () => {
      const req = { headers: { authorization: 'Bearer garbage.token.value' } };
      const res = mockRes();
      authenticateToken(req, res, () => { });
      return res;
    },
  },
  {
    name: 'wrong login credentials -> 401',
    expectedStatus: 401,
    run: () => {
      const db = createMockDb();
      const handler = lastHandler(createAuthRouter(db), 'post', '/login');
      const req = { body: { username: 'alice', password: 'nope' } };
      const res = mockRes();
      handler(req, res);
      return res;
    },
  },
  {
    name: 'non-owner share (user not found for bob-owned lookup) -> 404',
    expectedStatus: 404,
    run: () => {
      // alice owns the doc, shares with a non-existent username -> 404.
      const db = createMockDb();
      const doc = {
        id: 1,
        title: 't',
        content: '',
        owner_id: alice.id,
        created_at: 'now',
        updated_at: 'now',
      };
      const handler = lastHandler(createSharesRouter(db), 'post', '/:id/shares');
      const req = { user: alice, params: { id: '1' }, document: doc, body: { username: 'ghost' } };
      const res = mockRes();
      handler(req, res);
      return res;
    },
  },
  {
    name: 'missing username field on share -> 400',
    expectedStatus: 400,
    run: () => {
      const db = createMockDb();
      const doc = {
        id: 1,
        title: 't',
        content: '',
        owner_id: alice.id,
        created_at: 'now',
        updated_at: 'now',
      };
      const handler = lastHandler(createSharesRouter(db), 'post', '/:id/shares');
      const req = { user: alice, params: { id: '1' }, document: doc, body: {} };
      const res = mockRes();
      handler(req, res);
      return res;
    },
  },
  {
    name: 'unsupported file type on import -> 400',
    expectedStatus: 400,
    run: () => {
      const db = createMockDb();
      const handler = lastHandler(createImportRouter(db), 'post', '/');
      const buf = Buffer.from('data', 'utf8');
      const req = {
        user: alice,
        file: { originalname: 'bad.pdf', buffer: buf, size: buf.byteLength },
      };
      const res = mockRes();
      handler(req, res);
      return res;
    },
  },
  {
    name: 'no file uploaded on import -> 400',
    expectedStatus: 400,
    run: () => {
      const db = createMockDb();
      const handler = lastHandler(createImportRouter(db), 'post', '/');
      const req = { user: alice, file: undefined };
      const res = mockRes();
      handler(req, res);
      return res;
    },
  },
];

// ---------------------------------------------------------------------------
// Example-based (unit) tests
// ---------------------------------------------------------------------------

describe('error responses — unit tests', () => {
  test('missing required field returns 400 with a message', () => {
    const scenario = scenarios.find((s) => s.name.includes('missing username field'));
    const res = scenario.run();
    expect(res.statusCode).toBe(400);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
  });

  test('unsupported file type returns 400 with a message', () => {
    const scenario = scenarios.find((s) => s.name.includes('unsupported file type'));
    const res = scenario.run();
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Unsupported file type. Supported types: .txt, .md');
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe('error responses — property-based tests', () => {
  // Feature: collaborative-doc-editor, Property 9: error responses are always human-readable JSON
  /**
   * **Validates: Requirements 9.2, 9.3**
   *
   * For any error-triggering request, the response body is valid JSON with a
   * non-empty `message` string, matches the expected 4xx status, and carries no
   * `stack` key (no raw stack trace leaked to clients).
   */
  test('P9: every error response is JSON with a non-empty message and no stack', () => {
    fc.assert(
      fc.property(fc.constantFrom(...scenarios), (scenario) => {
        const res = scenario.run();

        // Correct 4xx status for the scenario.
        expect(res.statusCode).toBe(scenario.expectedStatus);
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
        expect(res.statusCode).toBeLessThan(600);

        // Body is a plain JSON-serialisable object with a message.
        expect(res.body).toBeDefined();
        expect(typeof res.body).toBe('object');
        // Round-trips through JSON without throwing (valid JSON).
        expect(() => JSON.parse(JSON.stringify(res.body))).not.toThrow();

        expect(typeof res.body.message).toBe('string');
        expect(res.body.message.length).toBeGreaterThan(0);

        // No raw stack trace leaked.
        expect(res.body).not.toHaveProperty('stack');
      }),
      { numRuns: 100 }
    );
  });
});
