# Phase 3c: Pages, Per-Role Toggles & Filtered Menu — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** A nested page tree with `requiredPermissions`, per-role enable/disable toggles
(`RolePageAccess`), and a server-filtered **`/me/menu`** that returns only the pages a user can
reach — demonstrating that a per-role page toggle can hide a page even when the user holds the
underlying permission.

**Architecture:** Pages CRUD + toggle live under `/admin` (guarded by `rbac:manage`). `/me/menu`
builds the tree fresh per request: it resolves the subject + grants once, then for each page checks
(a) it's a menu item, (b) not toggle-disabled for any of the user's effective roles, (c) the user
satisfies the page's `requiredPermissions`. The tree is pruned top-down, so a child is only shown
under a visible ancestor.

**Tech Stack:** existing.

---

## Menu visibility rules

A page is **self-visible** for a user when ALL hold:
1. `isMenuItem === true`.
2. **Not toggle-disabled:** no `RolePageAccess` row with `enabled=false` exists for any of the
   user's effective roles + this page. (Deny-override: a single `false` hides it; flipping that
   row back to `true` reveals it.)
3. **Permission:** the user satisfies every entry in `requiredPermissions` (each `"resourceType:action"`),
   evaluated via the engine's `resolveScope` (capability mode). Empty list → passes.

The menu is then built top-down from roots (`parentId == null`); children are only recursed under
a visible parent, so ancestor access is required to reach a child.

---

## File Structure

- Create: `src/services/page.service.js` — pages CRUD + `setRolePageAccess` / `listRolePageAccess`.
- Create: `src/services/menu.service.js` — `buildMenu(userId)`.
- Modify: `src/controllers/admin.controller.js` — page handlers.
- Modify: `src/routes/admin.routes.js` — page + toggle endpoints.
- Modify: `src/controllers/me.controller.js` + `src/routes/me.routes.js` — `GET /me/menu`.
- Modify: `test/factories.js` — `makePage`, `setPageAccess`.
- Test: `test/menu.service.test.js`, `test/pages.e2e.test.js`.

---

## Admin endpoints (added)

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/admin/pages` | list pages (flat) |
| POST   | `/admin/pages` | create page |
| PATCH  | `/admin/pages/:id` | update page |
| DELETE | `/admin/pages/:id` | delete page |
| GET    | `/admin/roles/:roleId/pages` | list a role's page-access rows |
| PUT    | `/admin/roles/:roleId/pages/:pageId` | set `{enabled}` toggle (upsert) |

Plus user endpoint: `GET /me/menu`.

---

## Task 1: page.service

```javascript
import { models } from '../db/index.js';
const { Page, Role, RolePageAccess } = models;
const err = (m, s) => Object.assign(new Error(m), { status: s });

export const listPages = () => Page.findAll({ order: [['order', 'ASC']] });

export async function createPage(b) {
  if (!b.key || !b.label || !b.path) throw err('key, label and path are required', 400);
  return Page.create({
    key: b.key, label: b.label, path: b.path, icon: b.icon ?? null,
    order: b.order ?? 0, parentId: b.parentId ?? null,
    requiredPermissions: b.requiredPermissions ?? [],
    inheritFromParent: b.inheritFromParent ?? true,
    isMenuItem: b.isMenuItem ?? true,
  });
}

export async function updatePage(id, b) {
  const page = await Page.findByPk(id);
  if (!page) throw err('page not found', 404);
  for (const f of ['key', 'label', 'path', 'icon', 'order', 'parentId', 'requiredPermissions', 'inheritFromParent', 'isMenuItem']) {
    if (b[f] !== undefined) page[f] = b[f];
  }
  await page.save();
  return page;
}

export async function deletePage(id) {
  const page = await Page.findByPk(id);
  if (!page) throw err('page not found', 404);
  await page.destroy();
}

export async function listRolePageAccess(roleId) {
  if (!(await Role.findByPk(roleId))) throw err('role not found', 404);
  return RolePageAccess.findAll({ where: { roleId } });
}

export async function setRolePageAccess(roleId, pageId, enabled) {
  if (!(await Role.findByPk(roleId))) throw err('role not found', 404);
  if (!(await Page.findByPk(pageId))) throw err('page not found', 404);
  const [row] = await RolePageAccess.findOrCreate({ where: { roleId, pageId }, defaults: { enabled } });
  if (row.enabled !== enabled) { row.enabled = enabled; await row.save(); }
  return row;
}
```
(`RolePageAccess` has no tenantId; `roleId`/`pageId` are verified via tenant-scoped `Role`/`Page`.)

- [ ] Build + covered by pages e2e.

---

## Task 2: menu.service

```javascript
import { models } from '../db/index.js';
import { resolveScope } from '../engine/index.js';
import { buildSubject } from './subject.service.js';
import { collectGrants, getEffectiveRoleIds } from './rbac.service.js';
const { Page, RolePageAccess } = models;

export async function buildMenu(userId) {
  const subject = await buildSubject(userId);
  const grants = await collectGrants(userId);
  const roleIds = await getEffectiveRoleIds(userId);

  const pages = await Page.findAll(); // tenant-scoped
  const access = roleIds.length ? await RolePageAccess.findAll({ where: { roleId: roleIds } }) : [];
  const disabled = new Set(access.filter((a) => !a.enabled).map((a) => a.pageId));

  const hasPerm = (perm) => {
    const [resourceType, action] = perm.split(':');
    return resolveScope({ grants, action, resourceType, user: subject }).allowed;
  };
  const selfVisible = (p) =>
    p.isMenuItem && !disabled.has(p.id) && (p.requiredPermissions || []).every(hasPerm);

  const childrenOf = new Map();
  for (const p of pages) {
    const k = p.parentId || '__root__';
    if (!childrenOf.has(k)) childrenOf.set(k, []);
    childrenOf.get(k).push(p);
  }
  const sortFn = (a, b) => a.order - b.order || a.label.localeCompare(b.label);
  const build = (key) =>
    (childrenOf.get(key) || [])
      .slice()
      .sort(sortFn)
      .filter(selfVisible)
      .map((p) => ({ key: p.key, label: p.label, path: p.path, icon: p.icon, children: build(p.id) }));

  return build('__root__');
}
```

- [ ] Build.

---

## Task 3: controllers + routes + /me/menu

`admin.controller.js`: add `listPages/createPage/updatePage/deletePage/listRolePages/setRolePage`.
`setRolePage` reads `req.body.enabled` (must be boolean; 400 otherwise).
`admin.routes.js`: wire the page table above.
`me.controller.js`: add `getMenuHandler` → `buildMenu(req.user.userId)`.
`me.routes.js`: `meRoutes.get('/menu', getMenuHandler)`.

- [ ] Build.

---

## Task 4: menu.service unit test (`test/menu.service.test.js`)

Setup (factories): tenant; roles `user` and `manager`(parent user); a manager user; grants:
`user` role → `invoices:read:own`; `manager` role → `invoices:approve:any`. Pages:
- `dashboard` (no requiredPermissions)
- `invoices` (requires `invoices:read`)
- `approvals` (requires `invoices:approve`)
- `admin-only` (requires `rbac:manage`)

Assertions inside `runWithTenant`:
- menu keys include `dashboard`, `invoices`, `approvals`; exclude `admin-only` (no rbac:manage).
- **Toggle demo:** `setRolePageAccess(managerRoleId, approvalsPageId, false)` → menu no longer
  includes `approvals` even though the manager still holds `invoices:approve`. Re-enable → it returns.
- Nested: make `invoices` a parent of `approvals`; assert menu nests `approvals` under `invoices`.

- [ ] Write → run → pass → commit.

---

## Task 5: pages e2e (`test/pages.e2e.test.js`)

Admin (rbac:manage) logs in; `POST /admin/pages` creates a page requiring `invoices:read`;
target user with `invoices:read:own` sees it in `GET /me/menu`; `PUT /admin/roles/:r/pages/:p`
with `{enabled:false}` hides it; `{enabled:true}` reveals it. Non-admin `POST /admin/pages` → 403.

- [ ] Write → run → pass → commit.

---

## Phase 3c Verification Checklist

- [ ] `node --test` fully green.
- [ ] `/me/menu` returns only reachable pages, nested, sorted by `order`.
- [ ] A per-role `enabled:false` toggle hides a page despite the user holding the permission;
      flipping it back reveals the page (no redeploy).
- [ ] Pages CRUD + toggle require `rbac:manage`.

**Next:** Phase 4 — Hospital domain (assets, work-orders, workflows) using these guards.
