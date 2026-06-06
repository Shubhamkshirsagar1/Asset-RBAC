# Phase 1: Foundation — Implementation Plan (Sequelize)

> **Status: IMPLEMENTED & VERIFIED.** This plan was originally drafted for Prisma; per a
> requirement change it was re-targeted to **Sequelize + Umzug**. This document reflects what
> was actually built. Full source lives in the referenced files; key/non-obvious code is shown.

**Goal:** Stand up the foundation — local Postgres, Sequelize models + Umzug migration, a
tenant-scoping layer, JWT auth (login), tenant-context middleware, and the
routes→controllers→services skeleton — proven by a passing login + tenant-isolation test suite.

**Architecture:** Express app layered as routes → controllers → services, with a `db/` layer
wrapping Sequelize. Multi-tenancy is enforced centrally: an `AsyncLocalStorage` carries the
request's `tenantId`, and **per-model Sequelize hooks** auto-inject `where: { tenantId }` on
reads/bulk-writes and stamp `tenantId` on create. Auth issues a JWT carrying `userId` + `tenantId`.

**Tech Stack:** Node ≥18 (ESM), Express 4, Sequelize 6 + `pg`, Umzug 3 (migrations),
jsonwebtoken, bcryptjs, dotenv, built-in `node:test`.

---

## File Structure (as built)

- `docker-compose.yml` — local Postgres (host port **5433** to avoid a conflict with an existing
  Postgres + kind cluster on 5432).
- `.env.example` / `.env` — `DATABASE_URL` (5433), `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`.
- `migrations/0001-init.js` — Umzug migration creating all tables (UUID PKs).
- `src/config.js` — env-backed config loader.
- `src/db/sequelize.js` — Sequelize instance from `config.databaseUrl`.
- `src/db/models.js` — all model definitions + base associations.
- `src/db/tenant-context.js` — `AsyncLocalStorage` (`runWithTenant`/`getTenantId`/`requireTenantId`).
- `src/db/tenant-hooks.js` — per-model hooks enforcing tenant isolation.
- `src/db/index.js` — wires sequelize + models + hooks; exports `{ sequelize, models }`.
- `src/db/migrate.js` — Umzug runner (CLI: `up`/`down`) with an ESM resolver.
- `src/lib/password.js`, `src/lib/jwt.js` — hashing + JWT helpers.
- `src/services/auth.service.js` — `login()` + `AuthError`.
- `src/controllers/auth.controller.js` — `postLogin` (thin).
- `src/routes/auth.routes.js` — `POST /auth/login`.
- `src/middleware/{auth,tenant-context,error}.js`.
- `src/app.js` / `src/index.js` — wiring + entry (`sequelize.authenticate()` then listen).
- `src/seed.js` — seeds hospital (`mercy`) + pm (`acme`) tenants, one user each.
- `test/` — `tenant-context`, `tenant-scope`, `lib`, `auth.service`, `auth.e2e` (+ `helpers.js`).

---

## Tasks (all completed)

- **Task 0** — Removed the in-memory implementation (preserved in the `baseline` commit).
- **Task 1** — `docker-compose.yml` (Postgres 16, port 5433) + env. Verified container healthy.
- **Task 2** — Dependencies: `sequelize`, `pg`, `pg-hstore`, `umzug`, `dotenv` (+ existing
  express/jwt/bcrypt). Scripts: `db:up/down`, `db:migrate[:down]`, `seed`, `test`.
- **Task 3** — `src/db/sequelize.js` + `src/db/models.js` (19 models, UUID PKs, ENUMs for
  tenant type / effect / scope / decision, JSONB for `attributes`/`condition`, `ARRAY(STRING)`
  for `requiredPermissions`). `migrations/0001-init.js` creates all tables; `src/db/migrate.js`
  runs Umzug. Verified: `npm run db:migrate` applies `0001-init`.
- **Task 4** — `src/config.js`. Verified loads.
- **Task 5** — `src/db/tenant-context.js`. 3 unit tests.
- **Task 6** — `src/db/tenant-hooks.js` + `src/db/index.js`. 3 isolation tests.
- **Task 7** — `src/lib/password.js`, `src/lib/jwt.js`. 3 unit tests.
- **Task 8** — `src/services/auth.service.js`. 3 service tests.
- **Tasks 9–12** — controller, route, middleware (auth/tenant-context/error), app + index.
- **Task 13** — `src/seed.js`. Verified seeds both tenants.
- **Task 14** — `test/helpers.js` + `test/auth.e2e.test.js`. 3 e2e tests.

**Result: 16/16 tests pass.** Runtime verified: `/health` → `{ok:true}`; login → JWT;
`/me/context` echoes `{ userId, tenantId }`.

---

## Key implementation notes & gotchas (learnings)

### Tenant context — `src/db/tenant-context.js`
`runWithTenant` awaits the callback **inside** the ALS scope:
```javascript
export function runWithTenant(tenantId, callback) {
  return storage.run({ tenantId }, async () => callback());
}
```
(Originally on Prisma this was essential because Prisma promises are *lazy* — their client
extension ran at await-time; awaiting outside the scope lost context. On Sequelize the queries
are eager, but awaiting inside scope remains the correct, robust form.)

### Tenant hooks — `src/db/tenant-hooks.js` (two real bugs found via TDD)
1. **Stamp on `beforeValidate`, not `beforeCreate`.** Sequelize runs `allowNull` validation
   *before* `beforeCreate`, so a null `tenantId` would fail validation before it could be stamped.
2. **Register hooks per-model, not globally.** A global `beforeFind` hook does **not** receive
   `options.model`, so there's no reliable way to tell if the model is tenant-scoped. We iterate
   `sequelize.models`, skip any without a `tenantId` attribute, and add the hooks on each scoped
   model (capturing the model in closure).
```javascript
export function installTenantHooks(sequelize) {
  for (const model of Object.values(sequelize.models)) {
    if (!model.rawAttributes?.tenantId) continue;
    model.addHook('beforeFind', injectWhere);
    model.addHook('beforeCount', injectWhere);
    model.addHook('beforeBulkUpdate', injectWhere);
    model.addHook('beforeBulkDestroy', injectWhere);
    model.addHook('beforeValidate', stamp);
    model.addHook('beforeBulkCreate', (rows) => { for (const r of rows) stamp(r); });
  }
}
```
Platform/login/seed code runs **outside** any tenant context, so `getTenantId()` is undefined and
the hooks no-op — exactly the "platform scope" behavior we want.

### Umzug ESM resolver — `src/db/migrate.js`
Umzug's default `.js` resolver doesn't import ESM migrations cleanly, so we supply a resolver that
`import()`s each file via `pathToFileURL` and calls its `up`/`down`.

---

## Phase 1 Verification Checklist (all ✅)

- ✅ `docker compose ps` → Postgres healthy on 5433.
- ✅ `npm run db:migrate` applies `0001-init`.
- ✅ `npm run seed` succeeds.
- ✅ `node --test` → 16/16.
- ✅ `npm start` boots; `curl localhost:3000/health` → `{"ok":true}`.
- ✅ login returns a JWT; `/me/context` echoes the tenant.

**Next:** Phase 2 (Engine) — write `phase-2-engine.md` and build the pure `can()` evaluator +
operator library on this foundation.
