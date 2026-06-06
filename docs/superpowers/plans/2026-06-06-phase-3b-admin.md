# Phase 3b: Admin APIs + /admin/explain — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Runtime administration of the RBAC model — CRUD for roles (+ hierarchy), role grants
(with conditions), user-role assignments, user grants, resource types and actions — all guarded by
`requirePermission('rbac','manage')`, with **grant-cache invalidation on every write**, plus a
**`/admin/explain`** decision-trace endpoint.

**Architecture:** Admin routes mount behind `authenticate` → `tenantContext` →
`requirePermission('rbac','manage')`. Services run in tenant context so all writes are
auto-scoped/stamped. Any mutation that affects authorization calls `invalidateAll()` from
`rbac.service` (a role/grant change can affect many users; clearing the whole per-user cache is the
simple, correct choice for this scale).

**Tech Stack:** existing.

---

## Validation constants
```
SCOPES  = ['own','dept','facility','tenant','any']
EFFECTS = ['allow','deny']
```
Invalid enum / missing required field → 400. Referenced role/user must exist in the tenant
(verified via tenant-scoped `findByPk`) → 404 otherwise.

## Endpoints (all under `/admin`, guarded by rbac:manage)

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/admin/roles` | list roles |
| POST   | `/admin/roles` | create role `{name, parentRoleId?}` |
| PATCH  | `/admin/roles/:id` | update `{name?, parentRoleId?}` |
| DELETE | `/admin/roles/:id` | delete role |
| GET    | `/admin/roles/:roleId/grants` | list grants for a role |
| POST   | `/admin/roles/:roleId/grants` | create grant `{resourceTypeKey, actionKey, effect?, scope?, condition?, expiresAt?}` |
| DELETE | `/admin/grants/:id` | delete a role grant |
| GET    | `/admin/users/:userId/roles` | list a user's role ids |
| POST   | `/admin/users/:userId/roles` | assign `{roleId}` |
| DELETE | `/admin/users/:userId/roles/:roleId` | unassign |
| GET    | `/admin/users/:userId/grants` | list user grants |
| POST   | `/admin/users/:userId/grants` | create user grant `{...grant fields}` |
| DELETE | `/admin/user-grants/:id` | delete a user grant |
| GET    | `/admin/resource-types` | list resource types |
| POST   | `/admin/resource-types` | create `{key, label}` |
| DELETE | `/admin/resource-types/:id` | delete |
| GET    | `/admin/actions` | list actions (global catalog) |
| POST   | `/admin/actions` | create `{key, label}` |
| DELETE | `/admin/actions/:id` | delete |
| POST   | `/admin/explain` | `{userId, action, resourceType, resource?}` → decision trace |

> Note: `Action` is a global catalog (no tenantId); resource types are tenant-scoped.

---

## File Structure

- Create: `src/services/role.service.js` — roles + user-role assignment.
- Create: `src/services/grant.service.js` — role grants + user grants.
- Create: `src/services/catalog.service.js` — resource types + actions.
- Create: `src/controllers/admin.controller.js` — thin handlers.
- Create: `src/routes/admin.routes.js` — mounts the table above behind the guard.
- Modify: `src/app.js` — `app.use('/admin', adminRoutes)`.
- Test: `test/admin.e2e.test.js`.

---

## Task 1: role.service

```javascript
import { models } from '../db/index.js';
import { invalidateAll } from './rbac.service.js';
const { Role, User, UserRole } = models;

export const listRoles = () => Role.findAll();

export async function createRole({ name, parentRoleId = null }) {
  if (!name) throw Object.assign(new Error('name is required'), { status: 400 });
  if (parentRoleId && !(await Role.findByPk(parentRoleId))) {
    throw Object.assign(new Error('parent role not found'), { status: 404 });
  }
  const role = await Role.create({ name, parentRoleId });
  invalidateAll();
  return role;
}

export async function updateRole(id, { name, parentRoleId }) {
  const role = await Role.findByPk(id);
  if (!role) throw Object.assign(new Error('role not found'), { status: 404 });
  if (name !== undefined) role.name = name;
  if (parentRoleId !== undefined) role.parentRoleId = parentRoleId;
  await role.save();
  invalidateAll();
  return role;
}

export async function deleteRole(id) {
  const role = await Role.findByPk(id);
  if (!role) throw Object.assign(new Error('role not found'), { status: 404 });
  await role.destroy();
  invalidateAll();
}

export async function listUserRoles(userId) {
  return (await UserRole.findAll({ where: { userId } })).map((r) => r.roleId);
}

export async function assignRole(userId, roleId) {
  if (!(await User.findByPk(userId))) throw Object.assign(new Error('user not found'), { status: 404 });
  if (!(await Role.findByPk(roleId))) throw Object.assign(new Error('role not found'), { status: 404 });
  await UserRole.findOrCreate({ where: { userId, roleId } });
  invalidateAll();
}

export async function removeRole(userId, roleId) {
  await UserRole.destroy({ where: { userId, roleId } });
  invalidateAll();
}
```
(`findByPk`/`destroy`/`findOrCreate` on tenant-scoped models are auto-scoped to the tenant.)

- [ ] Build + covered by admin e2e.

---

## Task 2: grant.service

```javascript
import { models } from '../db/index.js';
import { invalidateAll } from './rbac.service.js';
const { Role, User, Grant, UserGrant } = models;

const SCOPES = ['own', 'dept', 'facility', 'tenant', 'any'];
const EFFECTS = ['allow', 'deny'];

function validateGrant(b) {
  if (!b.resourceTypeKey || !b.actionKey) throw Object.assign(new Error('resourceTypeKey and actionKey are required'), { status: 400 });
  if (b.effect && !EFFECTS.includes(b.effect)) throw Object.assign(new Error('invalid effect'), { status: 400 });
  if (b.scope && !SCOPES.includes(b.scope)) throw Object.assign(new Error('invalid scope'), { status: 400 });
}

export const listRoleGrants = (roleId) => Grant.findAll({ where: { roleId } });

export async function createRoleGrant(roleId, body) {
  if (!(await Role.findByPk(roleId))) throw Object.assign(new Error('role not found'), { status: 404 });
  validateGrant(body);
  const grant = await Grant.create({
    roleId, resourceTypeKey: body.resourceTypeKey, actionKey: body.actionKey,
    effect: body.effect ?? 'allow', scope: body.scope ?? 'any',
    condition: body.condition ?? null, expiresAt: body.expiresAt ?? null,
  });
  invalidateAll();
  return grant;
}

export async function deleteRoleGrant(id) {
  // Grant has no tenantId; ensure it belongs to a role in this tenant.
  const grant = await Grant.findByPk(id);
  if (!grant || !(await Role.findByPk(grant.roleId))) throw Object.assign(new Error('grant not found'), { status: 404 });
  await grant.destroy();
  invalidateAll();
}

export const listUserGrants = (userId) => UserGrant.findAll({ where: { userId } });

export async function createUserGrant(userId, body) {
  if (!(await User.findByPk(userId))) throw Object.assign(new Error('user not found'), { status: 404 });
  validateGrant(body);
  const grant = await UserGrant.create({
    userId, resourceTypeKey: body.resourceTypeKey, actionKey: body.actionKey,
    effect: body.effect ?? 'allow', scope: body.scope ?? 'any',
    condition: body.condition ?? null, expiresAt: body.expiresAt ?? null,
  });
  invalidateAll();
  return grant;
}

export async function deleteUserGrant(id) {
  const grant = await UserGrant.findByPk(id);
  if (!grant || !(await User.findByPk(grant.userId))) throw Object.assign(new Error('user grant not found'), { status: 404 });
  await grant.destroy();
  invalidateAll();
}
```
> Note: `Grant`/`UserGrant` carry no `tenantId`, so `findByPk` is NOT auto-scoped — we re-check the
> owning Role/User (which ARE scoped) to enforce tenant ownership before mutating.

- [ ] Build + covered by admin e2e.

---

## Task 3: catalog.service (resource types + actions)

```javascript
import { models } from '../db/index.js';
const { ResourceType, Action } = models;

export const listResourceTypes = () => ResourceType.findAll();
export async function createResourceType({ key, label }) {
  if (!key || !label) throw Object.assign(new Error('key and label are required'), { status: 400 });
  return ResourceType.create({ key, label });
}
export async function deleteResourceType(id) {
  const rt = await ResourceType.findByPk(id);
  if (!rt) throw Object.assign(new Error('resource type not found'), { status: 404 });
  await rt.destroy();
}

export const listActions = () => Action.findAll();             // global catalog
export async function createAction({ key, label }) {
  if (!key || !label) throw Object.assign(new Error('key and label are required'), { status: 400 });
  return Action.create({ key, label });
}
export async function deleteAction(id) {
  const a = await Action.findByPk(id);
  if (!a) throw Object.assign(new Error('action not found'), { status: 404 });
  await a.destroy();
}
```

- [ ] Build + covered by admin e2e.

---

## Task 4: controller + routes + explain

`admin.controller.js`: thin handlers wrapping each service fn (try/catch → next). `explain` handler
calls `explain(userId, action, resourceType, resource)` from `authorize.service`.

`admin.routes.js`:
```javascript
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { tenantContext } from '../middleware/tenant-context.js';
import { requirePermission } from '../middleware/authorize.js';
import * as c from '../controllers/admin.controller.js';

export const adminRoutes = Router();
adminRoutes.use(authenticate, tenantContext, requirePermission('rbac', 'manage'));
// ... wire the endpoint table ...
```

`app.js`: `app.use('/admin', adminRoutes)`.

- [ ] Build.

---

## Task 5: admin e2e test (`test/admin.e2e.test.js`)

Setup: tenant; an **admin user** with role granting `rbac:manage:any`; a plain **target user**.
Login as admin.

Scenarios:
- Non-admin token on any `/admin/*` → **403**.
- `POST /admin/roles` creates a role; `POST /admin/roles/:id/grants` adds `asset:read:own`.
- `POST /admin/users/:targetId/roles` assigns the role.
- Then `POST /admin/explain {userId: targetId, action:'read', resourceType:'asset', resource:{ownerId: targetId}}`
  → `decision.allowed === true` (proves cache invalidation: the grant added moments ago is visible).
- `POST /admin/resource-types {key:'asset',label:'Asset'}` → 200; appears in `GET /admin/resource-types`.
- Invalid grant scope → 400.

- [ ] Write → run → pass → commit.

---

## Phase 3b Verification Checklist

- [ ] `node --test` fully green.
- [ ] `/admin/*` rejects non-`rbac:manage` users with 403.
- [ ] Creating a grant / assigning a role is immediately reflected by `/admin/explain` (cache busted).
- [ ] Cross-tenant role/grant ids cannot be mutated (404 via owning-entity check).

**Next:** Phase 3c — Pages, per-role page toggles, filtered `/me/menu`.
