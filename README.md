# Collaborative Document Editor

A lightweight, Google Docs–style collaborative document editor. Users can log in,
create and edit rich-text documents, import `.txt`/`.md` files, and share documents
with other users. Content persists across restarts in a local SQLite database.

## Features

- **Lightweight login** — seeded users, JWT-based session stored in the browser.
- **Documents** — create, edit, and list documents you own or that are shared with you.
- **Rich-text formatting** — bold, italic, underline, headings, and ordered/unordered
  lists via a visible toolbar plus `Ctrl+B` / `Ctrl+I` / `Ctrl+U` keyboard shortcuts.
- **Saving** — explicit save action plus auto-save while editing.
- **File import** — upload a `.txt` or `.md` file to create a new document from its contents.
- **Sharing** — grant other users access to a document as collaborators.
- **Persistence** — documents, formatting, metadata, and shares survive page refresh
  and server restart.

## Requirements

- **Node.js 22.5.0 or newer.** This is required because the backend uses Node's
  built-in `node:sqlite` module (`DatabaseSync`), which is only available in Node 22+.
  There is **no native compilation** and **no external database server** to install.
- **npm** (bundled with Node).

## Project Structure

This is a monorepo with two applications plus a root package that ties them together:

```
DocEdi/
├── package.json      # Root convenience scripts (concurrently)
├── .env.example      # Backend environment variable template
├── client/           # Vite + React + MUI frontend (port 5173)
└── server/           # Express REST API backend (port 3001)
```

- **Backend** runs on port **3001** (configurable via `PORT`).
- **Frontend** (Vite dev server) runs on port **5173** and proxies all `/api`
  requests to `http://localhost:3001`.

## Setup and Running

### Quick start (recommended)

From the project root:

```bash
# 1. Install dependencies for root, client, and server
npm run install:all

# 2. Create the backend environment file
cp .env.example server/.env    # then edit server/.env as needed

# 3. Start client and server together
npm run dev
```

The frontend will be available at <http://localhost:5173> and the API at
<http://localhost:3001>.

Root-level scripts (defined in the root `package.json`):

| Script                | Description                                    |
| --------------------- | ---------------------------------------------- |
| `npm run install:all` | Installs root, client, and server dependencies |
| `npm run dev`         | Runs the client and server concurrently        |
| `npm run dev:client`  | Runs only the frontend                         |
| `npm run dev:server`  | Runs only the backend                          |

### Manual setup (per directory)

**Server:**

```bash
cd server
npm install
cp ../.env.example .env    # or create server/.env manually
npm run dev                # runs: node --experimental-sqlite index.js
```

The `--experimental-sqlite` flag is required to enable Node's built-in `node:sqlite`
module. It is already baked into the server's `dev` and `start` npm scripts, so you
don't need to add it manually.

**Client:**

```bash
cd client
npm install
npm run dev
```

### Environment variables

The backend reads its configuration from `server/.env`. Because `dotenv` resolves
relative to the server's working directory, the `.env` file **must live in the
`server/` directory** (`server/.env`), not the project root.

| Variable        | Description                          | Default                 |
| --------------- | ------------------------------------ | ----------------------- |
| `JWT_SECRET`    | Secret used to sign and verify JWTs  | _(none — set this)_     |
| `PORT`          | Port the Express server listens on   | `3001`                  |
| `CLIENT_ORIGIN` | Allowed CORS origin for the frontend | `http://localhost:5173` |

## Troubleshooting

### `npm install` fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`

If installs fail with an error like:

```
npm error code UNABLE_TO_VERIFY_LEAF_SIGNATURE
npm error request to https://registry.npmjs.org/... failed, reason: unable to verify the first certificate
```

your network (commonly a corporate proxy or firewall performing TLS/SSL inspection)
is intercepting the connection to the npm registry, and npm cannot verify the
certificate chain. Two ways to resolve it:

- **Recommended — trust your organization's root certificate.** If your IT team
  provides a root CA certificate, point npm at it:

  ```bash
  npm config set cafile "C:\\path\\to\\corporate-ca.pem"
  ```

- **Quick workaround — disable strict SSL** (less secure; re-enable when done):

  ```bash
  npm config set strict-ssl false
  # run your installs, then optionally:
  npm config set strict-ssl true
  ```

### `'concurrently' is not recognized`

Run `npm run install:all` first (or `npm install` at the project root) before
`npm run dev`. The root `dev` script depends on `concurrently`, which is installed
as a root dev dependency.

## File Upload / Import

- **Supported file types:** `.txt` and `.md` only.
- **Maximum file size:** 10 MB.
- Uploading an unsupported file type or a file larger than 10 MB is rejected with a
  clear error message; no document is created in that case.

## Credentials

Authentication is lightweight/mocked. Two users are seeded automatically on startup:

| Username | Password    |
| -------- | ----------- |
| `alice`  | `password1` |
| `bob`    | `password2` |

Log in as both (in separate browsers or profiles) to demonstrate document sharing.

## Deployment

_Deployment URL: (not yet deployed — TBD)_

## Architecture Note

The system is split into two deployable units:

- **Frontend** — a React/MUI single-page application built with Vite.
- **Backend** — an Express REST API that owns all business logic, validation, and
  database access.

There is no real-time sync (no WebSockets). Collaboration uses an optimistic
last-write-wins model with periodic auto-save, which is appropriate for the project's
build timebox.

### Technology choices and rationale

- **Vite + React + MUI (frontend):** fast dev server and build, a familiar
  component model, and a ready-made Material UI component library for a clean UI.
- **Express (backend):** minimal, well-understood REST API framework.
- **`node:sqlite` (database):** Node's built-in SQLite (`DatabaseSync`, Node 22+).
  Zero-config, file-based, and requires **no native build step or external DB
  server** — avoiding native-compilation/toolchain issues. Run with
  `--experimental-sqlite`. Note that `node:sqlite` has no `db.transaction()` helper,
  so transactions use explicit `exec('BEGIN' / 'COMMIT' / 'ROLLBACK')`.
- **TipTap (rich-text editor):** headless, React-friendly editor that serializes
  content to plain HTML, which is simple to store and restore.
- **JWT auth (mocked):** stateless and easy to verify in middleware. Users are
  seeded at startup; there is no registration flow.
- **Last-write-wins auto-save:** avoids the complexity of real-time sync while still
  satisfying the collaboration requirement.

### Data model

Three SQLite tables:

- **`users`** — `id`, `username`, `password` (plain text for mock auth).
- **`documents`** — `id`, `title`, `content` (HTML string from TipTap), `owner_id`
  (references `users.id`), `created_at`, `updated_at`.
- **`document_shares`** — join table linking documents to collaborators:
  `document_id`, `user_id` (composite primary key).

### Key API endpoints

- `POST /api/auth/login` — authenticate and receive a JWT.
- `GET /api/documents` — list documents owned by or shared with the current user.
- `POST /api/documents` — create a new document.
- `GET /api/documents/:id` — fetch a full document (owner or collaborator).
- `PUT /api/documents/:id` — update a document's title and/or content.
- `POST /api/documents/import` — create a document from an uploaded `.txt`/`.md` file.
- `GET` / `POST /api/documents/:id/shares` — list or grant collaborator access (owner only).
- `GET /api/users` — list users (used for username lookup when sharing).

### Testing

The backend includes automated unit tests and property-based tests using **Jest**
and **fast-check**, run against an in-memory JavaScript mock database (no native
SQLite binary, no network, no file I/O). Run them from the `server/` directory:

```bash
cd server
npm test
```

Frontend testing is out of scope for this project.
# textEdi
