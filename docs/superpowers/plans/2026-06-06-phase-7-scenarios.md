# Phase 7: Rich Seed + Scenario Suite — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Two fully-fleshed demo tenants (realistic roles, grants, org trees, pages, users, sample
records) so the system is explorable and the React app has real data to render — plus an
end-to-end scenario suite that demonstrates every access-control behavior in spec §10 that isn't
already directly covered.

**Architecture:** Rewrite `src/seed.js` to build the two tenants idempotently (destroy-by-slug →
recreate, relying on FK cascade). Add `test/scenarios.e2e.test.js` covering the cross-cutting
scenarios (tenant isolation over HTTP; superadmin wildcard; time-bound, user-level, and
deny-override grants via the authorize service). Update `README.md` with demo accounts.

**Tech Stack:** existing.

---

## Demo data

**Hospital tenant `mercy`** (`Mercy General`):
- Org: `Mercy General`(facility) → `Cardiology`(dept) → `Ward A`(ward); `Radiology`(dept).
- Resource types: `asset`, `work_order`.
- Roles + grants:
  - `technician`: `asset:read:dept`, `asset:update:own`, `work_order:create:any`, `work_order:read:own`
  - `manager` (← technician): `asset:read:facility`, `work_order:assign:any`,
    `work_order:approve:any` cond `{requestedById ne $user.id, cost lte 5000}`
  - `admin` (← manager): `rbac:manage:any`, `asset:read:any`
  - `auditor`: `asset:read:any`, `work_order:read:any`
  - `superadmin`: `*:*:any`
- Pages: dashboard, assets(`asset:read`), work-orders(`work_order:read`),
  approvals(`work_order:approve`), admin(`rbac:manage`). **Approvals page disabled for `manager`**
  (the toggle-overrides-permission demo).
- Users (pw `password`): `root@mercy.test`(superadmin), `alice@mercy.test`(admin, Cardiology),
  `bob@mercy.test`(manager, Cardiology), `carol@mercy.test`(technician, Cardiology),
  `dan@mercy.test`(auditor).
- Assets: MRI (Radiology, 500k), ECG (Cardiology, →carol, 8k), Pump (Cardiology, →bob, 3k),
  Bed (Ward A, 2k). Work orders: ECG (by carol, 1200), MRI (by bob, 9000).

**PM tenant `acme`** (`Acme Workspace`):
- Org: `Acme Workspace`(workspace).
- Resource types: `project`, `task`.
- Roles + grants:
  - `member`: `project:read:own`, `project:create:any`, `task:read:own`, `task:create:any`,
    `task:update:own` cond `{status ne done}`, `task:complete:own`
  - `lead` (← member): `project:read:any`, `task:read:any`, `task:update:any`
  - `pmadmin` (← lead): `rbac:manage:any`
- Pages: dashboard, projects(`project:read`), tasks(`task:read`), admin(`rbac:manage`).
- Users: `dave@acme.test`(pmadmin), `erin@acme.test`(lead), `frank@acme.test`(member).
- Projects: Apollo (→frank), Zephyr (→erin). Tasks under Apollo (→frank).

Global actions catalog: read, create, update, delete, approve, assign, dispose, complete, manage.

---

## Task 1: rewrite `src/seed.js`

Idempotent: `await Tenant.destroy({ where: { slug } })` (FK cascade clears children), then create.
A `grant(roleId, rt, action, scope, condition)` helper and a `mkUser(email, roleId, orgId)` helper
keep it compact. Seed actions via `findOrCreate` (global). Print a summary of accounts.

- [ ] Implement; run `npm run seed`; verify summary prints and re-running is clean (idempotent).

---

## Task 2: scenario suite (`test/scenarios.e2e.test.js`)

Builds isolated tenants via factories and asserts spec §10 items not already directly covered:

1. **Tenant isolation (HTTP):** two tenants each with an asset; an `asset:read:any` admin in
   tenant H lists `GET /assets` → sees only H's asset, never the other tenant's.
2. **Superadmin wildcard:** a user with `*:*:any` → `can('read','asset',{})` and
   `can('approve','work_order',{})` both allowed.
3. **Time-bound grant:** a user-grant `asset:read:any` with `expiresAt` in the past → denied;
   with a future `expiresAt` → allowed.
4. **User-level grant:** a user with NO roles but a `UserGrant` `asset:read:any` → allowed.
5. **Deny-override:** a user with an allow role-grant `asset:read:any` PLUS a `deny` user-grant
   for the same → denied.

(2–5 use the `authorize.service.can()` inside `runWithTenant` for precision; 1 is full HTTP.)

- [ ] Write → run → pass → commit.

---

## Task 3: README refresh

Update `README.md`: new architecture (Sequelize/Postgres, routes→controllers→services, engine),
run instructions (`docker compose up`, `npm run db:migrate`, `npm run seed`, `npm test`), the two
demo tenants + accounts table, and a few curl examples (login, `/me/menu`, an admin grant, explain).

- [ ] Update + commit.

---

## Phase 7 Verification Checklist

- [ ] `npm run db:migrate && npm run seed` produces both tenants; re-running seed stays clean.
- [ ] `node --test` fully green (existing + scenarios).
- [ ] Scenario suite demonstrates tenant isolation, wildcard, time-bound, user-level, deny-override.
- [ ] README documents accounts + run steps.

**Next:** Phase 6 — React demo app on top of this seeded backend.
