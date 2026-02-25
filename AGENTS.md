# AGENTS.md

## Cursor Cloud specific instructions

### Overview
Node.js/Express authentication app with SQLite (better-sqlite3), bcryptjs password hashing, JWT sessions, and password reset via email. Frontend is vanilla HTML/CSS/JS served as static files from `public/`.

### Running the app
- `npm run dev` starts the server with `--watch` on port 3000 (auto-restarts on file changes)
- `npm start` runs without watch mode
- SQLite DB is auto-created in `data/app.db` on first start; no migrations needed

### Key commands
- **Lint:** `npm run lint`
- **Unit tests:** `node --test src/tests/password.test.js src/tests/email.test.js`
- **Integration tests:** `node --test src/tests/api.test.js` (starts its own server on port 3001 with in-memory DB)
- **All tests:** `npm test`

### Non-obvious notes
- The API integration test (`api.test.js`) spawns its own server process on port 3001 with `DB_PATH=:memory:`, so it is self-contained and does not conflict with the dev server on port 3000.
- No external SMTP server is needed for dev: the mailer gracefully falls back when SMTP is unreachable, and the `/api/auth/dev/sent-emails` endpoint exposes sent emails in-memory for testing the reset flow.
- Password reset tokens are stored hashed (SHA-256) in the DB; the raw token is only in the email link. Tokens expire after 1 hour and are single-use.
- Email uniqueness is enforced both at the application level (normalized to lowercase before insert) and at the database level (UNIQUE constraint on `users.email`).
