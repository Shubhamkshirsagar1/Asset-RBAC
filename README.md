# Node.js RBAC

A production-style role-based access control system for Node.js / Express, runnable with **zero external setup** (data lives in an in-memory store seeded with demo data). It demonstrates the full set of RBAC features:

- **Role hierarchy / inheritance** — a role inherits all permissions of its parent (`admin` → `manager` → `user`).
- **Wildcard + scoped permissions** — `resource:action:scope`, e.g. `invoices:read:any`, `invoices:update:own`, `*:*:*` for superadmin.
- **Scope fallthrough** — a broader `any` grant satisfies a narrower `own` requirement, never the reverse.
- **Ownership / ABAC conditions** — `own`-scoped permissions verify `resource.ownerId === user.id`; extend with department/region via `registerScope()`.
- **Nested page tree** — pages have parents; access to a child can require access to every ancestor.
- **Dynamic per-role page enable/disable** — flip a page on/off for a role at runtime, overriding permissions, without a redeploy.
- **Server-filtered navigation menu** — `/me/menu` returns only the pages the user can reach; the frontend renders it verbatim.
- **Permission caching with invalidation** — effective permissions are cached per user and busted on every admin write.

## Run it

```bash
npm install
npm start        # http://localhost:3000
npm test         # 19 end-to-end checks
```

## Demo accounts

All passwords are `password`.

| Email | Role | Notable grants |
|-------|------|----------------|
| `root@example.com`  | superadmin | `*:*:*` |
| `alice@example.com` | admin | rbac:manage, users:read + everything manager/user has |
| `bob@example.com`   | manager | invoices:read/approve:any + user's own grants |
| `carol@example.com` | user | invoices read/create/update **own** only |

## Try it with curl

```bash
# 1. Log in
TOKEN=$(curl -s -X POST localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"alice@example.com","password":"password"}' | jq -r .access_token)

# 2. See your effective permissions (hierarchy already flattened)
curl -s localhost:3000/me/permissions -H "authorization: Bearer $TOKEN"

# 3. See your filtered navigation menu (nested, pruned)
curl -s localhost:3000/me/menu -H "authorization: Bearer $TOKEN"

# 4. Dynamically toggle a page for a role
curl -s -X PUT localhost:3000/admin/roles/r_manager/pages/pg_inv_approve \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"enabled":true}'

# 5. Grant a permission to a role at runtime
curl -s -X POST localhost:3000/admin/roles/r_user/permissions \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"resource":"reports","action":"read","scope":"any"}'
```

## The demo that proves the design

The `manager` role **has** `invoices:approve:any`, but the seed disables the
Approvals page for managers (`rolePageAccess`). So a manager's `/me/menu` hides
Approvals even though they hold the permission — a page toggle overrides a grant
at runtime. Flip it back on with the toggle endpoint and it reappears
immediately (the permission cache is invalidated on write).

## API surface

| Method & path | Guard | Purpose |
|---------------|-------|---------|
| `POST /auth/login` | — | issue JWT |
| `GET /me` | auth | current user + roles |
| `GET /me/permissions` | auth | flattened effective permissions |
| `GET /me/menu` | auth | server-filtered nav tree |
| `GET /invoices` | `invoices:read:own` (capability) | own/all per scope |
| `GET /invoices/:id` | ownership | read one |
| `PATCH /invoices/:id` | ownership | update one |
| `POST /invoices/:id/approve` | `invoices:approve:any` | approve |
| `GET /admin/pages` | `rbac:manage:any` | inspect tree + toggles |
| `PUT /admin/roles/:r/pages/:p` | `rbac:manage:any` | enable/disable page |
| `POST /admin/roles/:r/permissions` | `rbac:manage:any` | grant permission |
| `DELETE /admin/roles/:r/permissions` | `rbac:manage:any` | revoke permission |

## Project layout

```
src/
  lib/permission-match.js          wildcard + scope matching
  db/store.js                      in-memory store + seed (mirrors Prisma)
  services/
    permission.service.js          effective perms via hierarchy + cache
    authorize.service.js           can() engine + scope/ownership checkers
    page-access.service.js         nested pages + dynamic enable/disable
    menu.service.js                build the filtered nav tree
  middleware/
    auth.js                        JWT -> req.user
    authorize.js                   requirePermission / requireOwnership
    require-page.js                guard a route by page key
    error.js                       central error handler
  routes/                          auth, me, invoices, admin
  app.js / index.js                wiring + entry
prisma/schema.prisma               reference schema for a real database
test/smoke.test.js                 19 end-to-end checks
```

## Moving to a real database

The in-memory store in `src/db/store.js` mirrors `prisma/schema.prisma`
one-to-one. To go to Postgres:

1. `npm i @prisma/client && npm i -D prisma`
2. Set `DATABASE_URL`, run `npx prisma migrate dev`.
3. Replace the helper functions in `store.js` with Prisma queries (the service
   layer never touches the store internals, so nothing else changes).
4. Swap the in-memory permission cache for Redis if you run multiple instances —
   the per-process `Map` in `permission.service.js` won't invalidate across them.

> Note: `requiredPermissions String[]` needs PostgreSQL/CockroachDB/MongoDB. On
> SQLite, store it as a JSON string and parse it in code.

## Capability gate vs ownership enforcement

Two distinct guards, by design:

- `requirePermission('invoices:read:own')` is a **capability gate** — passes if
  the user may act on their own records *at all*, then the handler filters rows.
- `requireOwnership('invoices:update:own', loader)` loads the specific resource
  and enforces ownership on it. A user with the `:any` grant passes regardless
  of owner; an `:own`-only user passes only on their own record.

Use the first for lists, the second for single-record reads/mutations.
