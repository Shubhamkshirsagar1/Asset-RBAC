# RBAC — End-to-End Flow & Scenarios

A from-scratch walkthrough of every moving part in this codebase: what each
piece is, how a request travels through it, and every scenario it’s designed
to handle. Read top-to-bottom the first time; later you can jump straight to
the **Scenarios** section.

---

## 1. The mental model in one paragraph

A **User** has one or more **Roles**. Each Role has a list of **Permissions**
plus an optional **parent role** whose permissions it inherits. A Permission
is a 3-part string `resource:action:scope`. When the user hits an API, an
Express middleware asks `can(user, "invoices:update:own", { resource })`. That
function flattens the user’s role tree into a `Set` of permission strings,
finds one that *matches* the required string (with wildcard + scope rules),
and then runs a **scope checker** (e.g. `own` ⇒ `resource.ownerId === user.id`).
On top of all that sits a **Page tree** — a frontend-driven nav structure
where each page declares the permissions needed to view it, can require its
parent to be reachable, and can be **toggled on/off per role at runtime**
(overriding everything). The server returns only the pages the user can
reach, and the frontend just renders that tree.

That single paragraph is the whole system. The rest is detail.

---

## 2. The data model (in-memory mirror of `prisma/schema.prisma`)

Defined in `src/db/store.js`:

| Entity | Fields that matter | Purpose |
|---|---|---|
| `User` | `id`, `email`, `passwordHash`, `attributes` (JSON, e.g. `{ department }`) | The actor. `attributes` feeds future ABAC scopes. |
| `Role` | `id`, `name`, `parentRoleId`, `isSystem` | Bag of permissions. `parentRoleId` makes a chain that the resolver walks. |
| `Permission` | `id`, `resource`, `action`, `scope` | Stored normalized; serialized to `r:a:s` when checked. |
| `UserRole` | `userId`, `roleId` | Many-to-many: user ↔ roles. |
| `RolePermission` | `roleId`, `permissionId` | Many-to-many: role ↔ permissions. |
| `Page` | `id`, `key`, `label`, `path`, `parentId`, `requiredPermissions[]`, `inheritFromParent`, `isMenuItem`, `order` | A node in the nav tree. |
| `RolePageAccess` | `roleId`, `pageId`, `enabled` | Per-role runtime override of a page. Missing row = enabled. |
| `Invoice` | `id`, `ownerId`, `amount`, `status` | Demo resource used for ownership/ABAC checks. |

### Seed (what ships out of the box)

```
Roles (parent chain):  superadmin    admin → manager → user
                                                       ↑ user has no parent

Users:
  root  → superadmin
  alice → admin
  bob   → manager
  carol → user

Permissions per role:
  superadmin:  *:*:*
  admin:       rbac:manage:any, users:read:any
  manager:     invoices:read:any, invoices:approve:any
  user:        invoices:read:own, invoices:create:own, invoices:update:own

RolePageAccess (runtime overrides):
  manager + pg_inv_approve → enabled: false   ← the famous demo override

Pages (tree):
  dashboard
  invoices                requires invoices:read:own
    └─ invoices.create    requires invoices:create:own
    └─ invoices.approve   requires invoices:approve:any   ← disabled for manager
  admin                   requires rbac:manage:any
    └─ admin.roles        requires rbac:manage:any
    └─ admin.users        requires users:read:any
```

---

## 3. The permission string — `resource:action:scope`

Source of truth: `src/lib/permission-match.js`.

```
invoices : read : own
   │        │      └── "own"   → only your own records (ownership check applies)
   │        │           "any"   → any record
   │        │           "*"     → matches both above
   │        └─ verb (read, create, update, approve, manage, ...)
   └─ resource noun (invoices, users, rbac, *)
```

### Matching rules

A *granted* permission `G` satisfies a *required* permission `R` iff:

1. `G.resource == R.resource` **or** `G.resource == "*"`.
2. `G.action == R.action` **or** `G.action == "*"`.
3. Scope rule (the subtle one):
   - `G.scope == "*"` → matches anything.
   - `G.scope == R.scope` → matches.
   - **`G.scope == "any"` and `R.scope == "own"` → matches** (broader covers narrower).
   - **`G.scope == "own"` and `R.scope == "any"` → does NOT match** (narrower never covers broader).

This is the "scope fallthrough" rule. Why it matters: when you guard a list
endpoint with `requirePermission('invoices:read:own')`, a manager with
`invoices:read:any` still passes the gate (then the handler shows them
everything). But a `user` with `invoices:read:own` *cannot* pass a guard that
demands `invoices:read:any`.

---

## 4. Role hierarchy → flattened "effective permissions"

`src/services/permission.service.js` does the flattening.

```js
collectRolePermissions(roleId) {
  own       = permissions directly on this role
  inherited = parentRoleId ? collectRolePermissions(parent) : []
  return [...own, ...inherited]
}
```

A `Set` per user is the **effective permission set**. Walking happens from
each role the user has, then up its parent chain. Cycles are guarded with a
`seen` set.

### Cache

```js
cache = new Map<userId, { perms: Set<string>, expires: number }>
TTL    = 60_000   // 60s
```

- First call after login → cold compute, then store.
- Subsequent calls within 60s → served from `Map`.
- Any admin write (toggle page / grant perm / revoke perm) calls
  `invalidateAll()` → cache is wiped, next request recomputes.
- For multi-instance deployments this `Map` must become Redis (the README
  flags this explicitly).

### What “admin → manager → user” gives Alice

Walking from `r_admin`:
- own: `rbac:manage:any`, `users:read:any`
- parent `r_manager` → own: `invoices:read:any`, `invoices:approve:any`
- parent `r_user` → own: `invoices:read:own`, `invoices:create:own`, `invoices:update:own`

→ Alice’s effective set is the union of all 7.

Bob (manager): inherits user’s 3 + has his own 2 = 5.
Carol (user): just the 3 `:own` permissions.
Root (superadmin): just `*:*:*` — but that matches everything.

---

## 5. The `can()` engine

`src/services/authorize.service.js`:

```js
can(user, required, context = {}) {
  for (const g of getEffectivePermissions(user.id)) {
    if (!matchesOne(g, required)) continue;        // string match
    const gScope    = g.split(':')[2] || 'any';
    const checker   = scopeCheckers[gScope] || scopeCheckers.any;
    if (checker(user, context.resource)) return true; // ABAC layer
  }
  return false;
}
```

Two layers, in order:

1. **RBAC layer** — does *any* granted string match the required one (with the
   wildcard + scope-fallthrough rules from §3)?
2. **ABAC layer** — once one matches, the scope’s **checker function** decides
   whether the *specific* resource is in scope.

Built-in checkers:

```js
any: () => true
own: (user, resource) =>
  (resource == null) ? true                      // capability gate mode
                     : resource.ownerId === user.id
```

The `null` branch is the “capability gate vs ownership” split — see §7.

### Extending the ABAC layer

`registerScope(name, fn)` is the extension point. Examples you could plug in:

```js
registerScope('department', (user, resource) =>
  resource && user.attributes.department === resource.department);

registerScope('region', (user, resource) =>
  resource && user.attributes.region === resource.region);
```

Then permission strings like `invoices:read:department` start working.

---

## 6. Authentication flow (JWT)

```
POST /auth/login  { email, password }
  └─ store.findUserByEmail → bcrypt.compareSync
       success → jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '1h' })
                 → { access_token, token_type: "Bearer" }
       failure → 401 { error: "invalid credentials" }
```

Every protected route uses `authenticate` middleware:

```
Authorization: Bearer <token>
  └─ jwt.verify → payload.sub → store.findUserById → req.user
       success → next()
       missing scheme/token       → 401 missing bearer token
       verify throws (bad/expired)→ 401 invalid token
       unknown user id            → 401 unknown user
```

Config: `JWT_SECRET` (env, default `dev-secret-change-me`), `JWT_TTL` (default `1h`).

---

## 7. The three authorization guards

All three live in `src/middleware/`. They’re composable.

### a) `requirePermission(...perms)` — the capability gate

Static, no resource. Pure RBAC check (with scope fallthrough). Use it for:

- **List endpoints** — pass the gate with `:own`, then filter rows in-handler.
- **Endpoints with no per-record ownership concept** — e.g. `POST /invoices/:id/approve` needs `invoices:approve:any` outright.

```js
router.get('/', requirePermission('invoices:read:own'), (req, res) => {
  const all = store.listInvoices();
  const visible = can(req.user, 'invoices:read:any')
    ? all
    : all.filter((i) => i.ownerId === req.user.id);
  res.json({ invoices: visible });
});
```

Why this works: the gate accepts both `:own` users (they have it directly) and
`:any` users (scope fallthrough). The handler then asks `can(user, '...:any')`
to decide whether to widen the rows.

### b) `requireOwnership(perm, loader)` — capability + ABAC

For single-record reads/mutations. Loads the resource, then calls
`can(user, perm, { resource })`. Now the `own` checker has something to
compare against (`resource.ownerId === user.id`).

```js
router.patch('/:id',
  requireOwnership('invoices:update:own', (req) => store.findInvoiceById(req.params.id)),
  (req, res) => { /* req.resource is set */ });
```

- Resource not found → `404 not found`.
- `:any` holder passes regardless of owner.
- `:own`-only user passes only on their own record.

### c) `requirePage(pageKey)` — page-tree based

Asks `canAccessPage(user, pageKey)` from `page-access.service.js`. Differs
from `requirePermission` in two ways:

- **Inherits ancestor reachability** — to access `invoices.approve` you must
  also be able to access `invoices` and its parents (if `inheritFromParent`).
- **Honors the runtime per-role toggle** — `RolePageAccess.enabled: false`
  blocks even if every permission is held.

Not used by the demo routes (they go straight to `requirePermission` /
`requireOwnership`), but available as the API-side mirror of the menu logic.

---

## 8. The page tree & dynamic per-role toggle

### Page node

```js
{
  id, key, label, path, icon, order,
  parentId,              // null for root nodes
  requiredPermissions,   // ALL must be satisfied
  inheritFromParent,     // if true, the user must also reach the parent
  isMenuItem,            // hide from menu if false (still a routable page)
}
```

### Reachability algorithm (`canAccessNode`)

```
canAccessNode(user, page):
  if disabledPageIds.has(page.id):              return false   # toggle off
  for perm in page.requiredPermissions:
    if not can(user, perm):                     return false
  if page.inheritFromParent and page.parentId:
    if not canAccessNode(user, parentPage):     return false
  return true
```

Three reasons a page is blocked, in priority order:

1. The page is **disabled** for one of the user’s roles (and not enabled by
   any other role they hold).
2. The user lacks one of `requiredPermissions`.
3. The user can’t reach the parent.

### The "disabled" calculation (`getDisabledPageIds`)

The OR-across-roles rule, expressed cleanly in code:

> A page is **enabled** if **any** of the user’s roles enables it.
> A missing row defaults to enabled.
> Only when every row for that page across the user’s roles says `false`
> (and none says `true`) is the page disabled.

That's why the seed disabling `pg_inv_approve` for `r_manager` only affects
Bob (manager) — Alice (admin) inherits manager but if she also has an
explicit `enabled:true` row for `pg_inv_approve` against `r_admin`, the page
turns back on for her. In the current seed she has no row, so she inherits…
nothing — `RolePageAccess` is keyed by role, not walked through hierarchy.
Alice’s `admin` role has no `enabled:false` row, so the page is open for her.
(See "subtle: page toggles do NOT inherit through the role tree" in §11.)

### Menu vs page-guard

- `buildMenu(user)` (in `src/services/menu.service.js`) walks the tree top-down,
  filters with the same `accessible()` predicate, and **drops nodes whose
  branches are empty**. Wait — it doesn’t actually drop empty branches; it
  emits whatever passes. Children that fail just aren’t added. Parents that
  pass with no surviving children are returned as leaf nodes.
- `canAccessPage(user, key)` is the per-route check, same algorithm.

---

## 9. The menu pipeline (`/me/menu`)

```
GET /me/menu
  └─ authenticate → req.user
       buildMenu(user):
         disabled = getDisabledPageIds(user.id)
         build(parentId = null):
           for each Page with parentId == this and isMenuItem:
             skip if disabled
             skip if any requiredPermission fails can(user, perm)
             children = build(page.id)
             push { key, label, path, icon, [children?] }
         → array of top-level nodes
```

The frontend renders this verbatim. No client-side filtering required (and
none would be trustable anyway — the server is the source of truth).

---

## 10. The admin endpoints (runtime mutation + cache busting)

All under `/admin`, all guarded by `requirePermission('rbac:manage:any')`.

| Endpoint | What it does | Cache effect |
|---|---|---|
| `GET /admin/pages` | Dump full `pages` + `rolePageAccess` for inspection | none |
| `PUT /admin/roles/:roleId/pages/:pageId  {enabled}` | Upsert a row in `rolePageAccess` | `invalidateAll()` |
| `POST /admin/roles/:roleId/permissions  {resource, action, scope?}` | `upsertPermission` then `grantPermissionToRole` | `invalidateAll()` |
| `DELETE /admin/roles/:roleId/permissions  {resource, action, scope?}` | `revokePermissionFromRole` if it exists | `invalidateAll()` |

`invalidateAll()` wipes the **per-user effective-permissions cache** so the
*next* request sees the new state immediately. This is what makes the demo
(“toggle pg_inv_approve back on and Bob’s menu shows it on the very next call”)
work.

Validation:
- `enabled` must be boolean → otherwise 400.
- Unknown roleId → 404.
- Missing `resource` / `action` → 400.

---

## 11. Subtle behaviors worth knowing

1. **Scope fallthrough is one-way only.** `any → own` yes; `own → any` no.
2. **Capability gate vs ownership** is the most common confusion. Use
   `requirePermission` on lists and gateways; `requireOwnership` on single
   resources. The same string (`invoices:update:own`) means different things
   depending on which guard you use — and that’s intentional.
3. **Page toggles do NOT inherit through the role tree.** `RolePageAccess` is
   keyed by `roleId`. The hierarchy only flattens *permissions*. If you want a
   page disabled for everyone under `manager`, you must add a row for every
   descendant role too. (Or rework the algorithm to walk ancestors —
   currently it doesn’t.)
4. **Page enable is OR-across-roles for the *user*.** If a user has two roles
   and one says `enabled:false` while the other says `enabled:true`, the
   `enabled:true` wins. A missing row is treated as enabled, but it doesn’t
   override an explicit `false` from another of the user’s roles.
5. **The cache TTL is 60s, but admin writes invalidate immediately.** So
   stale reads only happen for permissions changed *outside* this API
   (direct DB writes), and even then for at most 60s.
6. **`requirePermission` accepts a variadic list** — `requirePermission('a:b:c', 'd:e:f')` requires BOTH. Use it sparingly; usually one is enough.
7. **`*:*:*` is the superadmin marker.** Any segment can be `*`, including
   only `*:*:*` for full bypass.
8. **`requireOwnership` returns 404 when the resource is missing**, not 403.
   That’s the right call: we’ve already authenticated the user; the resource
   simply doesn’t exist for anyone.
9. **`requiredPermissions: []`** on a page means "no permission required" —
   `dashboard` is the example. It’s still subject to ancestor inheritance and
   the toggle.
10. **`isMenuItem: false`** would hide a page from the menu but keep it
    reachable via `requirePage` — useful for detail/edit pages that shouldn’t
    show up in the nav.

---

## 12. The request, end-to-end

A `PATCH /invoices/inv_2` from Carol (user, `:own` only):

```
1. Carol sends Authorization: Bearer <jwt>, body { amount: 999 }
2. Express routes → /invoices → invoices.routes.js
3. authenticate middleware:
   - parses Bearer header
   - jwt.verify(JWT_SECRET) → { sub: "u_carol" }
   - store.findUserById("u_carol") → req.user
4. requireOwnership('invoices:update:own', loader):
   - loader(req) → store.findInvoiceById("inv_2") → { ownerId: "u_bob", ... }
   - can(req.user, 'invoices:update:own', { resource }):
     - getEffectivePermissions("u_carol") = {
         invoices:read:own, invoices:create:own, invoices:update:own
       }
     - iterate; G='invoices:update:own' matchesOne R='invoices:update:own' ✓
     - gScope='own' → scopeCheckers.own(user, resource)
     - resource.ownerId('u_bob') !== user.id('u_carol') → false
     - no other granted permission matches → can() returns false
   - 403 forbidden, response sent, handler never runs
```

Now repeat as Bob (manager, has `invoices:read:any` + `invoices:approve:any`,
inherits `invoices:update:own`):

```
4. requireOwnership('invoices:update:own', ...):
   - resource owner is "u_bob"; Bob's id is "u_bob" → own checker passes
   - (Even if it weren't his, manager has invoices:read:any but NOT
     invoices:update:any — so Bob can only update HIS OWN invoices.
     The :any on read does NOT spill into update.)
```

And Alice (admin) hitting the same route on Carol’s invoice `inv_1`:

```
4. Same; Alice inherits :own from user. resource.ownerId='u_carol',
   alice.id='u_alice' → own checker FAILS. Alice has NO :any update grant
   anywhere in her chain (manager only has read:any and approve:any).
   → 403. Important: admin ≠ superadmin. Inheritance does not magically
   give Alice :any update.
```

This is the right behavior — and a common source of bugs in hand-rolled RBAC.

---

## 13. Scenarios — every behavior the system is designed for

### 13.1 Authentication

| Scenario | Result |
|---|---|
| Right email, right password | 200 + `access_token` |
| Right email, wrong password | 401 invalid credentials |
| Unknown email | 401 invalid credentials |
| No Authorization header on protected route | 401 missing bearer token |
| Malformed/expired token | 401 invalid token |
| Token for deleted user | 401 unknown user |

### 13.2 Permission resolution (role hierarchy)

| User | Role chain | Effective permissions (flattened) |
|---|---|---|
| root | superadmin | `*:*:*` |
| alice | admin → manager → user | rbac:manage:any, users:read:any, invoices:read:any, invoices:approve:any, invoices:read:own, invoices:create:own, invoices:update:own |
| bob | manager → user | invoices:read:any, invoices:approve:any, invoices:read:own, invoices:create:own, invoices:update:own |
| carol | user | invoices:read:own, invoices:create:own, invoices:update:own |

### 13.3 Capability gate (list endpoints)

`GET /invoices`, gate = `invoices:read:own`.

| User | Passes gate? | Sees |
|---|---|---|
| root | ✓ (via `*:*:*`) | all 3 invoices (handler widens via `:any` check) |
| alice | ✓ (has `:any` via manager) | all 3 |
| bob | ✓ (has `:any`) | all 3 |
| carol | ✓ (has `:own`) | only `inv_1` (hers) |
| anon | 401 (auth fails first) | – |

### 13.4 Ownership-aware single-record reads/updates

`GET/PATCH /invoices/:id`, requirement = `invoices:read:own` / `invoices:update:own`.

| Actor | Target | Reason | Outcome |
|---|---|---|---|
| carol | `inv_1` (carol) | `:own` + ownership matches | 200 |
| carol | `inv_2` (bob) | `:own` + ownership fails, no `:any` | 403 |
| bob | `inv_1` (carol) — read | has `invoices:read:any`, scope fallthrough covers ownership | 200 |
| bob | `inv_1` (carol) — update | has only `invoices:update:own` (inherited), ownership fails, no `:any` update | 403 |
| alice | any — update | inherits `:own`, no `:any` update — only own | own only |
| root | any — update | `*:*:*` matches; `own` checker not invoked because granted scope is `*` | 200 |
| anyone | `inv_999` (missing) | passes load, returns null | 404 |

### 13.5 Approve action (no ownership concept)

`POST /invoices/:id/approve`, requirement = `invoices:approve:any`.

| Actor | Has perm? | Outcome |
|---|---|---|
| root | yes (`*:*:*`) | 200 |
| alice | yes (inherits from manager) | 200 (and her menu shows the page) |
| bob | yes (direct) BUT page disabled for r_manager | API still works (route doesn’t use `requirePage`) — only the menu hides it |
| carol | no | 403 |

### 13.6 The menu (`GET /me/menu`)

Each user’s tree, before any runtime toggles:

```
root:    dashboard, invoices(create, approve), admin(roles, users)
alice:   dashboard, invoices(create, approve), admin(roles, users)
bob:     dashboard, invoices(create, [approve HIDDEN by rolePageAccess])
carol:   dashboard, invoices(create)
```

Reasoning:

- carol has no `invoices:approve:any` → `invoices.approve` filtered out.
- carol has no `rbac:manage:any` → `admin` branch filtered out (and its
  children with it).
- bob has the perm, but `RolePageAccess(r_manager, pg_inv_approve, false)`
  hides it.
- alice inherits manager’s permissions, but `RolePageAccess` is keyed by
  role, not flattened through hierarchy → her `r_admin` has no row, so the
  page stays visible. (See §11 ¶3.)

### 13.7 Runtime toggle (`PUT /admin/roles/:r/pages/:p`)

Alice flips `pg_inv_approve` back on for `r_manager`:

```
PUT /admin/roles/r_manager/pages/pg_inv_approve  { "enabled": true }
  → upsertRolePageAccess
  → invalidateAll()        # blows the per-user perm cache
  → 200 { ok: true, ... }

Bob then calls GET /me/menu again
  → effective perms recomputed (was already cached but invalidated)
  → getDisabledPageIds for Bob now returns {} (row says enabled:true)
  → menu now contains invoices.approve
```

### 13.8 Runtime grant (`POST /admin/roles/:r/permissions`)

Alice grants `reports:read:any` to `r_user`:

```
upsertPermission('reports','read','any') → new row in db.permissions
grantPermissionToRole('r_user', newPermId) → new row in db.rolePermissions
invalidateAll()

Carol calls GET /me/permissions
  → recompute → includes 'reports:read:any'
```

### 13.9 Runtime revoke (`DELETE /admin/roles/:r/permissions`)

Symmetric: looks up the permission row by `{resource, action, scope}`, deletes
the join row from `rolePermissions`, invalidates the cache. If the
permission doesn’t exist at all, returns `{ ok: true }` silently (idempotent).

### 13.10 Admin guard

Non-admin hitting any `/admin/*` endpoint → `requirePermission('rbac:manage:any')`
fails → `403 forbidden`. Tested with Carol in the smoke test.

### 13.11 Nested ancestor inheritance

`admin.roles` requires `rbac:manage:any` AND (via inherit) `admin` which
requires `rbac:manage:any`. The redundant requirement is the safety net:
even if you set `requiredPermissions: []` on `admin.roles`, removing your
permission to `admin` itself would also hide `admin.roles`.

To break inheritance for a specific child page, set
`inheritFromParent: false` on that child. The current seed always inherits.

### 13.12 Wildcard semantics

| Granted | Matches required |
|---|---|
| `*:*:*` | everything |
| `invoices:*:any` | every action on invoices, any-scoped |
| `*:read:any` | read on anything |
| `invoices:read:*` | both `invoices:read:any` and `invoices:read:own` |
| `invoices:read:any` | `invoices:read:any` AND `invoices:read:own` (scope fallthrough) |
| `invoices:read:own` | only `invoices:read:own` |

### 13.13 ABAC extension (department/region)

```js
// Bootstrap once (e.g. in app.js)
registerScope('department', (user, resource) =>
  resource ? user.attributes?.department === resource.department : true);

// Now a permission like
//   invoices:read:department
// granted to a role will pass requirePermission as a capability gate, and
// pass requireOwnership only when user.dept matches resource.dept.
```

Note the same null-resource convention as `own`: when used as a capability
gate (no resource), it must return true so that the user "may filter rows".
The handler then filters by department.

### 13.14 Permission cache TTL

- After login: first `/me/permissions` populates the cache (60s TTL).
- Subsequent calls within TTL: served from `Map` (fast).
- An admin write through any of the `/admin` endpoints → `invalidateAll()` →
  next request recomputes for everyone.
- The TTL is the upper bound for stale reads when permissions are mutated
  *outside* the API (e.g. directly editing the store / DB). The admin API
  itself never goes stale.

### 13.15 Empty menu branches

If a parent passes its own check but no child does, the parent appears as a
leaf. If a parent fails its own check, the entire subtree is dropped. (The
current code does not prune parents whose checks pass but whose children all
fail; that’s by design — `dashboard` itself has no children and is a leaf.)

### 13.16 Cycle safety

If someone (or a bad migration) creates a role cycle —
`A.parentRoleId = B; B.parentRoleId = A` — `collectRolePermissions` would
infinite-loop. The `seen` set short-circuits it: any role visited twice
returns an empty contribution.

---

## 14. Operational notes

- **JWT secret**: must be set via `JWT_SECRET` for any non-dev deployment.
- **Token lifetime**: 1h by default. No refresh-token flow ships — the
  demo expects you to re-login.
- **Cache → Redis** for multi-instance deployments. The current in-process
  `Map` cannot invalidate across processes; instance B will serve stale
  permissions for up to TTL after instance A processes an admin write.
- **`requiredPermissions String[]`** in Prisma needs Postgres / Cockroach /
  Mongo. On SQLite store JSON and parse in code.
- **Migrating to a real DB**: the services never touch `db.*` arrays
  directly — only via `store.*`. Replace each helper with a Prisma call and
  the rest of the codebase doesn’t need to change.

---

## 15. Cheat-sheet — picking the right guard

| Situation | Use |
|---|---|
| Static permission, no resource | `requirePermission('a:b:c')` |
| Two/more perms, all required | `requirePermission('a:b:c', 'd:e:f')` |
| Single resource read/update where `own` matters | `requireOwnership('r:a:own', loader)` |
| Action with no ownership concept (approve, bulk job) | `requirePermission('r:a:any')` |
| Gating an API route by page key (toggle-aware) | `requirePage('some.page.key')` |
| Inside a handler, conditional widening | `if (can(user, 'r:a:any')) ... else filter` |

---

## 16. End-to-end demo timeline (the smoke test in words)

1. Log in everyone, capture tokens.
2. Wrong password → 401.
3. Missing token on `/me` → 401.
4. Bob’s `/me/permissions` contains both `:own` (from user) and `:any`
   (from manager) → hierarchy works.
5. Carol reads her invoice → 200. Carol reads Bob’s → 403.
6. Bob reads Carol’s → 200 (scope fallthrough). Bob lists → sees all 3.
7. Carol lists → sees only hers (1).
8. Root approves → 200 (wildcard). Carol approves → 403.
9. Bob’s menu → `invoices.approve` hidden despite holding the perm.
10. Alice toggles `r_manager, pg_inv_approve, enabled:true`. Bob’s menu
    refresh → page now visible. Cache invalidation proved.
11. Carol’s menu has no `admin` branch; Alice’s does, with children.
12. Carol calling `/admin/pages` → 403.
13. Alice grants `reports:read:any` to `r_user`. Carol’s `/me/permissions`
    immediately contains it → runtime grant + invalidation works.

All 19 checks pass. That set is also the empirical spec of the system.
