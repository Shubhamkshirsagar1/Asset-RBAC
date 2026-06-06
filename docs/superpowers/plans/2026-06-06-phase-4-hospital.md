# Phase 4: Hospital Domain (Assets & Work Orders) — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Real domain resources running on the engine — **Assets** (list/read/create/update/dispose,
scoped by department/ownership) and **Work Orders** (request → assign → approve, with
**cost-threshold** conditions and **segregation of duties**) — wired through `requirePermission`
(lists) and `requireOwnership` (single records). This is where the abstract engine becomes a
working app and every ABAC scenario shows up against live data.

**Architecture:** Domain routes mount behind `authenticate` → `tenantContext`. List endpoints use
`requirePermission(resourceType, action)`, which attaches `req.scope = { scope, descriptor }`; the
handler turns the descriptor into a Sequelize `where` (a small `scope-where` helper). Single-record
endpoints use `requireOwnership(resourceType, action, loader)`, which loads the row and runs the
full `can()` (scope + condition + deny-override + audit). No authorization logic lives in the
domain code — it all comes from grants (data).

**Tech Stack:** existing.

---

## scope → where mapping (`src/lib/scope-where.js`)

```javascript
import { Op } from 'sequelize';

// Translates the engine's list scope descriptor into a Sequelize where fragment.
// ownerFields: columns that denote "mine" (e.g. ['assignedToUserId'] or ['requestedById','assignedToUserId'])
// orgField:    the column holding the org unit (e.g. 'orgUnitId'), or null if the resource has none.
export function descriptorToWhere(descriptor, { ownerFields = [], orgField = null } = {}) {
  switch (descriptor.type) {
    case 'all':
      return {};
    case 'own':
      return ownerFields.length === 1
        ? { [ownerFields[0]]: descriptor.userId }
        : { [Op.or]: ownerFields.map((f) => ({ [f]: descriptor.userId })) };
    case 'orgUnit':
      if (!orgField) return { id: { [Op.in]: [] } }; // resource not org-scoped → match none (safe)
      return { [orgField]: { [Op.in]: descriptor.orgUnitIds } };
    default:
      return { id: { [Op.in]: [] } }; // 'none' → match none
  }
}
```
Tenant isolation is added on top automatically by the model hooks.

---

## Endpoints

**Assets** (`/assets`, resourceType `asset`):
| Method | Path | Guard | Action |
|--------|------|-------|--------|
| GET | `/assets` | `requirePermission('asset','read')` | list (scope-filtered) |
| POST | `/assets` | `requirePermission('asset','create')` | create |
| GET | `/assets/:id` | `requireOwnership('asset','read', load)` | read one |
| PATCH | `/assets/:id` | `requireOwnership('asset','update', load)` | update |
| POST | `/assets/:id/dispose` | `requireOwnership('asset','dispose', load)` | set status=disposed |

**Work Orders** (`/work-orders`, resourceType `work_order`):
| Method | Path | Guard | Action |
|--------|------|-------|--------|
| GET | `/work-orders` | `requirePermission('work_order','read')` | list (scope-filtered) |
| POST | `/work-orders` | `requirePermission('work_order','create')` | create (requestedById = caller) |
| GET | `/work-orders/:id` | `requireOwnership('work_order','read', load)` | read one |
| POST | `/work-orders/:id/assign` | `requireOwnership('work_order','assign', load)` | assign `{assigneeId}` |
| POST | `/work-orders/:id/approve` | `requireOwnership('work_order','approve', load)` | approve |

Asset owner field = `assignedToUserId`, org field = `orgUnitId`.
Work order owner fields = `requestedById`, `assignedToUserId`; no org field (org scoping deferred).

---

## File Structure

- Create: `src/lib/scope-where.js`
- Create: `src/services/asset.service.js`, `src/services/workorder.service.js`
- Create: `src/controllers/asset.controller.js`, `src/controllers/workorder.controller.js`
- Create: `src/routes/asset.routes.js`, `src/routes/workorder.routes.js`
- Modify: `src/app.js` — mount `/assets`, `/work-orders`
- Modify: `test/factories.js` — `makeAsset`, `makeWorkOrder`
- Test: `test/scope-where.test.js`, `test/hospital.e2e.test.js`

---

## Task 1: scope-where helper + unit test

Test: `descriptorToWhere` for all/own(single+multi)/orgUnit(with+without orgField)/none.

- [ ] Write failing test → implement → pass → commit.

---

## Task 2: asset.service & workorder.service

```javascript
// asset.service.js
import { models } from '../db/index.js';
const { Asset } = models;
const err = (m, s) => Object.assign(new Error(m), { status: s });

export const listAssets = (where) => Asset.findAll({ where, order: [['name', 'ASC']] });
export const findAsset = (id) => Asset.findByPk(id);

export async function createAsset(data) {
  if (!data.name) throw err('name is required', 400);
  return Asset.create({
    name: data.name, orgUnitId: data.orgUnitId ?? null,
    assignedToUserId: data.assignedToUserId ?? null,
    value: data.value ?? 0, status: data.status ?? 'active',
  });
}
export async function updateAsset(asset, data) {
  for (const f of ['name', 'orgUnitId', 'assignedToUserId', 'value', 'status']) {
    if (data[f] !== undefined) asset[f] = data[f];
  }
  await asset.save();
  return asset;
}
export async function disposeAsset(asset) { asset.status = 'disposed'; await asset.save(); return asset; }
```

```javascript
// workorder.service.js
import { models } from '../db/index.js';
const { WorkOrder } = models;
const err = (m, s) => Object.assign(new Error(m), { status: s });

export const listWorkOrders = (where) => WorkOrder.findAll({ where, order: [['status', 'ASC']] });
export const findWorkOrder = (id) => WorkOrder.findByPk(id);

export async function createWorkOrder(data, userId) {
  if (!data.assetId) throw err('assetId is required', 400);
  return WorkOrder.create({ assetId: data.assetId, requestedById: userId, cost: data.cost ?? 0, status: 'requested' });
}
export async function assignWorkOrder(wo, assigneeId) {
  if (!assigneeId) throw err('assigneeId is required', 400);
  wo.assignedToUserId = assigneeId; wo.status = 'assigned'; await wo.save(); return wo;
}
export async function approveWorkOrder(wo) { wo.status = 'approved'; await wo.save(); return wo; }
```

- [ ] Build.

---

## Task 3: controllers + routes + app wiring

Asset list handler:
```javascript
import { descriptorToWhere } from '../lib/scope-where.js';
import * as svc from '../services/asset.service.js';

export async function listAssetsHandler(req, res, next) {
  try {
    const where = descriptorToWhere(req.scope.descriptor, { ownerFields: ['assignedToUserId'], orgField: 'orgUnitId' });
    res.json({ assets: await svc.listAssets(where) });
  } catch (e) { next(e); }
}
```
Single-record handlers use `req.resource` (set by `requireOwnership`). Work-order list uses
`ownerFields: ['requestedById','assignedToUserId']`, `orgField: null`. Routes attach the guards per
the endpoint tables. `app.js` mounts both routers.

- [ ] Build.

---

## Task 4: factories

```javascript
export function makeAsset(tenantId, o = {}) {
  return Asset.create({
    tenantId, name: o.name ?? 'Asset', orgUnitId: o.orgUnitId ?? null,
    assignedToUserId: o.assignedToUserId ?? null, value: o.value ?? 0, status: o.status ?? 'active',
  });
}
export function makeWorkOrder(tenantId, o = {}) {
  return WorkOrder.create({
    tenantId, assetId: o.assetId, requestedById: o.requestedById,
    assignedToUserId: o.assignedToUserId ?? null, cost: o.cost ?? 0, status: o.status ?? 'requested',
  });
}
```

- [ ] Build.

---

## Task 5: hospital e2e (`test/hospital.e2e.test.js`) — the scenario showcase

Setup: tenant; facility F with deptA, deptB. Roles:
- `tech` grants: `asset:read:dept`, `asset:update:own`, `work_order:create:any`, `work_order:read:own`.
- `manager` grants: `asset:read:any`, `work_order:assign:any`,
  `work_order:approve:any` **condition** `{ "resource.requestedById": { "ne": "$user.id" }, "resource.cost": { "lte": 5000 } }`.

Users: `techA` (dept A, tech), `mgr` (manager, dept A). Assets: `a1`(deptA, assignedTo techA),
`a2`(deptA, assignedTo someone else), `b1`(deptB).

Scenarios (via HTTP):
1. **Dept-scoped list:** techA `GET /assets` → returns a1 & a2 (deptA), NOT b1.
2. **Ownership update:** techA `PATCH /assets/a1` → 200; `PATCH /assets/a2` → 403 (own scope, not assigned).
3. **Create + capability:** techA `POST /work-orders {assetId:a1, cost:1000}` → 201 (requested).
4. **Missing permission:** techA `POST /work-orders/:id/approve` → 403 (no approve grant).
5. **Approve under threshold by a different person:** mgr approves techA's WO (cost 1000) → 200.
6. **Segregation of duties:** mgr creates a WO (requestedBy mgr), mgr approves it → 403 (condition
   `requestedById ne $user.id` fails).
7. **Cost threshold:** a WO with cost 9000 → mgr approve → 403 (`cost lte 5000` fails).

- [ ] Write → run → pass → commit.

---

## Phase 4 Verification Checklist

- [ ] `node --test` fully green.
- [ ] List endpoints return only rows allowed by the caller's scope (own/dept/any).
- [ ] `requireOwnership` enforces ownership + ABAC conditions on single records.
- [ ] Cost-threshold and segregation-of-duties (requester ≠ approver) conditions both enforced,
      driven entirely by grant data.
- [ ] Every decision is audited.

**Next:** Phase 5 — PM domain (projects, tasks) on the same engine, proving genericity.
