# 🔄 Interactive Cloudflare D1 Setup — step-by-step walkthrough

This is the **guided, pause-and-confirm** version of the D1 setup. Work through
it **one step at a time**. After each step, stop, check the expected output,
and only continue when it matches. If you're doing this in a chat, paste your
command output back after each step.

> Same folder rule as always: run the commands from the **`worker/` folder**
> (`cd worker` from the project root).

---

## Step 1 — Confirm you are logged in

Run this in `worker/`:

```bash
npx wrangler whoami
```

| Expected output | What to do |
|---|---|
| Prints your account name + email | ✅ Continue to Step 2 |
| Error about authentication | ❌ Run `npx wrangler login`, click **Allow** in the browser, then run `whoami` again |

🛑 **Pause here. Do not continue until `whoami` shows your account.**

---

## Step 2 — Create the database

Run this in `worker/`:

```bash
npm run db:create
```

| Expected output | What to do |
|---|---|
| `✅ Successfully created DB 'ab-maintenance-db'` + a `database_id` line | ✅ Copy the `database_id` value, continue to Step 3 |
| `A database with that name already exists` | You already created it. Run `npx wrangler d1 list` to see its `database_id`. Copy it, continue to Step 3 |
| Authentication / API error | ❌ Go back to Step 1 |

🛑 **Pause here. Paste/keep your `database_id` — you need it for Step 3.**

---

## Step 3 — Put the database ID into the config

Open `worker/wrangler.jsonc` and replace `REPLACE_WITH_YOUR_DATABASE_ID` with
your real ID. Save the file.

Then confirm Wrangler accepts the config (still in `worker/`):

```bash
npx wrangler d1 list
```

| Expected output | What to do |
|---|---|
| A table listing `ab-maintenance-db` with **your** `database_id` | ✅ Continue to Step 4 |
| Empty list | Your DB is in another account — re-check `whoami` (Step 1) |

🛑 **Pause here. The database must appear in `wrangler d1 list`.**

---

## Step 4 — Apply migrations locally (safe practice run)

```bash
npm run migrate:local
```

| Expected output | What to do |
|---|---|
| Wrangler lists 001 → 015 and `Executed 15 commands` | ✅ Continue to Step 5 |
| `Syntax error in SQL` | ❌ One of the migration files is broken — report the exact file name the error mentions |
| Cloudflare API error | ❌ You probably typed `migrate:remote` — the local run must not touch the network. Re-check you ran `migrate:local` |

🛑 **Pause here. 15 migrations must be applied locally.**

---

## Step 5 — Smoke-test the local data

```bash
npx wrangler d1 execute ab-maintenance-db --local --command "select part_code, part_name from parts;"
```

| Expected output | What to do |
|---|---|
| 6 rows: PRT-001 Afrodul … PRT-006 Timing Belt | ✅ Continue to Step 6 |
| `no such table: parts` | ❌ Migrations didn't run — redo Step 4 |

---

## Step 6 — Apply migrations to production

```bash
npm run migrate:remote
```

| Expected output | What to do |
|---|---|
| Wrangler lists 001 → 015 and `Executed 15 commands` | ✅ Continue to Step 7 |
| `database_id` error | ❌ Step 3 wasn't saved / wrong ID |
| Cloudflare API error | ❌ Login again (Step 1) |

🛑 **Pause here. Production migrations must be applied.**

---

## Step 7 — Verify production data

```bash
npx wrangler d1 execute ab-maintenance-db --remote --command "select count(*) as machines from machines;"
```

| Expected output | What to do |
|---|---|
| `12` | ✅ D1 is fully set up! |
| `no such table: machines` | ❌ Redo Step 6 |

---

## Step 8 — Set the session secret

```bash
npm run secret:put
```

Generate the value with `openssl rand -hex 32` (or a password manager) and
paste it when prompted.

| Expected output | What to do |
|---|---|
| `🌀 ... Success!` | ✅ Setup complete — now deploy with `npm run deploy` |

---

## ✅ D1 setup complete checklist

- [ ] `wrangler whoami` shows your account
- [ ] Database exists in `wrangler d1 list`
- [ ] `database_id` in `wrangler.jsonc` is yours (not a placeholder)
- [ ] Local migrations applied (15 files)
- [ ] Remote migrations applied (15 files)
- [ ] Local query returns the seeded parts
- [ ] Remote query returns 12 machines
- [ ] `AUTH_SECRET` secret set
