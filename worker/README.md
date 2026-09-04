# ☁️ Globe Safety — Cloudflare Worker + D1 backend

This folder contains the production backend: a **Cloudflare Worker** serving the
complete REST API backed by a **D1 (SQLite)** database. No runtime dependencies
— only `wrangler`, `typescript` and the Workers type definitions as dev tools.

## Contents

```
worker/
├── src/
│   ├── index.ts      # entry point: CORS, health check, session resolution
│   ├── handlers.ts   # every API endpoint (auth, RBAC, CRUD, ledger, reports)
│   ├── router.ts     # tiny dependency-free router + response helpers
│   ├── auth.ts       # PBKDF2 password hashing + HMAC-SHA256 JWT sessions
│   └── db.ts         # D1 helpers (all/one/run + transactional tx())
├── migrations/       # 15 numbered migration files (run in order, never edited after apply)
│   ├── 001_auth_schema.sql
│   ├── 002_business_schema.sql
│   ├── 003_audit_logs.sql
│   ├── 004_indexes.sql
│   ├── 005_seed_permissions_and_roles.sql
│   ├── 006_seed_users.sql            ⚠️ demo accounts — change before production
│   ├── 007_seed_master_data.sql
│   ├── 008_seed_machines.sql
│   ├── 009_add_last_login.sql
│   ├── 010_add_opening_stock.sql
│   ├── 011_seed_parts_and_openings.sql
│   ├── 012_seed_stock_transactions.sql
│   ├── 013_seed_employees.sql
│   ├── 014_part_balance_view.sql
│   └── 015_extra_indexes.sql
├── wrangler.jsonc    # paste your database_id here
├── tsconfig.json
└── package.json
```

## Scripts

| Script | Command it runs | Purpose |
|---|---|---|
| `npm run dev` | `wrangler dev` | Local dev server on `http://127.0.0.1:8787` |
| `npm run deploy` | `wrangler deploy` | Deploy to Cloudflare |
| `npm run migrate:local` | `wrangler d1 migrations apply ab-maintenance-db --local` | Apply migrations to the local test database |
| `npm run migrate:remote` | `wrangler d1 migrations apply ab-maintenance-db --remote` | Apply migrations to production D1 |
| `npm run secret:put` | `wrangler secret put AUTH_SECRET` | Set the session-signing secret |
| `npm run typecheck` | `tsc --noEmit` | Type-check the Worker |

See `../DEPLOYMENT_GUIDE.md` for the full beginner walkthrough.

## Security notes

- Passwords are hashed with PBKDF2 (SHA-256, 60,000 rounds, random salt).
- Sessions are HMAC-SHA256 signed JWTs (`AUTH_SECRET`) in an HTTP-only cookie.
- Authorization happens **in the handler**, not the UI: every protected route
  calls `requirePerm(user, "permission")` first and returns 403 otherwise.
- Stock OUT runs inside a D1 session (transaction): the balance is re-read and
  re-checked inside the same transaction, so concurrent requests can never push
  stock below zero.
- All SQL is parameterised (`?` placeholders) — no string concatenation.
- Errors sent to clients are friendly messages only; internals go to the Worker
  logs (`wrangler tail`).

## Session cookies

Login sets `ab_session` (HttpOnly, SameSite=Lax, 12h). For a same-origin
frontend (Workers Static Assets) this works out of the box. For cross-origin
testing from another domain, prefer hosting UI+API on the same origin.
