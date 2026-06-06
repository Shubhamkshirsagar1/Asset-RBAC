# Phase 3a: RBAC Services + Authorize Bridge + /me — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Wire the pure engine to the database — resolve a user's effective roles (with hierarchy
+ cache), collect their grants, resolve org-scope id sets, build the engine subject, and expose
`can()` / `listScope()` (with audit logging) plus `requirePermission` / `requireOwnership`
middleware and `/me` + `/me/permissions` endpoints.

**Architecture:** Services run *inside* the request's tenant context (so all model reads are
auto-scoped). The engine stays pure; these services are the impure adapter that feeds it real
data and records decisions.

**Tech Stack:** existing (Sequelize, engine, Express, node:test).

---

## File Structure

- Create: `src/services/org.service.js` — `resolveScopeIds(userId)` → `{ departmentIds, facilityIds }`.
- Create: `src/services/rbac.service.js` — `getEffectiveRoleIds`, `collectGrants` (+ cache + `invalidateUser`/`invalidateAll`).
- Create: `src/services/subject.service.js` — `buildSubject(userId)`.
- Create: `src/services/authorize.service.js` — `can()`, `listScope()`, `explain()` + audit.
- Create: `src/services/me.service.js` — `getMe`, `getPermissions`.
- Create: `src/middleware/authorize.js` — `requirePermission`, `requireOwnership`.
- Create: `src/controllers/me.controller.js`, `src/routes/me.routes.js`.
- Modify: `src/app.js` — mount `/me` behind `authenticate` + `tenantContext`.
- Create: `test/factories.js` — builds a tenant RBAC graph for tests.
- Test: `test/org.service.test.js`, `test/rbac.service.test.js`, `test/authorize.service.test.js`,
  `test/me.e2e.test.js`.

---

## Org scope semantics

A user belongs to OrgUnits (`UserOrgUnit`). The OrgUnit tree is `facility → department → ward`.
- **departmentIds** = the subtree under each unit the user directly belongs to (a dept head sees
  sub-units too).
- **facilityIds** = the subtree under the top-most ancestor (facility) of each of the user's units
  (facility scope = the user's whole facility).

These id sets are placed on the engine subject; the engine does pure set membership.

---

## Task 1: org.service — resolveScopeIds

Logic: load the tenant's OrgUnits (auto-scoped), build `childrenOf` map; for the user's direct
unit ids compute department subtree and facility subtree.

Key code:
```javascript
import { models } from '../db/index.js';
const { OrgUnit, UserOrgUnit } = models;

function subtree(rootId, childrenOf) {
  const out = [], stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    out.push(id);
    for (const c of childrenOf.get(id) || []) stack.push(c);
  }
  return out;
}

export async function resolveScopeIds(userId) {
  const memberships = await UserOrgUnit.findAll({ where: { userId } });
  const directIds = memberships.map((m) => m.orgUnitId);
  if (!directIds.length) return { departmentIds: [], facilityIds: [] };

  const units = await OrgUnit.findAll();           // tenant-scoped
  const byId = new Map(units.map((u) => [u.id, u]));
  const childrenOf = new Map();
  for (const u of units) {
    if (!u.parentId) continue;
    if (!childrenOf.has(u.parentId)) childrenOf.set(u.parentId, []);
    childrenOf.get(u.parentId).push(u.id);
  }

  const departmentIds = [...new Set(directIds.flatMap((id) => subtree(id, childrenOf)))];

  const facilityRoots = new Set();
  for (const id of directIds) {
    let cur = byId.get(id);
    while (cur && cur.parentId && byId.get(cur.parentId)) cur = byId.get(cur.parentId);
    if (cur) facilityRoots.add(cur.id);
  }
  const facilityIds = [...new Set([...facilityRoots].flatMap((id) => subtree(id, childrenOf)))];

  return { departmentIds, facilityIds };
}
```

Tests (with seeded tree facility→dept→ward, user in dept): departmentIds includes dept+ward,
facilityIds includes facility+dept+ward; user with no membership → empty arrays.

- [ ] Write failing test → implement → pass → commit.

---

## Task 2: rbac.service — effective roles, grant collection, cache

Key code:
```javascript
import { models } from '../db/index.js';
const { UserRole, Role, Grant, UserGrant } = models;

const grantCache = new Map(); // userId -> engine grants

export function invalidateUser(userId) { grantCache.delete(userId); }
export function invalidateAll() { grantCache.clear(); }

export async function getEffectiveRoleIds(userId) {
  const direct = (await UserRole.findAll({ where: { userId } })).map((r) => r.roleId);
  if (!direct.length) return [];
  const roles = await Role.findAll();              // tenant-scoped
  const byId = new Map(roles.map((r) => [r.id, r]));
  const effective = new Set();
  for (const id of direct) {
    let cur = byId.get(id);
    while (cur && !effective.has(cur.id)) {
      effective.add(cur.id);
      cur = cur.parentRoleId ? byId.get(cur.parentRoleId) : null;
    }
  }
  return [...effective];
}

const toEngineGrant = (g) => ({
  id: g.id, effect: g.effect, resourceTypeKey: g.resourceTypeKey, actionKey: g.actionKey,
  scope: g.scope, condition: g.condition, expiresAt: g.expiresAt,
});

export async function collectGrants(userId) {
  if (grantCache.has(userId)) return grantCache.get(userId);
  const roleIds = await getEffectiveRoleIds(userId);
  const roleGrants = roleIds.length ? await Grant.findAll({ where: { roleId: roleIds } }) : [];
  const userGrants = await UserGrant.findAll({ where: { userId } });
  const grants = [...roleGrants, ...userGrants].map(toEngineGrant);
  grantCache.set(userId, grants);
  return grants;
}
```

Tests (seeded role hierarchy admin→manager→user, grants on each): effective roles include
ancestors; collectGrants merges role + user grants; second call hits cache (stub: mutate DB,
assert cached result unchanged until invalidateUser).

- [ ] Write failing test → implement → pass → commit.

---

## Task 3: subject.service — buildSubject

```javascript
import { models } from '../db/index.js';
import { resolveScopeIds } from './org.service.js';
const { User } = models;

export async function buildSubject(userId) {
  const user = await User.findByPk(userId);        // tenant-scoped (where adds tenantId)
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  const { departmentIds, facilityIds } = await resolveScopeIds(userId);
  return { id: user.id, tenantId: user.tenantId, departmentIds, facilityIds, attributes: user.attributes || {} };
}
```

- [ ] Covered via authorize.service tests.

---

## Task 4: authorize.service — can / listScope / explain + audit

```javascript
import { models } from '../db/index.js';
import { evaluateAccess, resolveScope } from '../engine/index.js';
import { buildSubject } from './subject.service.js';
import { collectGrants } from './rbac.service.js';
const { AuditLog } = models;

async function record(subject, action, resourceType, resourceId, decision) {
  await AuditLog.create({
    tenantId: subject.tenantId, userId: subject.id, action, resourceType,
    resourceId: resourceId ?? null, decision: decision.allowed ? 'allow' : 'deny',
    reason: decision.reason, matchedGrantId: decision.matchedGrant?.id ?? null,
  });
}

export async function can(userId, action, resourceType, resource = null, env = { now: new Date() }) {
  const subject = await buildSubject(userId);
  const grants = await collectGrants(userId);
  const decision = evaluateAccess({ grants, action, resourceType, user: subject, resource, env });
  await record(subject, action, resourceType, resource?.id, decision);
  return decision;
}

export async function listScope(userId, action, resourceType, env = { now: new Date() }) {
  const subject = await buildSubject(userId);
  const grants = await collectGrants(userId);
  return resolveScope({ grants, action, resourceType, user: subject, env });
}

// Non-auditing dry-run for /admin/explain (Phase 3b).
export async function explain(userId, action, resourceType, resource = null, env = { now: new Date() }) {
  const subject = await buildSubject(userId);
  const grants = await collectGrants(userId);
  const decision = evaluateAccess({ grants, action, resourceType, user: subject, resource, env });
  return { decision, subject, consideredGrants: grants.length };
}
```

Tests (seeded user with `invoices:read:own` style grant): `can()` allows own resource, denies
others, writes an AuditLog row with correct decision/reason; `listScope` returns the descriptor.

- [ ] Write failing test → implement → pass → commit.

---

## Task 5: authorize middleware

```javascript
import { can, listScope } from '../services/authorize.service.js';

export function requirePermission(resourceType, action) {
  return async (req, res, next) => {
    try {
      const result = await listScope(req.user.userId, action, resourceType);
      if (!result.allowed) return res.status(403).json({ error: 'Forbidden' });
      req.scope = result; // { scope, descriptor }
      next();
    } catch (e) { next(e); }
  };
}

export function requireOwnership(resourceType, action, loader) {
  return async (req, res, next) => {
    try {
      const resource = await loader(req);
      if (!resource) return res.status(404).json({ error: 'Not found' });
      const decision = await can(req.user.userId, action, resourceType, resource);
      if (!decision.allowed) return res.status(403).json({ error: 'Forbidden' });
      req.resource = resource;
      next();
    } catch (e) { next(e); }
  };
}
```

---

## Task 6: /me endpoints

`me.service.js`: `getMe(userId)` → `{ id, email, tenantId, attributes, roleIds }`;
`getPermissions(userId)` → `collectGrants(userId)`.
`me.controller.js` + `me.routes.js`: `GET /me`, `GET /me/permissions`.
`app.js`: `app.use('/me', authenticate, tenantContext, meRoutes)` (keep `/me/context` too, or fold in).

Tests (`me.e2e.test.js`): login → `GET /me` returns user + roleIds; `GET /me/permissions`
returns the seeded grants; unauthenticated → 401.

- [ ] Write failing test → implement → pass → commit.

---

## Phase 3a Verification Checklist

- [ ] `node --test` fully green (prior suites + 4 new).
- [ ] `can()` writes an AuditLog row per decision; reason + matchedGrantId populated.
- [ ] Effective roles include hierarchy ancestors; grant cache busts via `invalidateUser`.
- [ ] `requirePermission` (capability/list) and `requireOwnership` (single resource) both enforce.

**Next:** Phase 3b — Admin APIs + `/admin/explain` + cache invalidation on writes.
