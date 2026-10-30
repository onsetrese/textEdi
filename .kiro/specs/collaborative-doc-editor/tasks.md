# Implementation Plan: Collaborative Document Editor

## Overview

Build a lightweight collaborative document editor with a React/MUI/TipTap frontend and a Node.js/Express backend backed by SQLite via `better-sqlite3`. The implementation proceeds in layers: project scaffolding, backend API and database, frontend pages and routing, then integration wiring and tests.

## Tasks

- [x] 1. Project scaffolding and shared configuration
  - [x] 1.1 Initialize monorepo structure with `client/` (Vite + React) and `server/` (Express) directories
    - Create `client/` with `npm create vite@latest` using the React template
    - Create `server/` with `npm init` and install `express`, `better-sqlite3`, `jsonwebtoken`, `multer`, `cors`, `dotenv`
    - Add a root-level `package.json` with `scripts` to start both processes concurrently
    - Create `.env.example` documenting `JWT_SECRET` and `PORT`
    - _Requirements: 10.1_

  - [x] 1.2 Configure ESLint and Jest for the backend
    - Install `jest`, `supertest`, `fast-check`, `@babel/preset-env` (or configure Jest with CommonJS transform) in `server/`
    - Add `jest.config.js` with `--runInBand` flag to avoid SQLite conflicts
    - Add `npm test` script pointing to `jest --runInBand`
    - _Requirements: 10.4_

- [x] 2. Backend database layer
  - [x] 2.1 Create the SQLite schema and seed helper
    - Write `server/db/schema.js` that creates the `users`, `documents`, and `document_shares` tables if they don't exist (DDL from design)
    - Write `server/db/seed.js` that inserts `alice/password1` and `bob/password2` if not already present
    - Export a `createDb(path)` factory used by both the app and tests; pass `:memory:` in tests
    - _Requirements: 1.5, 8.4_

  - [x] 2.2 Write `createTestDb()` helper for tests
    - Create `server/__tests__/helpers/createTestDb.js` that runs schema creation and seeding against an in-memory SQLite instance and returns the db handle
    - _Requirements: 10.4_

- [ ] 3. Backend authentication
  - [ ] 3.1 Implement `POST /api/auth/login` route and JWT middleware
    - Write `server/routes/auth.js` with `POST /api/auth/login` — looks up user, compares plain-text password, issues a JWT signed with `JWT_SECRET` containing `{ id, username }`
    - Write `server/middleware/authenticateToken.js` — validates `Authorization: Bearer <token>`, attaches `req.user`, returns 401 on failure
    - Register the auth router and middleware in `server/app.js`
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ]\* 3.2 Write property tests for authentication (Properties 1 and 2)
    - **Property 1: Authentication succeeds for all valid users** — use `fc.constantFrom(...seededUsers)` to verify `POST /api/auth/login` returns 200 + valid JWT for every seeded user
    - **Property 2: Protected routes reject unauthenticated requests** — use `fc.constantFrom(...protectedRoutes)` and `fc.string()` for bad tokens to verify 401 for every protected endpoint
    - Add example tests: wrong password → 401, missing token → 401
    - **Validates: Requirements 1.2, 1.4**
    - _File: `server/__tests__/auth.test.js`_

- [ ] 4. Backend document CRUD
  - [ ] 4.1 Implement document middleware and CRUD routes
    - Write `server/middleware/requireDocumentAccess.js` — checks owner or collaborator, attaches `req.document`, returns 403/404 on failure
    - Write `server/middleware/requireDocumentOwner.js` — owner-only check, returns 403 on failure
    - Write `server/routes/documents.js` implementing:
      - `GET /api/documents` — returns owned + shared docs as `DocumentSummary[]`
      - `POST /api/documents` — creates document with default title, assigns owner
      - `GET /api/documents/:id` — returns `DocumentDetail` (access check)
      - `PUT /api/documents/:id` — updates title and/or content, bumps `updated_at` (access check)
    - Register document router in `server/app.js`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.4, 5.1, 5.3_

  - [ ]\* 4.2 Write property test for document creation invariants (Property 3)
    - **Property 3: Document creation invariants** — for any seeded user, `POST /api/documents` returns a record where `title === "Untitled Document"`, `content === ""`, `owner_id` matches the creating user, and the document is retrievable via `GET /api/documents/:id`
    - **Validates: Requirements 2.1, 2.3, 2.4**
    - _File: `server/__tests__/documents.test.js`_

  - [ ]\* 4.3 Write property test for document update round-trip (Property 4)
    - **Property 4: Document update round-trip** — use `fc.string()` for title and HTML content; `PUT` then `GET` must return identical title and content
    - **Validates: Requirements 2.2, 5.1, 5.3**
    - _File: `server/__tests__/documents.test.js`_

  - [ ]\* 4.4 Write property test for document list completeness (Property 5)
    - **Property 5: Document list completeness and shape** — use `fc.integer({ min: 0, max: 5 })` for owned/shared doc counts; verify `GET /api/documents` returns exactly those docs with correct `title`, `ownerUsername`, `updatedAt`, and `isOwner` fields
    - **Validates: Requirements 3.1, 3.4**
    - _File: `server/__tests__/documents.test.js`_

- [ ] 5. Backend file import
  - [ ] 5.1 Implement `POST /api/documents/import` route
    - Write `server/routes/import.js` using `multer` (memory storage) to accept multipart uploads
    - Validate file extension (`.txt`, `.md` only); return 400 with supported-types message on failure
    - Validate file size ≤ 10 MB; return 400 with size-limit message on failure
    - On success, create a new document with file text as initial content and return the document record
    - Register import router in `server/app.js` **before** the parameterised document routes to avoid route conflicts
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

  - [ ]\* 5.2 Write property test for file import round-trip (Property 6)
    - **Property 6: File import round-trip** — use `fc.string()` for text content and `fc.constantFrom('.txt', '.md', '.pdf', '.exe')` for extension; verify `.txt`/`.md` → 201 + document with that content; unsupported types or files over 10 MB → 400
    - **Validates: Requirements 6.1, 6.2, 6.5**
    - _File: `server/__tests__/import.test.js`_

- [ ] 6. Backend sharing
  - [ ] 6.1 Implement share routes and `GET /api/users`
    - Write `server/routes/shares.js` implementing:
      - `POST /api/documents/:id/shares` — owner-only; looks up username, inserts share grant, returns updated collaborator list; returns 404 if user not found
      - `GET /api/documents/:id/shares` — owner-only; returns `ShareEntry[]`
    - Write `server/routes/users.js` with `GET /api/users` (auth required) returning all users
    - Register both routers in `server/app.js`
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

  - [ ]\* 6.2 Write property tests for sharing round-trip and non-owner forbidden (Properties 7 and 8)
    - **Property 7: Sharing round-trip and collaborator access** — for any document owned by alice and any other seeded user (bob), granting a share adds bob to the collaborator list, document appears in bob's list, and bob can `GET` and `PUT` the document
    - **Property 8: Non-owner share control is forbidden** — for any document owned by alice, bob's `POST /api/documents/:id/shares` and `GET /api/documents/:id/shares` return 403
    - Add example test: share with non-existent username → 404 with `{ message: "User not found" }`
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6**
    - _File: `server/__tests__/sharing.test.js`_

- [ ] 7. Backend global error handling
  - [ ] 7.1 Add global error middleware and validate all error response shapes
    - Write Express error-handling middleware `(err, req, res, next)` at the bottom of `server/app.js`
    - Ensure every 4xx/5xx response body is `{ message: string }` with no stack trace in responses
    - Add 404 handler for unknown routes
    - _Requirements: 9.2, 9.3_

  - [ ]\* 7.2 Write property test for error response shape (Property 9)
    - **Property 9: Error responses are always human-readable JSON** — use `fc.constantFrom(...errorTriggeringRequests)` (bad auth, wrong user, missing field, bad file type) to verify every 4xx/5xx response is valid JSON with a non-empty `message` field and no `stack` key
    - Add example tests: missing required field → 400 `{ message: "Field '<name>' is required" }`, seeded users exist after startup
    - **Validates: Requirements 9.2, 9.3**
    - _File: `server/__tests__/errors.test.js`_

- [ ] 8. Checkpoint — backend complete
  - Run `cd server && npm test` and ensure all tests pass. Fix any failures before proceeding to the frontend.

- [ ] 9. Frontend routing, auth guard, and login page
  - [ ] 9.1 Install frontend dependencies and configure routing
    - Install `@mui/material`, `@emotion/react`, `@emotion/styled`, `@mui/icons-material`, `react-router-dom` in `client/`
    - Set up `BrowserRouter` with routes: `/login`, `/documents`, `/documents/:id`
    - Write `AuthGuard` component that reads JWT from `localStorage`; if absent, redirects to `/login`
    - Wrap `/documents` and `/documents/:id` routes with `AuthGuard`
    - _Requirements: 1.4, 3.1_

  - [ ] 9.2 Implement `LoginPage` component
    - Build MUI form with username and password fields; validate that username is non-empty before submit
    - Call `POST /api/auth/login`; on success store JWT and `{ id, username }` in `localStorage`, redirect to `/documents`
    - Display MUI `Alert` with server error message on failure
    - Show current user identity in a persistent header/navbar while session is active
    - _Requirements: 1.1, 1.2, 1.3, 9.1_

- [ ] 10. Frontend document list page
  - [ ] 10.1 Implement `DocumentListPage` component
    - Fetch `GET /api/documents` with the JWT from `localStorage`; render two sections — "My Documents" and "Shared with Me" — visually distinguishing ownership via `isOwner` flag (MUI chip or icon)
    - Display document title, owner username, and formatted `updatedAt` for each entry
    - Clicking a document navigates to `/documents/:id`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 10.2 Add "New Document" button and `FileUploadButton` to `DocumentListPage`
    - "New Document" calls `POST /api/documents` and navigates to the new document's editor
    - `FileUploadButton` opens a file picker restricted to `.txt,.md`; displays the list of supported types in the UI; validates size ≤ 10 MB client-side before uploading; calls `POST /api/documents/import` on valid selection; navigates to the new document on success; shows MUI `Alert` on error
    - _Requirements: 2.1, 6.1, 6.3, 6.4, 6.5_

- [ ] 11. Frontend editor page
  - [ ] 11.1 Install TipTap and implement `EditorPage`
    - Install `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline` in `client/`
    - `EditorPage` fetches `GET /api/documents/:id` on mount and initialises TipTap with the returned HTML content
    - Render an editable title field that calls `PUT /api/documents/:id` on blur/enter
    - _Requirements: 4.1, 4.2, 4.3, 5.3_

  - [ ] 11.2 Implement TipTap toolbar and keyboard shortcuts
    - Render a visible MUI toolbar with buttons for Bold, Italic, Underline, H1, H2, Paragraph, Bullet List, Ordered List
    - Wire each button to the corresponding TipTap command
    - Confirm TipTap's built-in keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+U) are active
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 11.3 Implement explicit save and auto-save
    - Add a "Save" button (and Ctrl+S shortcut) that calls `PUT /api/documents/:id` with current TipTap HTML; display success/failure in a MUI `Alert`; retain unsaved content in React state on failure
    - Add an auto-save `useEffect` timer that fires within 5 seconds of the last keystroke and on a 30-second interval, calling the same save handler silently
    - _Requirements: 2.3, 5.1, 5.2, 5.4_

- [ ] 12. Frontend sharing dialog
  - [ ] 12.1 Implement `ShareDialog` and collaborator list in `EditorPage`
    - Show a "Share" button only when `isOwner === true`
    - `ShareDialog` contains a text field for entering a username; on submit calls `POST /api/documents/:id/shares`; displays MUI `Alert` for "User not found" or other errors; confirms success with a message
    - After a successful share, refresh and display the collaborator list (from `GET /api/documents/:id/shares`) inside the dialog — visible only to the owner
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

- [ ] 13. Final wiring and integration
  - [ ] 13.1 Wire CORS, proxy, and environment configuration
    - Configure `cors()` in `server/app.js` to allow the Vite dev origin
    - Add `server.proxy` in `vite.config.js` to forward `/api` requests to the Express server
    - Ensure `JWT_SECRET` is read from `.env` in the backend; provide a `.env.example`
    - _Requirements: 10.1_

  - [ ] 13.2 Write README with setup instructions, architecture note, and credentials
    - Document `npm install` and `npm run dev` steps for both `client/` and `server/`
    - List supported file upload types (`.txt`, `.md`) and the 10 MB size limit
    - Include the architecture note: components, tech choices, and data model overview
    - Include seeded credentials (`alice/password1`, `bob/password2`) and deployment URL placeholder
    - _Requirements: 10.1, 10.2, 10.3, 10.5_

- [ ] 14. Final checkpoint — full stack integration
  - Ensure all backend tests pass with `cd server && npm test`. Manually verify the app starts with `npm run dev` in both `client/` and `server/`. Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use **fast-check** with a minimum of 100 iterations (`numRuns: 100`)
- Backend tests use **supertest** against an in-memory SQLite database (`:memory:`) — no file I/O side effects
- Frontend testing is explicitly out of scope per Requirement 10.4
- Checkpoints in tasks 8 and 14 are validation gates; fix all failures before proceeding

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "5.1"] },
    { "id": 5, "tasks": ["5.2", "6.1"] },
    { "id": 6, "tasks": ["6.2", "7.1"] },
    { "id": 7, "tasks": ["7.2", "9.1"] },
    { "id": 8, "tasks": ["9.2", "10.1"] },
    { "id": 9, "tasks": ["10.2", "11.1"] },
    { "id": 10, "tasks": ["11.2", "11.3"] },
    { "id": 11, "tasks": ["12.1"] },
    { "id": 12, "tasks": ["13.1", "13.2"] }
  ]
}
```
