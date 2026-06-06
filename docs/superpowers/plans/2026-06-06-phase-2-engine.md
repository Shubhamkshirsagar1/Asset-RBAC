# Phase 2: Authorization Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans / subagent-driven-development.
> Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the **pure** RBAC+ABAC decision engine — operator library, condition evaluator,
scope logic, and the `can()` decision function — with no DB or Express dependencies, proven by
thorough unit tests.

**Architecture:** The engine receives already-collected grants and a request context and returns
a decision. Data fetching (effective roles, grant collection, caching, audit logging) is the
*service* layer's job (Phase 3) — the engine stays pure so every rule is unit-testable in
isolation. The service in later phases resolves the org hierarchy into `departmentIds` /
`facilityIds` arrays on the subject, so the engine only does value/set comparisons.

**Tech Stack:** Node ESM, built-in `node:test`. No new dependencies.

---

## Data shapes (contracts)

```
Subject  = { id, tenantId, departmentIds: string[], facilityIds: string[], attributes: object }
Resource = arbitrary object | null   // e.g. { ownerId, assignedToUserId, orgUnitId, status, value }
Env      = { now: Date }
Grant    = {
  id, effect: 'allow'|'deny', resourceTypeKey: string|'*', actionKey: string|'*',
  scope: 'own'|'dept'|'facility'|'tenant'|'any', condition: object|null, expiresAt: Date|null
}
Decision = { allowed: boolean, effect: 'allow'|'deny'|null, scope: string|null,
             matchedGrant: Grant|null, reason: string }
```

**Condition grammar:** an object mapping a context path → an operator object. Entries AND together.
```
{ "resource.ownerId": { "owner": true },
  "resource.orgUnitId": { "in": "$user.departmentIds" },
  "resource.value": { "lte": 5000 } }
```
- Left key is a dotted path into ctx `{ user, resource, env }` (e.g. `resource.value`, `user.attributes.region`).
- Operand may be a literal or a `$`-ref (`"$user.id"` → ctx.user.id).

---

## File Structure

- Create: `src/engine/operators.js` — `getPath`, `resolveOperand`, `operators` registry.
- Create: `src/engine/conditions.js` — `evaluateCondition(condition, ctx)`.
- Create: `src/engine/scope.js` — scope ranking, single-resource scope check, list filter descriptor.
- Create: `src/engine/can.js` — `evaluateAccess(req)` and `resolveScope(req)`.
- Create: `src/engine/index.js` — re-exports the public API.
- Test: `test/engine.operators.test.js`, `test/engine.conditions.test.js`,
  `test/engine.scope.test.js`, `test/engine.can.test.js`.

---

## Task 1: Operators + path/ref resolution

**Files:** Create `src/engine/operators.js`; Test `test/engine.operators.test.js`.

- [ ] **Step 1: Write failing tests**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPath, resolveOperand, operators } from '../src/engine/operators.js';

const ctx = {
  user: { id: 'u1', departmentIds: ['d1', 'd2'], attributes: { region: 'EU' } },
  resource: { ownerId: 'u1', orgUnitId: 'd2', value: 4000, status: 'draft' },
  env: { now: new Date('2026-06-06T10:00:00Z') },
};

test('getPath reads nested paths', () => {
  assert.equal(getPath(ctx, 'resource.value'), 4000);
  assert.equal(getPath(ctx, 'user.attributes.region'), 'EU');
  assert.equal(getPath(ctx, 'resource.missing'), undefined);
});

test('resolveOperand resolves $-refs and passes literals through', () => {
  assert.equal(resolveOperand('$user.id', ctx), 'u1');
  assert.deepEqual(resolveOperand('$user.departmentIds', ctx), ['d1', 'd2']);
  assert.equal(resolveOperand(5000, ctx), 5000);
  assert.equal(resolveOperand('literal', ctx), 'literal');
});

test('comparison operators', () => {
  assert.equal(operators.eq('u1', 'u1', ctx), true);
  assert.equal(operators.ne('a', 'b', ctx), true);
  assert.equal(operators.lt(3, 5, ctx), true);
  assert.equal(operators.lte(5, 5, ctx), true);
  assert.equal(operators.gt(6, 5, ctx), true);
  assert.equal(operators.in('d2', ['d1', 'd2'], ctx), true);
  assert.equal(operators.in('x', ['d1'], ctx), false);
});

test('owner / deptMember / statusIs / exists', () => {
  assert.equal(operators.owner('u1', true, ctx), true);   // actual === ctx.user.id
  assert.equal(operators.owner('u9', true, ctx), false);
  assert.equal(operators.deptMember('d2', true, ctx), true); // ctx.user.departmentIds includes actual
  assert.equal(operators.statusIs('draft', ['draft', 'new'], ctx), true);
  assert.equal(operators.statusIs('done', 'draft', ctx), false);
  assert.equal(operators.exists('x', true, ctx), true);
  assert.equal(operators.exists(undefined, true, ctx), false);
});

test('timeWindow compares env time-of-day to a window', () => {
  // 10:00 UTC within 09:00-17:00
  assert.equal(operators.timeWindow(ctx.env.now, { start: '09:00', end: '17:00' }, ctx), true);
  assert.equal(operators.timeWindow(ctx.env.now, { start: '18:00', end: '20:00' }, ctx), false);
});
```

- [ ] **Step 2: Run — expect FAIL** (`node --test test/engine.operators.test.js`).

- [ ] **Step 3: Implement `src/engine/operators.js`**

```javascript
export function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

// A string starting with `$` is a ref into ctx (minus the `$`); everything else is a literal.
export function resolveOperand(operand, ctx) {
  if (typeof operand === 'string' && operand.startsWith('$')) {
    return getPath(ctx, operand.slice(1));
  }
  return operand;
}

function hhmm(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}
function parseHHMM(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

export const operators = {
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  in: (a, b) => Array.isArray(b) && b.includes(a),
  nin: (a, b) => Array.isArray(b) && !b.includes(a),
  exists: (a, b) => (b ? a != null : a == null),
  statusIs: (a, b) => (Array.isArray(b) ? b.includes(a) : a === b),
  owner: (a, _b, ctx) => a === ctx.user?.id,
  deptMember: (a, _b, ctx) => Array.isArray(ctx.user?.departmentIds) && ctx.user.departmentIds.includes(a),
  timeWindow: (a, window) => {
    if (!(a instanceof Date) || !window) return false;
    const t = hhmm(a);
    return t >= parseHHMM(window.start) && t <= parseHHMM(window.end);
  },
};
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** (`feat(engine): operator library + path/ref resolution`).

---

## Task 2: Condition evaluator

**Files:** Create `src/engine/conditions.js`; Test `test/engine.conditions.test.js`.

- [ ] **Step 1: Write failing tests**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCondition } from '../src/engine/conditions.js';

const ctx = {
  user: { id: 'u1', departmentIds: ['d1', 'd2'] },
  resource: { ownerId: 'u1', orgUnitId: 'd2', value: 4000, status: 'draft' },
  env: { now: new Date('2026-06-06T10:00:00Z') },
};

test('null/empty condition is always satisfied', () => {
  assert.equal(evaluateCondition(null, ctx), true);
  assert.equal(evaluateCondition({}, ctx), true);
});

test('single operator condition', () => {
  assert.equal(evaluateCondition({ 'resource.value': { lte: 5000 } }, ctx), true);
  assert.equal(evaluateCondition({ 'resource.value': { gt: 5000 } }, ctx), false);
});

test('ref operand resolves from ctx', () => {
  assert.equal(evaluateCondition({ 'resource.orgUnitId': { in: '$user.departmentIds' } }, ctx), true);
});

test('multiple entries AND together', () => {
  const cond = { 'resource.ownerId': { owner: true }, 'resource.status': { statusIs: ['draft'] } };
  assert.equal(evaluateCondition(cond, ctx), true);
  const cond2 = { 'resource.ownerId': { owner: true }, 'resource.status': { statusIs: ['done'] } };
  assert.equal(evaluateCondition(cond2, ctx), false);
});

test('unknown operator throws', () => {
  assert.throws(() => evaluateCondition({ 'resource.value': { bogus: 1 } }, ctx), /Unknown operator/);
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/engine/conditions.js`**

```javascript
import { getPath, resolveOperand, operators } from './operators.js';

// Evaluates a condition object against ctx { user, resource, env }.
// Each entry is path -> { op: operand }; all entries must hold (AND).
export function evaluateCondition(condition, ctx) {
  if (!condition) return true;
  for (const [path, test] of Object.entries(condition)) {
    const actual = getPath(ctx, path);
    for (const [op, rawOperand] of Object.entries(test)) {
      const fn = operators[op];
      if (!fn) throw new Error(`Unknown operator: ${op}`);
      const operand = resolveOperand(rawOperand, ctx);
      if (!fn(actual, operand, ctx)) return false;
    }
  }
  return true;
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** (`feat(engine): condition evaluator`).

---

## Task 3: Scope logic

**Files:** Create `src/engine/scope.js`; Test `test/engine.scope.test.js`.

- [ ] **Step 1: Write failing tests**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCOPE_RANK, scopeSatisfiesResource, scopeFilterDescriptor } from '../src/engine/scope.js';

const user = { id: 'u1', departmentIds: ['d1'], facilityIds: ['f1'] };

test('scope ranking: any broadest, own narrowest', () => {
  assert.ok(SCOPE_RANK.any > SCOPE_RANK.tenant);
  assert.ok(SCOPE_RANK.tenant > SCOPE_RANK.facility);
  assert.ok(SCOPE_RANK.facility > SCOPE_RANK.dept);
  assert.ok(SCOPE_RANK.dept > SCOPE_RANK.own);
});

test('any and tenant always satisfy on a resource', () => {
  assert.equal(scopeSatisfiesResource('any', user, { ownerId: 'x' }), true);
  assert.equal(scopeSatisfiesResource('tenant', user, { ownerId: 'x' }), true);
});

test('own checks ownerId or assignedToUserId', () => {
  assert.equal(scopeSatisfiesResource('own', user, { ownerId: 'u1' }), true);
  assert.equal(scopeSatisfiesResource('own', user, { assignedToUserId: 'u1' }), true);
  assert.equal(scopeSatisfiesResource('own', user, { ownerId: 'u9' }), false);
});

test('dept / facility check org membership', () => {
  assert.equal(scopeSatisfiesResource('dept', user, { orgUnitId: 'd1' }), true);
  assert.equal(scopeSatisfiesResource('dept', user, { orgUnitId: 'd2' }), false);
  assert.equal(scopeSatisfiesResource('facility', user, { orgUnitId: 'f1' }), true);
});

test('scopeFilterDescriptor returns list-filter intent', () => {
  assert.deepEqual(scopeFilterDescriptor('any', user), { type: 'all' });
  assert.deepEqual(scopeFilterDescriptor('own', user), { type: 'own', userId: 'u1' });
  assert.deepEqual(scopeFilterDescriptor('dept', user), { type: 'orgUnit', orgUnitIds: ['d1'] });
  assert.deepEqual(scopeFilterDescriptor('facility', user), { type: 'orgUnit', orgUnitIds: ['f1'] });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/engine/scope.js`**

```javascript
export const SCOPE_RANK = { own: 1, dept: 2, facility: 3, tenant: 4, any: 5 };

// For a single known resource: does this scope grant reach in?
// (tenant isolation itself is enforced by the DB layer, so tenant/any always pass here.)
export function scopeSatisfiesResource(scope, user, resource) {
  switch (scope) {
    case 'any':
    case 'tenant':
      return true;
    case 'own':
      return resource?.ownerId === user.id || resource?.assignedToUserId === user.id;
    case 'dept':
      return resource?.orgUnitId != null && (user.departmentIds || []).includes(resource.orgUnitId);
    case 'facility':
      return resource?.orgUnitId != null && (user.facilityIds || []).includes(resource.orgUnitId);
    default:
      return false;
  }
}

// For list endpoints: a descriptor the service translates into a Sequelize where clause.
export function scopeFilterDescriptor(scope, user) {
  switch (scope) {
    case 'any':
    case 'tenant':
      return { type: 'all' };
    case 'own':
      return { type: 'own', userId: user.id };
    case 'dept':
      return { type: 'orgUnit', orgUnitIds: user.departmentIds || [] };
    case 'facility':
      return { type: 'orgUnit', orgUnitIds: user.facilityIds || [] };
    default:
      return { type: 'none' };
  }
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** (`feat(engine): scope ranking, resource check, filter descriptor`).

---

## Task 4: The `can()` decision function

**Files:** Create `src/engine/can.js`, `src/engine/index.js`; Test `test/engine.can.test.js`.

**Logic — `evaluateAccess({ grants, action, resourceType, user, resource, env })`:**
1. Keep grants where `(resourceTypeKey === resourceType || '*')` AND `(actionKey === action || '*')` AND not expired (`expiresAt == null || expiresAt > env.now`).
2. **Deny-override:** among applicable grants whose scope + condition hold for the resource, if any is `deny` → `{ allowed:false, effect:'deny', ... }`.
3. Else if any `allow` grant has scope satisfied AND condition satisfied → `{ allowed:true, effect:'allow', scope, matchedGrant }` (pick the broadest scope).
4. Else `{ allowed:false, effect:null, reason:'no matching grant' }`.

**`resolveScope({ grants, action, resourceType, user, env })`** (capability/list mode, no resource):
1. Applicable = matching action/resourceType, not expired.
2. If any unconditional `deny` → denied. (Conditional denies are deferred to row-level checks.)
3. Among `allow` grants, pick the broadest scope; return `{ allowed, scope, descriptor, matchedGrant }`.

- [ ] **Step 1: Write failing tests**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAccess, resolveScope } from '../src/engine/index.js';

const user = { id: 'u1', tenantId: 't1', departmentIds: ['d1'], facilityIds: ['f1'] };
const env = { now: new Date('2026-06-06T10:00:00Z') };
const g = (o) => ({ effect: 'allow', resourceTypeKey: 'asset', actionKey: 'read', scope: 'any', condition: null, expiresAt: null, ...o });

test('no grants → denied', () => {
  const d = evaluateAccess({ grants: [], action: 'read', resourceType: 'asset', user, resource: {}, env });
  assert.equal(d.allowed, false);
});

test('matching allow with any scope → allowed', () => {
  const d = evaluateAccess({ grants: [g({})], action: 'read', resourceType: 'asset', user, resource: { ownerId: 'u9' }, env });
  assert.equal(d.allowed, true);
  assert.equal(d.scope, 'any');
});

test('own scope passes only on own resource', () => {
  const grants = [g({ scope: 'own' })];
  assert.equal(evaluateAccess({ grants, action: 'read', resourceType: 'asset', user, resource: { ownerId: 'u1' }, env }).allowed, true);
  assert.equal(evaluateAccess({ grants, action: 'read', resourceType: 'asset', user, resource: { ownerId: 'u9' }, env }).allowed, false);
});

test('condition must hold', () => {
  const grants = [g({ scope: 'any', condition: { 'resource.value': { lte: 5000 } } })];
  assert.equal(evaluateAccess({ grants, action: 'read', resourceType: 'asset', user, resource: { value: 4000 }, env }).allowed, true);
  assert.equal(evaluateAccess({ grants, action: 'read', resourceType: 'asset', user, resource: { value: 9000 }, env }).allowed, false);
});

test('deny overrides allow', () => {
  const grants = [g({}), g({ effect: 'deny' })];
  assert.equal(evaluateAccess({ grants, action: 'read', resourceType: 'asset', user, resource: {}, env }).allowed, false);
});

test('expired grant is ignored', () => {
  const grants = [g({ expiresAt: new Date('2020-01-01') })];
  assert.equal(evaluateAccess({ grants, action: 'read', resourceType: 'asset', user, resource: {}, env }).allowed, false);
});

test('wildcard grant matches any resourceType/action', () => {
  const grants = [g({ resourceTypeKey: '*', actionKey: '*' })];
  assert.equal(evaluateAccess({ grants, action: 'delete', resourceType: 'project', user, resource: {}, env }).allowed, true);
});

test('resolveScope picks broadest scope for lists', () => {
  const grants = [g({ scope: 'own' }), g({ scope: 'dept' })];
  const r = resolveScope({ grants, action: 'read', resourceType: 'asset', user, env });
  assert.equal(r.allowed, true);
  assert.equal(r.scope, 'dept');
  assert.deepEqual(r.descriptor, { type: 'orgUnit', orgUnitIds: ['d1'] });
});

test('resolveScope denied by unconditional deny', () => {
  const grants = [g({}), g({ effect: 'deny', condition: null })];
  assert.equal(resolveScope({ grants, action: 'read', resourceType: 'asset', user, env }).allowed, false);
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/engine/can.js`**

```javascript
import { evaluateCondition } from './conditions.js';
import { SCOPE_RANK, scopeSatisfiesResource, scopeFilterDescriptor } from './scope.js';

function matches(grant, action, resourceType) {
  return (
    (grant.resourceTypeKey === resourceType || grant.resourceTypeKey === '*') &&
    (grant.actionKey === action || grant.actionKey === '*')
  );
}
function notExpired(grant, now) {
  return grant.expiresAt == null || new Date(grant.expiresAt) > now;
}

// Full decision for a specific resource.
export function evaluateAccess({ grants, action, resourceType, user, resource, env }) {
  const now = env?.now ?? new Date(0);
  const ctx = { user, resource, env };
  const applicable = grants.filter((g) => matches(g, action, resourceType) && notExpired(g, now));

  const holding = applicable.filter(
    (g) => scopeSatisfiesResource(g.scope, user, resource) && evaluateCondition(g.condition, ctx)
  );

  const deny = holding.find((g) => g.effect === 'deny');
  if (deny) {
    return { allowed: false, effect: 'deny', scope: deny.scope, matchedGrant: deny, reason: 'explicit deny' };
  }

  const allows = holding.filter((g) => g.effect === 'allow');
  if (allows.length) {
    const best = allows.reduce((a, b) => (SCOPE_RANK[b.scope] > SCOPE_RANK[a.scope] ? b : a));
    return { allowed: true, effect: 'allow', scope: best.scope, matchedGrant: best, reason: 'allowed by grant' };
  }

  return { allowed: false, effect: null, scope: null, matchedGrant: null, reason: 'no matching grant' };
}

// Capability/list mode (no specific resource). Resource-level conditions are deferred to
// per-row checks; only unconditional denies block here.
export function resolveScope({ grants, action, resourceType, user, env }) {
  const now = env?.now ?? new Date(0);
  const applicable = grants.filter((g) => matches(g, action, resourceType) && notExpired(g, now));

  const hardDeny = applicable.find((g) => g.effect === 'deny' && !g.condition);
  if (hardDeny) {
    return { allowed: false, scope: null, descriptor: { type: 'none' }, matchedGrant: hardDeny, reason: 'explicit deny' };
  }

  const allows = applicable.filter((g) => g.effect === 'allow');
  if (!allows.length) {
    return { allowed: false, scope: null, descriptor: { type: 'none' }, matchedGrant: null, reason: 'no matching grant' };
  }
  const best = allows.reduce((a, b) => (SCOPE_RANK[b.scope] > SCOPE_RANK[a.scope] ? b : a));
  return { allowed: true, scope: best.scope, descriptor: scopeFilterDescriptor(best.scope, user), matchedGrant: best, reason: 'allowed by grant' };
}
```

- [ ] **Step 4: Write `src/engine/index.js`**

```javascript
export { operators, getPath, resolveOperand } from './operators.js';
export { evaluateCondition } from './conditions.js';
export { SCOPE_RANK, scopeSatisfiesResource, scopeFilterDescriptor } from './scope.js';
export { evaluateAccess, resolveScope } from './can.js';
```

- [ ] **Step 5: Run — expect PASS.**
- [ ] **Step 6: Commit** (`feat(engine): can() decision (evaluateAccess + resolveScope)`).

---

## Phase 2 Verification Checklist

- [ ] `node --test` fully green (Phase 1 suite + 4 new engine suites).
- [ ] Engine has **zero** imports from `db/`, `express`, or any I/O — pure functions only.
- [ ] Scenarios covered: hierarchy-agnostic grant matching, wildcard, scope fallthrough
      (broadest wins), own/dept/facility resource checks, ABAC conditions (eq/in/lte/owner/
      statusIs/timeWindow), deny-override, expiry, capability/list scope resolution.

**Next:** Phase 3 — Core RBAC services & admin APIs (effective-role resolution with caching,
grant collection feeding this engine, audit logging, `/admin/explain`).
