# Dynamic Multi-Tenant RBAC + ABAC Platform — Design Spec

**Date:** 2026-06-06
**Status:** Approved design, pending implementation plan
**Location:** `RBAC/`

## 1. Goal

Build a **professional, domain-agnostic, dynamic RBAC + ABAC backend** for Node.js/Express,
backed by a **local PostgreSQL**, restructured into **routes → controllers → services**, plus a
**React demo app**. The engine must support the full spectrum of real-world access control
(role hierarchy, scoped permissions, attribute-based conditions, multi-tenancy, approvals /
segregation of duties, time-bound and user-level grants, break-glass) and let **admins control
everything at runtime** without redeploys.

The learning objective is to understand the mechanics of dynamic RBAC + multi-tenancy by
**building the authorization engine ourselves** (not adopting a black-box library).

## 2. Domains

The engine is domain-agnostic. Two example tenants run on the *same* engine as proof:

- **Hospital Asset Management** — the rich, fully-featured primary demo.
- **Multi-Tenant SaaS Project Management** — a second tenant proving the engine is generic
  (own resources/roles, lighter UI).

Adding a brand-new resource type (e.g. `Prescription`, `Invoice`) is a configuration change
(a `ResourceType` row + grants), **not** a code change.

## 3. Architecture decisions

- **Authorization model:** RBAC + a **data-driven ABAC/policy engine**. Each grant may carry an
  optional **JSON condition** evaluated at request time against `{ subject, resource, env }`.
  We build the evaluator ourselves. (CASL may be used on the React side for cosmetic UI gating
  only; server-side is the source of truth.)
- **Multi-tenancy:** shared database, shared schema, **row-level isolation** via a `tenantId`
  column on all tenant-scoped tables. Global **Sequelize hooks** (`beforeFind`/`beforeCreate`/
  `beforeBulkCreate`/`beforeUpdate`/`beforeBulkUpdate`/`beforeDestroy`/`beforeBulkDestroy`/
  `beforeCount`) read the current tenant from an `AsyncLocalStorage` context and auto-inject
  `where: { tenantId }` / stamp `tenantId` on writes, so isolation is enforced in one place. A
  **platform scope** sits above tenants (`PLATFORM_SUPERADMIN` can create tenants and cross
  boundaries) by running queries outside the tenant context.
- **Backend layering:** `routes` (paths + guards) → `controllers` (thin req/res ↔ service) →
  `services` (business logic, no Express) → `engine` (pure, unit-testable authorization core).
- **ORM:** Sequelize (with `pg`). **Migrations:** Umzug (ESM-friendly, programmatic).
  **DB:** PostgreSQL via Docker Compose (one-command local setup).

## 4. Project structure

```
RBAC/
  docker-compose.yml            # local Postgres (+ optional pgAdmin)
  docs/superpowers/specs/       # this spec
  server/
    migrations/                 # Umzug migration files (versioned schema)
    src/
      routes/                   # HTTP surface only — path -> controller, attach guards
      controllers/              # parse req/res, call services, shape responses
      services/                 # business logic (auth, rbac, tenancy, domain)
      engine/                   # the ABAC/RBAC authorization engine (pure)
      middleware/               # auth, tenant-context, authorize, error
      db/                       # sequelize instance, models, tenant-scoping hooks, migrate runner
      seed.js                   # seeds 2 tenants: Hospital + PM
      config.js
      app.js / index.js
    test/                       # engine unit tests + end-to-end API tests
  web/                          # React + Vite demo app (admin console + domain screens)
```

Layer contract: **routes** declare endpoints and guards; **controllers** are thin; **services**
hold logic and never touch Express; **engine** is pure and testable in isolation.

## 5. Data model

### A. Subjects, tenancy & hierarchy (generic)
- **Tenant** — `id, slug, name, type (hospital | pm)`. The isolation boundary.
- **User** — `id, tenantId, email, password, attributes (JSON)`. `attributes` holds ABAC facts
  (region, title, shift, etc.).
- **OrgUnit** — `id, tenantId, parentId, type, name`. Generic hierarchy tree. Hospital uses it as
  *facility → department → ward*; PM uses it as *workspace*.
- **UserOrgUnit** — membership (user belongs to one or more org units). Feeds `dept`/`facility`
  scope checks.

### B. RBAC + ABAC core (engine data — fully admin-managed)
- **Role** — `id, tenantId, name, parentRoleId, isSystem`. Hierarchy/inheritance per tenant.
- **UserRole** — assigns roles to users.
- **ResourceType** — `key, label, tenantId`. Dynamic catalog of actionable things
  (`asset`, `work_order`, `project`, `task`).
- **Action** — `key, label` (`read, create, update, delete, approve, assign, dispose, …`).
- **Grant** — the centerpiece: `roleId, resourceTypeKey, actionKey, effect (allow|deny),
  scope (own|dept|facility|tenant|any), condition (JSON), expiresAt (nullable)`.
  ABAC lives in `condition`. **deny** overrides **allow**.
- **UserGrant** — same shape as Grant but bound to `userId` instead of `roleId`. Explicit
  per-user allow/deny outside roles.
- **Page** — `tenantId, key, label, path, parentId, requiredPermissions[], inheritFromParent,
  isMenuItem`. Nested nav tree.
- **RolePageAccess** — `roleId, pageId, enabled`. Runtime per-role page toggle.

### C. Domain data (runs on the core)
- **Hospital:** `Asset` (orgUnit=department, assignedToUserId, status, value),
  `WorkOrder` (asset, requestedById, assignedToUserId, status, cost, approvals),
  light `Vendor` / `Contract`.
- **PM:** `Project` (orgUnit=workspace, ownerId), `Task` (project, assigneeId, status).
- Every domain record carries `tenantId` + an owner/assignment field + a status, so it naturally
  exercises `own`, assignment, status-based, and cost-threshold conditions.

### D. Observability
- **AuditLog** — `tenantId, userId, action, resourceType, resourceId, decision (allow|deny),
  reason, matchedGrantId, ts`. Every authorization decision recorded with *why*.

A + B are domain-agnostic and fully configurable by admins; C is data that plugs in.

## 6. Authorization engine — `can(user, action, resourceType, resource?, env)`

Pure, unit-testable. Evaluation order:

1. **Resolve effective roles** — walk role hierarchy, cached per user; cache busted on any admin write.
2. **Collect grants** — from roles + `UserGrant`, filtered to action/resourceType, not expired.
3. **Deny-overrides** — any matching `deny` grant → denied immediately.
4. **Scope check** — ordering `any > tenant > facility > dept > own`; a broader scope satisfies a
   narrower requirement, never the reverse.
5. **Condition eval** — run the grant's JSON condition against `{ subject, resource, env }` via an
   operator library: `eq, ne, in, lt, lte, gt, owner, deptMember, timeWindow, statusIs, exists`.
   Operators resolve `$`-refs like `$user.departmentIds`.
6. **Decision + AuditLog** — record matched grant and human-readable reason.

For lists (no single resource) the engine returns a **scope descriptor** the service converts to a
`where` filter (e.g. `own` → `{ assignedToUserId: user.id }`).

Two guards (mirrors the original project):
- `requirePermission(resourceType, action)` — capability gate for list endpoints; handler then
  filters rows by scope descriptor.
- `requireOwnership(resourceType, action, loader)` — loads the specific record and enforces
  conditions on it.

**Break-glass:** modeled as a condition / override path, fully audited.

## 7. API surface

- **Auth:** `POST /auth/login` → JWT carrying `userId, tenantId`.
- **Me:** `GET /me`, `GET /me/permissions` (flattened), `GET /me/menu` (server-filtered nav).
- **Domain — Hospital:** `assets`, `work-orders` (+ `/approve`, `/assign`, `/dispose`).
- **Domain — PM:** `projects`, `tasks`.
- **Admin (tenant-scoped, guarded by `rbac:manage`):** CRUD for roles, role hierarchy, grants
  (with conditions), user-role assignment, user grants, resource types, actions, pages, page
  toggles. Plus **`POST /admin/explain`** — runs a hypothetical `can()` and returns the decision
  trace (teaching tool).
- **Platform:** `GET/POST /platform/tenants` for the superadmin to create/seed tenants.

## 8. React demo app (Vite + React)

Lightweight styling, no heavy design system. Server stays the source of truth; UI gating is cosmetic.

- **Login** + tenant indicator.
- **Dynamic nav** rendered verbatim from `/me/menu`.
- **Domain screens:** Hospital assets/work-orders tables with action buttons that gray out per
  permission; lighter PM screens.
- **Admin console:** roles & hierarchy editor, a **grant builder** (resource/action/scope + visual
  condition editor that emits the JSON), user-role assignment, page toggles, and a **"Why?"
  explainer** calling `/admin/explain`.

## 9. Local Postgres & testing

- **`docker-compose.yml`** spins up Postgres locally in one command. Sequelize defines the
  models; Umzug runs versioned migrations; `src/seed.js` seeds the data.
- **Seed** creates both tenants with realistic roles, users, org trees, grants, and sample records
  demonstrating every condition type.
- **Tests:**
  - Engine unit tests — operators, scope fallthrough, deny-override, expiry, break-glass.
  - End-to-end API tests — tenant isolation, ownership enforcement, dynamic page toggle, audit
    logging, the manager-approvals override demo from the original project.

## 10. Scenarios the system must demonstrate

- Role hierarchy / inheritance (admin → manager → user).
- Wildcard + scoped permissions with scope fallthrough.
- Ownership / assignment ABAC (`asset.assignedToUserId === user.id`).
- Department / facility membership scope.
- Cost-threshold conditions (e.g. work-order approval only under a value).
- Status-based conditions (act only on `draft`, not `approved`).
- Time/shift-window conditions.
- Deny-override exceptions.
- Time-bound (expiring) grants.
- Explicit user-level grants outside roles.
- Break-glass emergency override (audited).
- Dynamic per-role page enable/disable overriding a held permission.
- Strict tenant isolation between Hospital and PM tenants.
- Full audit trail with decision reasons.

## 11. Out of scope (documented stretch goals)

- Delegation / act-on-behalf-of.
- Redis-backed distributed permission cache (single-process `Map` for now).
- Refresh tokens / full session management (single access token for the demo).
- SSO / external IdP integration.

## 12. Build phasing

The system is built in phases, each independently verifiable:

1. **Foundation** — Docker Postgres, Sequelize models + Umzug migration, tenant-scoping hooks, auth, project restructure.
2. **Engine** — pure `can()` evaluator + operator library + unit tests.
3. **Core RBAC services & admin APIs** — roles, grants, pages, user grants, explain endpoint.
4. **Hospital domain** — assets, work-orders, workflows + e2e tests.
5. **PM domain** — projects, tasks (proves genericity).
6. **React app** — login, dynamic nav, domain screens, admin console, explainer.
7. **Seed + scenario tests** — demonstrate every scenario in §10.
