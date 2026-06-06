# Dynamic Multi-Tenant RBAC + ABAC Platform

A professional, **domain-agnostic** authorization backend for Node.js/Express, backed by
**PostgreSQL** (Sequelize + Umzug migrations). It implements the full spectrum of access control —
**role hierarchy, scoped permissions, attribute-based (ABAC) conditions, multi-tenancy, approval
workflows / segregation of duties, time-bound and user-level grants, and break-glass** — all
configurable by admins **at runtime** with no redeploy. The engine knows nothing about any specific
domain; two example tenants (a **hospital asset-management** system and a **project-management**
SaaS) run on the *same* engine as proof.

> Architecture, decisions, and the phased build are documented under
> `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Architecture

- **Layering:** `routes` → `controllers` → `services` → `engine`. Routes declare endpoints + guards;
  controllers are thin; services hold logic; the **engine is pure** (no DB/Express) and fully
  unit-tested.
- **Authorization model:** RBAC + a **data-driven ABAC engine**. Each grant may carry a JSON
  `condition` evaluated at request time against `{ subject, resource, environment }`. Deny overrides
  allow; scopes fall through (`any > tenant > facility > dept > own`).
- **Multi-tenancy:** shared DB, shared schema, **row-level isolation**. An `AsyncLocalStorage`
  tenant context + per-model Sequelize hooks auto-inject `where: { tenantId }` and stamp `tenantId`
  on writes, so isolation lives in one place.

```
src/
  engine/        pure RBAC+ABAC evaluator (operators, conditions, scope, can)
  db/            sequelize instance, models, tenant-scoping hooks, migrate runner
  services/      auth, rbac (roles+grants+cache), org, subject, authorize, domain, admin
  middleware/    auth (JWT), tenant-context, authorize (requirePermission/requireOwnership), error
  controllers/   thin req/res handlers
  routes/        auth, me, admin, assets, work-orders, projects, tasks
  seed.js        two fully-fleshed demo tenants
migrations/      Umzug migration(s)
test/            engine unit tests + end-to-end API + scenario suites
```

## Run it

```bash
docker compose up -d      # local Postgres on :5433
npm install
npm run db:migrate        # apply schema
npm run seed              # two demo tenants
npm start                 # http://localhost:3000
npm test                  # full suite
```

## Demo accounts

All passwords are `password`. Log in with the tenant **slug** + email.

**Hospital tenant — slug `mercy`:**

| Email | Role | Notable |
|-------|------|---------|
| `root@mercy.test`  | superadmin | `*:*:*` |
| `alice@mercy.test` | admin | `rbac:manage` + reads |
| `bob@mercy.test`   | manager | approve work orders **under 5k** and **only if not the requester**; Approvals *page* hidden by toggle |
| `carol@mercy.test` | technician | dept-scoped asset reads, own updates, create work orders |
| `dan@mercy.test`   | auditor | read-only |

**Project-management tenant — slug `acme`:**

| Email | Role | Notable |
|-------|------|---------|
| `dave@acme.test`  | pmadmin | `rbac:manage` |
| `erin@acme.test`  | lead | read any project/task |
| `frank@acme.test` | member | own projects/tasks; **cannot edit a `done` task** |

## Try it with curl

```bash
# Log in (note tenantSlug)
TOKEN=$(curl -s -X POST localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"tenantSlug":"mercy","email":"bob@mercy.test","password":"password"}' | jq -r .access_token)

curl -s localhost:3000/me/permissions -H "authorization: Bearer $TOKEN"   # effective grants
curl -s localhost:3000/me/menu        -H "authorization: Bearer $TOKEN"   # server-filtered nav
curl -s localhost:3000/assets         -H "authorization: Bearer $TOKEN"   # scope-filtered list

# Admin (needs rbac:manage) — explain a decision (the teaching endpoint)
ADMIN=$(curl -s -X POST localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"tenantSlug":"mercy","email":"alice@mercy.test","password":"password"}' | jq -r .access_token)
curl -s -X POST localhost:3000/admin/explain -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' \
  -d '{"userId":"<id>","action":"approve","resourceType":"work_order","resource":{"requestedById":"<id>","cost":9000}}'
```

## The demos that prove the design

- **Toggle overrides permission:** `bob` (manager) *holds* `work_order:approve`, but the **Approvals
  page** is disabled for the manager role, so `/me/menu` hides it. Flip it back on
  (`PUT /admin/roles/:roleId/pages/:pageId {"enabled":true}`) and it reappears immediately.
- **Segregation of duties + cost threshold:** a manager can approve a work order only when they
  aren't the requester *and* the cost is ≤ 5000 — both encoded as a single JSON condition on the
  grant, no code.
- **Genericity:** projects/tasks use the exact same engine, guards, and scope machinery as
  assets/work-orders.
- **Tenant isolation:** the `mercy` and `acme` tenants share one database and never see each other's
  rows.

## API surface (high level)

`POST /auth/login` · `GET /me` · `GET /me/permissions` · `GET /me/menu` ·
`/assets` + `/work-orders` (hospital) · `/projects` + `/tasks` (pm) ·
`/admin/{roles,grants,users/:id/roles,user-grants,resource-types,actions,pages,explain}`.
