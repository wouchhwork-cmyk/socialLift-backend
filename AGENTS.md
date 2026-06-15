# Wouchh Backend — Agent Rules

## What this repo is
A dedicated Node.js + Express (ESM) backend for Wouchh's Meta (Facebook/Instagram) integration. The backend is the REPO ROOT — paths are `src/server.js`, not `backend/src/server.js`.

## Hard constraints
- DEMO-GRADE build: OAuth tokens live in an in-memory store (`src/store.js`) and are intentionally NOT persisted. Do NOT add a database, ORM, or migrations.
- Never put the Facebook App Secret or any access token in client-side code or any committed file. Backend only, read from environment variables.
- Do NOT add anything not explicitly requested — no extra dependencies, no Docker, no frontend, no CI. If you think something extra is needed, ask first.
- Confirm the current Meta Graph API version and endpoint shapes against official Meta docs before hardcoding; always use `GRAPH_API_VERSION` from env.

## Working style
- Before editing, read the relevant existing files and state in 3–5 lines what you found and how you'll fit in.
- Keep responses terse: a short file manifest + the code. No long explanations unless asked.
- After changes, run the build/boot and report pass/fail against the task's acceptance criteria.
- Make small, descriptive commits. Commit to this repo only.
- If a change is destructive or ambiguous, stop and ask.

## Env vars
Do not add `DATABASE_URL` or encryption keys to this build. Required vars are listed in `.env.example`:
`FB_APP_ID`, `FB_APP_SECRET`, `FB_LOGIN_CONFIG_ID`, `GRAPH_API_VERSION`, `OAUTH_REDIRECT_URI`, `WEBHOOK_VERIFY_TOKEN`, `SESSION_SECRET`, `ALLOWED_ORIGIN`, `PORT`.

## Architecture notes
- ESM only (`"type": "module"`). Use `.js` extensions in import paths.
- Entry point: `src/server.js`.
- `src/config.js` validates required env vars on import and throws if any are missing.
- `src/store.js` is an ephemeral in-memory `Map`. Do not assume persistence across restarts.
- `src/services/graph.js` wraps Meta Graph API calls, automatically appends `access_token` and `appsecret_proof`. It uses native `fetch`.

## Webhook body parsing gotcha
- Any Meta webhook route must be registered **before** the global `express.json()` middleware in `src/server.js` so it can use `express.raw({ type: "application/json" })` for signature verification. Do not parse that webhook body as JSON before verification.

## Commands
- `npm run dev` — start with `node --watch src/server.js`
- `npm start` — start normally
- `npm run lint` — `node --check` syntax check on a hardcoded file list (`src/server.js`, `src/config.js`, `src/store.js`, `src/services/graph.js`). Add any new source files to this list if you want them checked.

## Verification
- After changes, run `npm start` (or `npm run dev`) and hit `GET /health` to confirm the server boots.
- No tests, typecheck, or build step exist yet.
