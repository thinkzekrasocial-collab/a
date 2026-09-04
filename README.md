# 🏭 Globe Safety

**Machine Management + Parts Inventory Management System** for factory
operations — with Employee Management, Authentication, Role-Based Permissions,
Reports and Audit Logs.

Built Cloudflare-native: the backend is a **Cloudflare Worker + D1 (SQLite)**
REST API, with a responsive admin dashboard UI. This repository also contains a
fully working Next.js + PostgreSQL reference build so you can run and evaluate
the entire system locally before deploying to Cloudflare.

---

## ✨ Feature overview

| Module | Highlights |
|---|---|
| **Dashboard** | 9 KPI cards, unit machine summary bars, machine status breakdown, recent stock transactions, low-stock alerts |
| **Machines** | Company → Unit → Floor → Machine Type → Machine hierarchy, auto-calculated counts, status tracking (Running / Idle / Under Maintenance / Breakdown / Inactive) |
| **Parts & Inventory** | Part master, **ledger-based stock** (`opening + IN − OUT`), Stock IN / OUT with **no negative inventory**, running-balance transaction history, low-stock & out-of-stock detection |
| **Employees** | Records with salary, designation, department, joining & increment dates |
| **Auth & RBAC** | Password hashing (bcrypt / PBKDF2), signed 12-hour sessions, 23 granular permissions, 4 seeded roles (Super Admin, Manager, Technician, Viewer), custom roles |
| **Reports** | 11 reports (unit/floor/type/status, stock, transactions, low/out-of-stock, employees) + CSV export |
| **Audit log** | Login/logout, creates, updates, deletes, stock movements, user & permission changes; only Super Admin can purge |

**Security rules enforced server-side on every request:**
users can never edit the stock balance directly, Stock OUT is rejected when
insufficient, disabled users can't sign in, and every protected endpoint checks
the permission itself (the UI only hides buttons — it is never trusted).

---

## 🗂️ Repository layout

```
├── src/                     # Next.js reference app (UI + API on PostgreSQL)
│   ├── app/                 #   pages (dashboard, machines, parts, …)
│   │   └── api/             #   REST API route handlers (same contract as the Worker)
│   ├── components/          #   UI kit, app shell, toasts
│   ├── db/                  #   Drizzle schema + seed script
│   └── lib/                 #   auth (JWT+bcrypt), permissions catalog, helpers
│
├── worker/                  # ✅ Cloudflare production backend
│   ├── src/                 #   Worker code (no runtime dependencies)
│   ├── migrations/          #   15 numbered D1 migration files (SQLite)
│   ├── wrangler.jsonc       #   Worker + D1 config (paste your database_id)
│   └── package.json         #   wrangler scripts (dev, deploy, migrate:*)
│
├── DEPLOYMENT_GUIDE.md      # Beginner Cloudflare guide (15 steps with checkpoints)
├── CLOUDFLARE_D1_SETUP.md   # Interactive D1 setup walkthrough
└── TROUBLESHOOTING.md       # Error explanations + fixes
```

### Why two implementations?

The **API contract is identical** in both:

| | Next.js reference build | Cloudflare Worker |
|---|---|---|
| Purpose | Run & preview the full system locally | Production deployment target |
| Database | PostgreSQL (Drizzle ORM) | Cloudflare D1 (SQLite) |
| Auth | bcrypt + JWT (jose) | PBKDF2 + HMAC-JWT (Web Crypto) |
| Migrations | `npx drizzle-kit push` | `wrangler d1 migrations apply` |

Everything you see in the UI reads/writes through the same REST endpoints, so
switching the frontend to the deployed Worker is a matter of one environment
variable (`NEXT_PUBLIC_API_BASE`).

---

## 🚀 Quick start (local Next.js reference build)

```bash
npm install
npx drizzle-kit push          # create tables in local PostgreSQL
npx tsx src/db/seed.ts        # seed permissions, roles, users & sample data
npm run dev                   # http://localhost:3000
```

**Demo logins (password: `Ab123456`):**

| Username | Role | Access |
|---|---|---|
| `superadmin` | Super Admin | everything |
| `manager` | Manager | machines/parts/stock/employees/reports, no user management |
| `technician` | Technician | view machines, parts, ledger |
| `viewer` | Viewer | read-only dashboard, machines, parts, reports |

Try the permission model: log in as `viewer` — all add/edit/delete/stock buttons
disappear **and** calling e.g. `POST /api/stock/in` returns
`403 You do not have permission to perform this action.`

---

## ☁️ Deploying to Cloudflare (Workers + D1)

Follow **`DEPLOYMENT_GUIDE.md`** — it walks you through the full 15-step
journey with expected outputs and error recovery at every step. The short
version:

```bash
cd worker
npm install
npx wrangler login
npm run db:create                    # copy the printed database_id
# → paste the database_id into worker/wrangler.jsonc
npm run migrate:local                # test locally
npm run dev                          # http://127.0.0.1:8787
npm run migrate:remote               # apply to production
npm run secret:put                   # paste a random AUTH_SECRET
npm run deploy                       # 🎉 live on workers.dev
```

For the step-by-step D1 walkthrough with pause-and-confirm checkpoints, see
**`CLOUDFLARE_D1_SETUP.md`**.

---

## 🔌 REST API reference

All endpoints return JSON. Errors look like `{"error": "friendly message"}`
with the appropriate status code (400/401/403/404/409/500).

| Method | Path | Permission |
|---|---|---|
| POST | `/api/auth/login` | public |
| POST | `/api/auth/logout` | session |
| GET | `/api/auth/me` | session |
| GET/POST | `/api/units` | `machine.view` / `machine.create` |
| PUT/DELETE | `/api/units/:id` | `machine.edit` / `machine.delete` |
| GET/POST | `/api/floors` | `machine.view` / `machine.create` |
| PUT/DELETE | `/api/floors/:id` | `machine.edit` / `machine.delete` |
| GET/POST | `/api/machine-types` | `machine.view` / `machine.create` |
| PUT/DELETE | `/api/machine-types/:id` | `machine.edit` / `machine.delete` |
| GET/POST | `/api/machines` | `machine.view` / `machine.create` |
| PUT/DELETE | `/api/machines/:id` | `machine.edit` / `machine.delete` |
| GET/POST | `/api/parts` | `part.view` / `part.create` |
| PUT/DELETE | `/api/parts/:id` | `part.edit` / `part.delete` |
| POST | `/api/stock/in` | `stock.in` |
| POST | `/api/stock/out` | `stock.out` (rejects insufficient stock) |
| GET | `/api/transactions` | `transaction.view` |
| GET/POST | `/api/employees` | `employee.view` / `employee.create` |
| PUT/DELETE | `/api/employees/:id` | `employee.edit` / `employee.delete` |
| GET/POST | `/api/users` | `user.view` / `user.create` |
| PUT | `/api/users/:id` | `user.edit` |
| POST | `/api/users/:id/status` | `user.disable` |
| GET/POST | `/api/roles` | user mgmt / `settings.manage` |
| PUT/DELETE | `/api/roles/:id` | `settings.manage` (Super Admin locked) |
| GET | `/api/permissions` | public catalog |
| GET/DELETE | `/api/audit-logs` | `audit.view` / Super Admin only (purge) |
| GET | `/api/dashboard` | any session |
| GET | `/api/reports?type=…` | `report.view` |
| GET | `/api/export?type=…` | `report.export` (CSV) |
| GET | `/api/health` | public |

Report types: `unit-wise`, `floor-wise`, `type-wise`, `status-wise`,
`current-stock`, `stock-in`, `stock-out`, `transactions`, `low-stock`,
`out-of-stock`, `employees-by-department`.
Export types: `machines`, `parts`, `transactions`, `employees`.

---

## 🗄️ Database design

13 normalized tables with foreign keys and indexes on the hot search fields
(`machine_code`, `part_code`, `part_name`, `unit_id`, `floor_id`,
`machine_type_id`, `transaction_date`, `transaction_type`, `created_by`):

```
users ──< users_roles >── roles ──< role_permissions >── permissions
units ──< floors ──< machines >── machine_types
parts ──< stock_transactions >── users (created_by)
                             └── machines (optional)
employees
audit_logs
```

**Stock balance rule:** `current_balance = opening_stock + ΣIN − ΣOUT`, computed
in SQL on every read. The balance column does not exist — it can never go out
of sync or be edited.

---

## 🔐 Permissions catalog

`machine.view/create/edit/delete`, `part.view/create/edit/delete`,
`stock.in`, `stock.out`, `transaction.view`,
`employee.view/create/edit/delete`, `report.view`, `report.export`,
`user.view/create/edit/disable`, `settings.manage`, `audit.view`

---

## 📚 Documentation

- `DEPLOYMENT_GUIDE.md` — beginner-friendly Cloudflare deployment (15 steps)
- `CLOUDFLARE_D1_SETUP.md` — interactive D1 walkthrough
- `TROUBLESHOOTING.md` — common errors and fixes
- `worker/README.md` — Worker internals & API notes
