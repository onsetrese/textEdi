/**
 * In-memory mock database that mimics the better-sqlite3 `prepare().get/run/all`
 * interface without requiring the native binary.
 *
 * Supports the following tables: users, documents, document_shares.
 *
 * @param {boolean} [seed=true] - Whether to pre-seed with alice/bob users
 */
export function createMockDb(seed = true) {
  const users = seed
    ? [
      { id: 1, username: 'alice', password: 'password1' },
      { id: 2, username: 'bob', password: 'password2' },
    ]
    : [];
  const documents = [];
  const shares = [];
  let nextDocId = 1;

  /**
   * Very lightweight SQL pattern matcher.
   * Supports the specific queries used by our routes.
   */
  function prepare(sql) {
    const normalised = sql.replace(/\s+/g, ' ').trim().toUpperCase();

    return {
      // -----------------------------------------------------------------------
      // .get(...params) → single row or undefined
      // -----------------------------------------------------------------------
      get(...params) {
        // SELECT user by username
        if (normalised.includes('FROM USERS') && normalised.includes('WHERE USERNAME')) {
          const username = params[0];
          return users.find((u) => u.username === username);
        }
        // SELECT user by id
        if (normalised.includes('FROM USERS') && normalised.includes('WHERE ID')) {
          const id = params[0];
          return users.find((u) => u.id === id);
        }
        // SELECT document with owner join
        if (normalised.includes('FROM DOCUMENTS D') && normalised.includes('WHERE D.ID')) {
          const id = params[0];
          const doc = documents.find((d) => d.id === id);
          if (!doc) return undefined;
          const owner = users.find((u) => u.id === doc.owner_id);
          return { ...doc, owner_username: owner?.username };
        }
        // SELECT document without join (plain)
        if (normalised.includes('FROM DOCUMENTS') && normalised.includes('WHERE ID')) {
          const id = params[0];
          return documents.find((d) => d.id === id);
        }
        return undefined;
      },

      // -----------------------------------------------------------------------
      // .run(...params) → { lastInsertRowid, changes }
      // -----------------------------------------------------------------------
      run(...params) {
        // INSERT INTO documents
        if (normalised.startsWith('INSERT INTO DOCUMENTS')) {
          const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
          let doc;
          // Determine column order and which columns are supplied as params.
          // The columns clause is always (TITLE, CONTENT, OWNER_ID), but the
          // VALUES clause may pass CONTENT as a literal (e.g. '') instead of a
          // bound parameter — as POST /api/documents does with VALUES (?, '', ?).
          if (normalised.includes('(TITLE, CONTENT, OWNER_ID)')) {
            // Count the bound parameters ('?') in the VALUES clause.
            const valuesClause = normalised.slice(normalised.indexOf('VALUES'));
            const placeholders = (valuesClause.match(/\?/g) || []).length;
            if (placeholders <= 2) {
              // CONTENT is a literal in the VALUES clause: (?, '', ?)
              const [title, owner_id] = params;
              doc = { id: nextDocId++, title, content: '', owner_id, created_at: now, updated_at: now };
            } else {
              const [title, content, owner_id] = params;
              doc = { id: nextDocId++, title, content, owner_id, created_at: now, updated_at: now };
            }
          } else {
            // fallback
            doc = { id: nextDocId++, title: params[0], content: params[1], owner_id: params[2], created_at: now, updated_at: now };
          }
          documents.push(doc);
          return { lastInsertRowid: doc.id, changes: 1 };
        }
        // UPDATE documents
        if (normalised.startsWith('UPDATE DOCUMENTS')) {
          const docId = params[params.length - 1];
          const doc = documents.find((d) => d.id === docId);
          if (doc) {
            const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
            doc.title = params[0];
            doc.content = params[1];
            doc.updated_at = now;
          }
          return { changes: doc ? 1 : 0 };
        }
        // INSERT [OR IGNORE] INTO document_shares
        if (
          normalised.startsWith('INSERT INTO DOCUMENT_SHARES') ||
          normalised.startsWith('INSERT OR IGNORE INTO DOCUMENT_SHARES')
        ) {
          const document_id = params[0];
          const user_id = params[1];
          // Composite PRIMARY KEY (document_id, user_id): with OR IGNORE a
          // duplicate is a no-op. Emulate that dedup for both forms so the
          // in-memory store stays faithful to the real schema.
          const exists = shares.some(
            (s) => s.document_id === document_id && s.user_id === user_id
          );
          if (exists) {
            return { lastInsertRowid: 0, changes: 0 };
          }
          shares.push({ document_id, user_id });
          return { lastInsertRowid: 0, changes: 1 };
        }
        return { lastInsertRowid: 0, changes: 0 };
      },

      // -----------------------------------------------------------------------
      // .all(...params) → array of rows
      // -----------------------------------------------------------------------
      all(...params) {
        // SELECT all users
        if (normalised.includes('FROM USERS') && !normalised.includes('WHERE')) {
          return [...users];
        }
        // SELECT documents for a user (list endpoint)
        if (normalised.includes('FROM DOCUMENTS D') && normalised.includes('WHERE D.OWNER_ID')) {
          const userId = params[0];
          return documents
            .filter((d) => {
              const isOwner = d.owner_id === userId;
              const isShared = shares.some(
                (s) => s.document_id === d.id && s.user_id === userId
              );
              return isOwner || isShared;
            })
            .map((d) => {
              const owner = users.find((u) => u.id === d.owner_id);
              return { ...d, owner_username: owner?.username };
            });
        }
        // SELECT shares (collaborators) — query aliases u.id AS userId
        if (normalised.includes('FROM DOCUMENT_SHARES')) {
          const docId = params[0];
          return shares
            .filter((s) => s.document_id === docId)
            .map((s) => {
              const user = users.find((u) => u.id === s.user_id);
              return { userId: s.user_id, username: user?.username };
            });
        }
        return [];
      },
    };
  }

  return { prepare, users, documents, shares };
}
