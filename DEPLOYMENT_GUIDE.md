# ☁️ AB Maintenance BD — Cloudflare Deployment Guide (Beginner Edition)

This guide takes you from **"I have never used Cloudflare"** to **"my app is live on
Cloudflare Workers + D1"** — one logical step at a time.

> **How to use this guide:** Do the steps in order. After every step there is a
> **✅ Expected result** — check that you see it before moving on. If you see
> something else, jump to the **❌ If it fails** line, fix it, then continue.
> Do not skip ahead — later steps depend on earlier ones.

---

## 🗺️ The big picture (read this first)

| Piece | What it is | You will create it in |
|---|---|---|
| **Cloudflare account** | Your account on cloudflare.com | Step 1 |
| **Wrangler** | Cloudflare's command-line tool | Step 2 |
| **Worker** | The backend server that runs our REST API | Step 4 |
| **D1 database** | Cloudflare's serverless SQLite database | Step 5 |
| **Migrations** | Numbered `.sql` files that build the database schema | Already written in `worker/migrations/` |
| **wrangler.jsonc** | The Worker's config file | Already written in `worker/wrangler.jsonc` (you add 1 ID) |
| **AUTH_SECRET** | The secret key that signs login sessions | Step 12 |

**The database code is already written for you.** All 15 migration files and the
entire API live in the `worker/` folder of this project. Your job is only to
connect the pieces: account → database → worker → deploy.

---

## 📁 Where to run the commands

Every command in this guide that starts with `npm run ...` or `npx wrangler ...`
must be run **inside the `worker/` folder**:

```bash
cd worker        # ← from the project root
pwd              # should end with /worker
```

If `pwd` does not end with `/worker`, run `cd worker` again.

---

## Step 1 — Create your Cloudflare account

1. Open <https://dash.cloudflare.com/sign-up> in your browser.
2. Sign up with an email + password (the **Free plan** is enough — D1 gives you
   5 GB storage and 5 million reads/day for free).
3. Verify your email when Cloudflare asks.

**✅ Expected result:** You are logged in at <https://dash.cloudflare.com> and see
the dashboard.

**❌ If it fails:** Check your email spam folder for the verification link.

> 🛑 **STOP & CONFIRM:** you can see the Cloudflare dashboard. Move to Step 2.

---

## Step 2 — Install Node.js (skip if you already have it)

Cloudflare's tooling runs on Node.js.

- **Where:** on your own computer (not inside this project folder).
- **How:** download the **LTS version** from <https://nodejs.org> and install it.

Check it works (any folder is fine):

```bash
node --version    # e.g. v20.18.0
npm --version     # e.g. 10.8.2
```

**✅ Expected result:** both commands print version numbers.

**❌ If it fails:** "command not found" → Node.js is not installed or the install
folder is not in your PATH. Reinstall Node.js and open a **new** terminal window.

---

## Step 3 — Install Wrangler

Wrangler is Cloudflare's command-line tool for Workers. Install it **inside the
`worker/` folder** so it is pinned to this project:

```bash
cd worker
npm install
```

**What it does:** reads `worker/package.json` and installs `wrangler`,
`typescript` and `@cloudflare/workers-types` into `worker/node_modules`.

**✅ Expected result:** the command finishes without red error lines
(`added N packages`).

**❌ If it fails:** network problems → retry. "EACCES" permission errors →
don't use `sudo`; instead check folder ownership. If your Node version is very
old (< 18), upgrade Node first.

Check it worked:

```bash
npx wrangler --version    # e.g. ⛅️ wrangler 4.x.x
```

> 🛑 **STOP & CONFIRM:** `npx wrangler --version` prints a version number.

---

## Step 4 — Log in to Cloudflare from Wrangler

```bash
cd worker
npx wrangler login
```

**What it does:** opens your browser → you click **Allow** → Wrangler saves a
token on your computer. After that, Wrangler can create resources **in your
Cloudflare account**.

**✅ Expected result:** the browser says "Success" and the terminal prints
`Successfully logged in`.

**❌ If it fails:** if your browser doesn't open, Wrangler prints a long URL —
copy-paste it into any browser and follow the flow.

Confirm who you are logged in as:

```bash
npx wrangler whoami
```

**✅ Expected result:** prints your account name + email.

> 🛑 **STOP & CONFIRM:** `whoami` shows *your* account. Continue to Step 5.

---

## Step 5 — Create the D1 database

```bash
cd worker
npm run db:create
```

**What it does:** runs `wrangler d1 create ab-maintenance-db` and registers a new
D1 database named **ab-maintenance-db** in your account.

**✅ Expected result** (your IDs will be different — never invent them!):

```
✅ Successfully created DB 'ab-maintenance-db' in region WEUR
Created your database using D1's new storage backend...
[[d1_databases]]
binding = "DB"
database_name = "ab-maintenance-db"
database_id = "3f8a1c4e-9b2d-4e7f-a1c5-6d8e2f4a7b90"
```

> ⚠️ **IMPORTANT — copy the `database_id`** (the long number in the last line).
> This is the one value you must paste into the config file in the next step.
> Don't guess it, don't shorten it — copy it exactly.

**❌ If it fails:**
- `Authentication error` → you skipped Step 4; run `npx wrangler login` again.
- `A database with that name already exists` → you already created it (maybe on
  a previous attempt). Fine! Get its ID with `npx wrangler d1 list` and use the
  ID printed there.

> 🛑 **STOP & CONFIRM:** you have a `database_id`. Paste it into Step 6.

---

## Step 6 — Configure `wrangler.jsonc` (put your database ID in)

Open the file **`worker/wrangler.jsonc`** in any text editor and find:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "ab-maintenance-db",
    "database_id": "REPLACE_WITH_YOUR_DATABASE_ID",
    "migrations_dir": "migrations"
  }
]
```

Replace **only** `REPLACE_WITH_YOUR_DATABASE_ID` with the `database_id` from
Step 5 and save the file.

**What the fields mean:**
| Field | Meaning |
|---|---|
| `binding` | The name you use in code — the Worker accesses it as `env.DB` |
| `database_name` | Human-readable name (must match what you created in Step 5) |
| `database_id` | The unique ID you just pasted |
| `migrations_dir` | The folder with our 15 numbered `.sql` migration files |

> 🛑 **STOP & CONFIRM:** the file is saved with your real database ID.

---

## Step 7 — Apply migrations LOCALLY (practice run)

Before touching the real production database, run the migrations against a
**local** copy of D1 that Wrangler creates on your computer. This is a safe
practice run:

```bash
cd worker
npm run migrate:local
```

**What it does:** runs `wrangler d1 migrations apply ab-maintenance-db --local`.
It executes every `.sql` file in `worker/migrations/` in order (001 → 015) on a
local SQLite database file (`.wrangler/state/`).

**✅ Expected result:** Wrangler lists each migration as applied:

```
✔ Mapping SQL input to an array of statements
Migrations to be applied:
┌────────────────────────────┐
│ name                       │
├────────────────────────────┤
│ 001_auth_schema.sql        │
│ 002_business_schema.sql    │
│ ...                        │
│ 015_extra_indexes.sql      │
└────────────────────────────┘
✔ Executed 15 commands in 0.35s
```

**❌ If it fails:** `A request to the Cloudflare API failed` → you ran the
*remote* command by mistake, or you are not logged in (Step 4). Read the error —
the `--local` version never needs the network.

Check that data was seeded:

```bash
npx wrangler d1 execute ab-maintenance-db --local --command "select id, part_code, part_name from parts;"
```

**✅ Expected result:** a table with 6 parts (Afrodul, Gota Kalappa, …).

---

## Step 8 — Run the Worker locally

```bash
cd worker
npm run dev
```

**What it does:** starts `wrangler dev` — a local copy of the Cloudflare Worker
with your **local** D1 database attached.

**✅ Expected result:**

```
⬣ Listening at http://127.0.0.1:8787
```

**❌ If it fails:** if something else is using port 8787, run
`npx wrangler dev --port 8788` and use that port below.

**Test it** (in a second terminal, also from the `worker/` folder):

```bash
curl http://127.0.0.1:8787/api/health
# → {"ok":true,"service":"ab-maintenance-bd-api"}
```

Then test login (the seeded Super Admin account):

```bash
curl -i -X POST http://127.0.0.1:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"Ab123456"}'
```

**✅ Expected result:** HTTP 200 with a JSON `user` object and a
`Set-Cookie: ab_session=...` header. Save the cookie value — you can pass it to
other requests like `curl http://127.0.0.1:8787/api/dashboard -H "Cookie: ab_session=..."`.

**❌ If it fails:** `Invalid login credentials` → migrations weren't applied
(Step 7) or you typed the wrong password (`Ab123456` with a capital A).

> 🛑 **STOP & CONFIRM:** the API answers locally and login works. Stop the
> dev server with Ctrl+C before the next step.

---

## Step 9 — Apply migrations to PRODUCTION

Now do the same thing against the **real** database in Cloudflare:

```bash
cd worker
npm run migrate:remote
```

**What it does:** runs `wrangler d1 migrations apply ab-maintenance-db --remote`.
Executes the same 15 files against your production D1 database.

**✅ Expected result:** same "applied" list as Step 7, but now it's the real
database.

**❌ If it fails:**
- Not logged in → Step 4.
- Database ID wrong in `wrangler.jsonc` → re-check Step 6.
- `Error 7000 / no such table` on later queries → migrations partially applied?
  D1 records which files it already ran, so simply run `npm run migrate:remote`
  again — it only runs the missing ones.

Verify production data:

```bash
npx wrangler d1 execute ab-maintenance-db --remote --command "select count(*) from machines;"
```

**✅ Expected result:** `12`.

> 🛑 **STOP & CONFIRM:** production DB has data. Continue to Step 10.

---

## Step 10 — Set the AUTH_SECRET secret

Login sessions are signed with a secret key. In production this must be a real
random secret — never the development fallback.

```bash
cd worker
npm run secret:put
```

**What it does:** runs `wrangler secret put AUTH_SECRET`. It asks you to paste a
value. Generate a strong one with:

```bash
openssl rand -hex 32
```

Paste the printed string into the prompt and press Enter.

**✅ Expected result:** `🌀 Creating the secret for the Worker... Success!`

**Why:** the Worker reads `env.AUTH_SECRET`. Secrets live encrypted on
Cloudflare — they never appear in your code or the bundle. Without this step
the deployed API would sign sessions with a well-known development key, which
anyone could forge.

**❌ If it fails:** `openssl` not found → use <https://random.org> or a password
manager to generate a long random string instead.

---

## Step 11 — Deploy the Worker

```bash
cd worker
npm run deploy
```

**What it does:** uploads the Worker to Cloudflare's global network.

**✅ Expected result:**

```
Total Upload: xx KiB / gzip: xx KiB
Uploaded ab-maintenance-bd-api (3 sec)
Deployed! Your Worker is live at:
https://ab-maintenance-bd-api.<your-subdomain>.workers.dev
```

**❌ If it fails:**
- `database_id` placeholder not replaced → Step 6.
- Name already taken (`A resource with that name already exists`) → change the
  `"name"` in `wrangler.jsonc` (e.g. add your initials) and redeploy.

---

## Step 12 — (Optional) Serve the frontend from the Worker

For production you want the UI and the API on **the same domain** so login
cookies work naturally. The clean Cloudflare-native way is **Workers Static
Assets**:

1. Build/export the UI of your choice into a `public/` folder inside `worker/`.
2. In `wrangler.jsonc`, uncomment the `assets` block:
   ```jsonc
   "assets": { "binding": "ASSETS", "directory": "./public" }
   ```
3. Redeploy. The Worker now serves the UI from `https://...workers.dev/` and
   the API from the same origin (`/api/...`) — same origin = cookies just work.

**Alternative:** keep the Next.js app as the frontend on Cloudflare Pages (or
any host) and point it at the Worker API with the build-time variable:

```bash
NEXT_PUBLIC_API_BASE=https://ab-maintenance-bd-api.<your-subdomain>.workers.dev npm run build
```

> ⚠️ Cross-origin cookie note: browsers only send cookies cross-origin with
> explicit configuration. The recommended production topology is therefore the
> Static Assets option above (same origin). The `NEXT_PUBLIC_API_BASE` approach
> is useful for testing from `localhost` while developing.

---

## Step 13 — Test the PRODUCTION application

Replace the URL below with your Worker URL from Step 11:

```bash
# 1) Health
curl https://ab-maintenance-bd-api.<your-subdomain>.workers.dev/api/health

# 2) Login as Super Admin
curl -i -X POST https://ab-maintenance-bd-api.<your-subdomain>.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"Ab123456"}'

# 3) Wrong password must be rejected
curl -i -X POST https://ab-maintenance-bd-api.<your-subdomain>.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"wrong"}'
# → 401 {"error":"Invalid login credentials."}

# 4) Calling a protected API without login must be rejected
curl -i https://ab-maintenance-bd-api.<your-subdomain>.workers.dev/api/machines
# → 401 {"error":"Authentication required."}

# 5) Insufficient stock must be rejected
curl -i -X POST https://ab-maintenance-bd-api.<your-subdomain>.workers.dev/api/stock/out \
  -H "Content-Type: application/json" \
  -H "Cookie: ab_session=<paste cookie from step 2>" \
  -d '{"part_id":6,"quantity":999,"transaction_date":"2024-05-01"}'
# → 400 {"error":"Insufficient stock. Available balance: 0 PCS."}
```

**✅ Expected result:** every request behaves exactly as the comment says. This
proves authentication, RBAC and the stock guard all work in production.

---

## Step 14 — Security checklist for production

Do these before handing the system to real users:

- [ ] **Remove/change the seed users.** `worker/migrations/006_seed_users.sql`
      contains `superadmin / manager / technician / viewer` with password
      `Ab123456`. Before real use, either delete the file's content and re-create
      a fresh database, or log in and **change the Super Admin password**
      (create a second Super Admin first, then disable the seed account).
- [ ] **AUTH_SECRET set** (Step 10). `npx wrangler secret list` shows it.
- [ ] **Custom domain** (optional but recommended): dashboard → Workers →
      your worker → **Custom Domains**, or a **Custom route** on a zone you own.
- [ ] **D1 backups**: dashboard → D1 → your database → **Settings → Backups**
      (automatic, plus you can download manual backups).
- [ ] **Enable Cloudflare's free WAF** if you route the Worker through your own
      domain zone.
- [ ] If you used Workers Static Assets: protect the admin UI from public
      access — every API route already requires login; the static files are
      harmless (only UI markup).

---

## Step 15 — Updating the schema in the future

When you change the database later, create a **new numbered migration** —
never edit old ones (they already ran on production):

```bash
cd worker
npm run migrate:create add_some_new_table
# creates migrations/0016_add_some_new_table.sql — write your SQL in it

npm run migrate:local      # test locally first
npm run migrate:remote     # then apply to production
```

**Rule of thumb:** local first, remote second, never edit applied files.
