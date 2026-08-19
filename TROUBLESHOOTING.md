# 🩺 AB Maintenance BD — Troubleshooting Guide

How to read this guide: find your error below. Each entry has
**What it means → Likely cause → Fix → Retry**.

---

## Cloudflare / Wrangler errors

### `Error: Authentication error` (any `wrangler` command)

**What it means:** Cloudflare doesn't know who you are.

**Likely cause:** you are not logged in, or your login token expired.

**Fix:** run `npx wrangler login` in the `worker/` folder, click Allow in the
browser, then run `npx wrangler whoami` to confirm.

**Retry:** run the failed command again.

---

### `✘ [ERROR] A resource with that name already exists` (deploy)

**What it means:** another Worker already uses the name `ab-maintenance-bd-api`.

**Likely cause:** someone else took the name, or you deployed before.

**Fix:** in `worker/wrangler.jsonc`, change `"name"` to something unique, e.g.
`"ab-maintenance-bd-api-yourname"`, save, redeploy.

**Retry:** `npm run deploy`.

---

### `A database with that name already exists` (d1 create)

**What it means:** you already created a database called `ab-maintenance-db`.

**Fix:** don't create it again. Run `npx wrangler d1 list` to get its
`database_id`, put that ID in `wrangler.jsonc`, and continue from the
"apply migrations" step.

---

### `wrangler: command not found`

**What it means:** the shell can't find Wrangler.

**Likely cause:** you ran the command outside `worker/`, or forgot
`npm install` in `worker/`, or forgot the `npx` prefix.

**Fix:** `cd worker` → `npm install` → use `npm run ...` scripts or
`npx wrangler ...`.

---

### `Error: Something went wrong! Error: TypeError: fetch failed`

**What it means:** `wrangler dev` couldn't start (usually a port or proxy issue).

**Fix:** try another port: `npx wrangler dev --port 8788` and use that port
in your tests.

---

### `✘ [ERROR] Migration failed: Syntax error in SQL`

**What it means:** one of the `.sql` files has invalid SQLite syntax.

**Likely cause:** the file was edited by hand and broken.

**Fix:** Wrangler tells you the file name. Restore that file to its original
content (git checkout / undo), then re-run the migration. Never edit migrations
that already ran.

---

## D1 / database errors

### `D1_ERROR: no such table: parts`

**What it means:** the database exists but the schema is empty.

**Fix:** run `npm run migrate:local` (local dev) or `npm run migrate:remote`
(production), then retry.

---

### `D1_ERROR: NOT NULL constraint failed: ...` or `UNIQUE constraint failed`

**What it means:** the API tried to write a row that violates a rule (empty
required field, duplicate code).

**Likely cause:** a client bypassed the UI validations. The API normally
catches duplicates first and returns a friendly 409 message — if you see the
raw constraint error, it means two requests raced.

**Fix:** for the UI this is self-correcting (re-submit). If it happens
regularly on Stock OUT, it's the concurrency guard working — retry the
operation.

---

## API errors (returned as JSON)

### `{"error":"Authentication required."}` — HTTP 401

**What it means:** the request has no valid session.

**Fix:** log in again. The session cookie lasts 12 hours. If it expired, the
login page will appear automatically.

---

### `{"error":"You do not have permission to perform this action."}` — HTTP 403

**What it means:** you are logged in, but your role lacks the permission.
This is the server rejecting the request — it is not a bug.

**Fix:** ask your administrator to add the permission to your role
(Administration → Roles & Permissions), or use an account with the right role.

---

### `{"error":"Invalid login credentials."}` — HTTP 401

**What it means:** wrong username or password.

**Fix:** check caps-lock. The seeded accounts use password `Ab123456`. If you
lost the admin password, reset it directly in D1 (see below).

---

### `{"error":"Your account is disabled. Please contact the administrator."}`

**What it means:** a Super Admin/User Manager set your account to **Disabled**.

**Fix:** sign in as another administrator and re-enable the account
(Administration → Users → Enable).

---

### `{"error":"Insufficient stock. Available balance: X PCS."}` — HTTP 400

**What it means:** the OUT quantity is bigger than the calculated balance.

**Fix:** issue a smaller quantity or record a Stock IN first. This is the
intended protection against negative inventory.

---

### `{"error":"Unit cannot be deleted because machines are assigned to it."}`

**What it means:** the FK guard worked.

**Fix:** move/delete the machines on that unit first, then delete the unit.

---

### `{"error":"Something went wrong. Please try again."}` — HTTP 500

**What it means:** an unexpected server error. Details are hidden from users
on purpose (security).

**Fix (developer):** look at the Worker logs — `npx wrangler tail` (live log
stream) or Dashboard → Workers → your worker → Logs.

---

## Local development (Next.js preview)

### `DATABASE_URL is required` when running the Next app

**What it means:** the local PostgreSQL connection string is missing.

**Fix:** ensure `.env` contains
`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db` and that
PostgreSQL is running, then restart.

### Schema changed but pages error

**Fix:** run `npx drizzle-kit push` (from the project root) to sync the local
PostgreSQL schema, then reseed with `npx tsx src/db/seed.ts`.

---

## Lost the Super Admin password? (emergency reset, D1)

```bash
cd worker
# Generate a new password hash — create a small JS snippet or ask a developer.
# Then update the row directly (example for D1):
npx wrangler d1 execute ab-maintenance-db --remote \
  --command "update users set password_hash = '<new pbkdf2 hash>' where username = 'superadmin';"
```

**Important:** the hash format is `pbkdf2$60000$<salt-b64>$<hash-b64>` produced
by the same algorithm as `worker/src/auth.ts` (`hashPassword`). You can generate
one in any environment that supports Web Crypto (browser console or `wrangler
dev`). Never store the plaintext password in the database.
