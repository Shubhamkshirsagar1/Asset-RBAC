# Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the foundation — local Postgres, full Prisma schema, a tenant-scoped DB client, JWT auth (login), tenant-context middleware, and the routes→controllers→services skeleton — proven by a passing login + tenant-isolation end-to-end test.

**Architecture:** Express app layered as routes → controllers → services, with a pure-ish `db/` layer wrapping Prisma. Multi-tenancy is enforced centrally: an `AsyncLocalStorage` carries the request's `tenantId`, and a Prisma client extension auto-injects `where: { tenantId }` on tenant-scoped models and stamps `tenantId` on create. Auth issues a JWT carrying `userId` + `tenantId`.

**Tech Stack:** Node ≥18 (ESM), Express 4, Prisma + PostgreSQL (Docker Compose), jsonwebtoken, bcryptjs, dotenv, built-in `node:test`.

---

## File Structure (Phase 1)

- Create: `docker-compose.yml` — local Postgres service.
- Modify: `package.json` — add deps + scripts.
- Modify: `.env.example`; Create: `.env` (gitignored).
- Replace: `prisma/schema.prisma` — full Postgres schema.
- Create: `src/config.js` — env config (replaces old).
- Create: `src/db/prisma.js` — base PrismaClient singleton.
- Create: `src/db/tenant-context.js` — AsyncLocalStorage store + helpers.
- Create: `src/db/tenant-scoped.js` — Prisma extension that injects tenantId.
- Create: `src/db/index.js` — exports the tenant-scoped client + raw client.
- Create: `src/lib/password.js` — hash/verify (bcryptjs).
- Create: `src/lib/jwt.js` — sign/verify JWT.
- Create: `src/services/auth.service.js` — login logic.
- Create: `src/controllers/auth.controller.js` — thin req/res.
- Create: `src/routes/auth.routes.js` — wire path → controller (replaces old).
- Create: `src/middleware/auth.js` — JWT → req.user (replaces old).
- Create: `src/middleware/tenant-context.js` — run request inside tenant ALS.
- Create: `src/middleware/error.js` — central error handler (replaces old).
- Create: `src/app.js` — express wiring (replaces old).
- Create: `src/index.js` — entry + health route (replaces old).
- Create: `prisma/seed.js` — minimal seed (1 hospital tenant, 2 users).
- Create: `test/helpers.js` — test app/server + request helper.
- Create: `test/lib.test.js` — unit tests (password, jwt).
- Create: `test/tenant-scope.test.js` — DB test for the tenant extension.
- Create: `test/auth.e2e.test.js` — login + tenant isolation e2e.
- Delete (superseded by later phases, kept in git history): `src/db/store.js`, `src/lib/permission-match.js`, `src/middleware/authorize.js`, `src/middleware/require-page.js`, `src/routes/me.routes.js`, `src/routes/invoices.routes.js`, `src/routes/admin.rbac.routes.js`, `src/services/authorize.service.js`, `src/services/menu.service.js`, `src/services/page-access.service.js`, `src/services/permission.service.js`, `test/smoke.test.js`.

---

## Task 0: Clean out superseded files

The original in-memory implementation is preserved in the `baseline` commit; we rebuild fresh.

- [ ] **Step 1: Delete superseded source files**

```bash
git rm src/db/store.js src/lib/permission-match.js \
  src/middleware/authorize.js src/middleware/require-page.js \
  src/routes/me.routes.js src/routes/invoices.routes.js src/routes/admin.rbac.routes.js \
  src/services/authorize.service.js src/services/menu.service.js \
  src/services/page-access.service.js src/services/permission.service.js \
  src/middleware/auth.js src/middleware/error.js src/routes/auth.routes.js \
  src/app.js src/index.js src/config.js test/smoke.test.js
```

- [ ] **Step 2: Commit the cleanup**

```bash
git commit -m "chore: remove in-memory implementation (rebuilding on Postgres)"
```

---

## Task 1: Local Postgres via Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Modify: `.env.example`
- Create: `.env`

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: rbac-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: rbac
      POSTGRES_PASSWORD: rbac
      POSTGRES_DB: rbac
    ports:
      - "5432:5432"
    volumes:
      - rbac-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U rbac -d rbac"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  rbac-pgdata:
```

- [ ] **Step 2: Write `.env.example`**

```bash
DATABASE_URL="postgresql://rbac:rbac@localhost:5432/rbac?schema=public"
JWT_SECRET="dev-secret-change-me"
JWT_EXPIRES_IN="2h"
PORT=3000
```

- [ ] **Step 3: Create `.env` (gitignored) with the same values**

```bash
cp .env.example .env
```

- [ ] **Step 4: Start Postgres and verify it is healthy**

Run: `docker compose up -d && sleep 3 && docker compose ps`
Expected: the `db` service shows status `running` / `healthy`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add local Postgres via docker compose"
```

---

## Task 2: Dependencies and scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Replace `package.json` contents**

```json
{
  "name": "nodejs-rbac",
  "version": "2.0.0",
  "description": "Dynamic multi-tenant RBAC+ABAC platform (Postgres, routes->controllers->services).",
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "db:up": "docker compose up -d",
    "db:down": "docker compose down",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "seed": "node prisma/seed.js",
    "test": "node --test"
  },
  "engines": { "node": ">=18" },
  "prisma": { "seed": "node prisma/seed.js" },
  "dependencies": {
    "@prisma/client": "^5.18.0",
    "bcryptjs": "^2.4.3",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "prisma": "^5.18.0"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: installs without errors; `node_modules/@prisma/client` and `node_modules/prisma` exist.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add prisma, dotenv deps and db scripts"
```

---

## Task 3: Full Prisma schema

**Files:**
- Replace: `prisma/schema.prisma`

- [ ] **Step 1: Write the complete schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum TenantType {
  hospital
  pm
}

enum Effect {
  allow
  deny
}

enum Scope {
  own
  dept
  facility
  tenant
  any
}

enum Decision {
  allow
  deny
}

model Tenant {
  id            String         @id @default(cuid())
  slug          String         @unique
  name          String
  type          TenantType
  createdAt     DateTime       @default(now())
  users         User[]
  orgUnits      OrgUnit[]
  roles         Role[]
  resourceTypes ResourceType[]
  pages         Page[]
  auditLogs     AuditLog[]
  assets        Asset[]
  workOrders    WorkOrder[]
  vendors       Vendor[]
  contracts     Contract[]
  projects      Project[]
  tasks         Task[]
}

model User {
  id           String        @id @default(cuid())
  tenantId     String
  email        String
  password     String
  attributes   Json          @default("{}")
  createdAt    DateTime      @default(now())
  tenant       Tenant        @relation(fields: [tenantId], references: [id])
  userRoles    UserRole[]
  userOrgUnits UserOrgUnit[]
  userGrants   UserGrant[]

  @@unique([tenantId, email])
}

model OrgUnit {
  id       String        @id @default(cuid())
  tenantId String
  parentId String?
  type     String
  name     String
  tenant   Tenant        @relation(fields: [tenantId], references: [id])
  parent   OrgUnit?      @relation("OrgTree", fields: [parentId], references: [id])
  children OrgUnit[]     @relation("OrgTree")
  members  UserOrgUnit[]
}

model UserOrgUnit {
  userId    String
  orgUnitId String
  user      User    @relation(fields: [userId], references: [id])
  orgUnit   OrgUnit @relation(fields: [orgUnitId], references: [id])

  @@id([userId, orgUnitId])
}

model Role {
  id           String           @id @default(cuid())
  tenantId     String
  name         String
  parentRoleId String?
  isSystem     Boolean          @default(false)
  tenant       Tenant           @relation(fields: [tenantId], references: [id])
  parent       Role?            @relation("RoleHierarchy", fields: [parentRoleId], references: [id])
  children     Role[]           @relation("RoleHierarchy")
  grants       Grant[]
  userRoles    UserRole[]
  pageAccess   RolePageAccess[]

  @@unique([tenantId, name])
}

model UserRole {
  userId String
  roleId String
  user   User @relation(fields: [userId], references: [id])
  role   Role @relation(fields: [roleId], references: [id])

  @@id([userId, roleId])
}

model ResourceType {
  id       String @id @default(cuid())
  tenantId String
  key      String
  label    String
  tenant   Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, key])
}

model Action {
  id    String @id @default(cuid())
  key   String @unique
  label String
}

model Grant {
  id               String    @id @default(cuid())
  roleId           String
  resourceTypeKey  String
  actionKey        String
  effect           Effect    @default(allow)
  scope            Scope     @default(any)
  condition        Json?
  expiresAt        DateTime?
  role             Role      @relation(fields: [roleId], references: [id])

  @@index([roleId])
}

model UserGrant {
  id               String    @id @default(cuid())
  userId           String
  resourceTypeKey  String
  actionKey        String
  effect           Effect    @default(allow)
  scope            Scope     @default(any)
  condition        Json?
  expiresAt        DateTime?
  user             User      @relation(fields: [userId], references: [id])

  @@index([userId])
}

model Page {
  id                  String           @id @default(cuid())
  tenantId            String
  key                 String
  label               String
  path                String
  icon                String?
  order               Int              @default(0)
  parentId            String?
  requiredPermissions String[]
  inheritFromParent   Boolean          @default(true)
  isMenuItem          Boolean          @default(true)
  tenant              Tenant           @relation(fields: [tenantId], references: [id])
  parent              Page?            @relation("PageTree", fields: [parentId], references: [id])
  children            Page[]           @relation("PageTree")
  access              RolePageAccess[]

  @@unique([tenantId, key])
}

model RolePageAccess {
  roleId  String
  pageId  String
  enabled Boolean @default(true)
  role    Role    @relation(fields: [roleId], references: [id])
  page    Page    @relation(fields: [pageId], references: [id])

  @@id([roleId, pageId])
}

model AuditLog {
  id            String   @id @default(cuid())
  tenantId      String
  userId        String?
  action        String
  resourceType  String
  resourceId    String?
  decision      Decision
  reason        String
  matchedGrantId String?
  ts            DateTime @default(now())
  tenant        Tenant   @relation(fields: [tenantId], references: [id])

  @@index([tenantId, ts])
}

model Asset {
  id               String      @id @default(cuid())
  tenantId         String
  orgUnitId        String?
  assignedToUserId String?
  name             String
  status           String      @default("active")
  value            Int         @default(0)
  tenant           Tenant      @relation(fields: [tenantId], references: [id])
  workOrders       WorkOrder[]
}

model WorkOrder {
  id               String  @id @default(cuid())
  tenantId         String
  assetId          String
  requestedById    String
  assignedToUserId String?
  status           String  @default("requested")
  cost             Int     @default(0)
  tenant           Tenant  @relation(fields: [tenantId], references: [id])
  asset            Asset   @relation(fields: [assetId], references: [id])
}

model Vendor {
  id       String @id @default(cuid())
  tenantId String
  name     String
  tenant   Tenant @relation(fields: [tenantId], references: [id])
}

model Contract {
  id       String @id @default(cuid())
  tenantId String
  vendorId String
  title    String
  tenant   Tenant @relation(fields: [tenantId], references: [id])
}

model Project {
  id        String @id @default(cuid())
  tenantId  String
  orgUnitId String?
  ownerId   String
  name      String
  tenant    Tenant @relation(fields: [tenantId], references: [id])
  tasks     Task[]
}

model Task {
  id         String  @id @default(cuid())
  tenantId   String
  projectId  String
  assigneeId String?
  title      String
  status     String  @default("todo")
  tenant     Tenant  @relation(fields: [tenantId], references: [id])
  project    Project @relation(fields: [projectId], references: [id])
}
```

- [ ] **Step 2: Create the initial migration and generate the client**

Run: `npx prisma migrate dev --name init`
Expected: migration `..._init` created and applied; "Your database is now in sync"; Prisma Client generated.

- [ ] **Step 3: Sanity-check the schema in the DB**

Run: `npx prisma db pull --print | head -5`
Expected: prints schema lines without error (DB reachable, tables exist).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): full multi-tenant RBAC+ABAC prisma schema + initial migration"
```

---

## Task 4: Config loader

**Files:**
- Create: `src/config.js`

- [ ] **Step 1: Write `src/config.js`**

```javascript
import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  port: Number(process.env.PORT || 3000),
};
```

- [ ] **Step 2: Verify it loads**

Run: `node -e "import('./src/config.js').then(m => console.log(m.config.port))"`
Expected: prints `3000`.

- [ ] **Step 3: Commit**

```bash
git add src/config.js
git commit -m "feat(config): env-backed config loader"
```

---

## Task 5: Tenant context (AsyncLocalStorage)

**Files:**
- Create: `src/db/tenant-context.js`
- Test: `test/tenant-context.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWithTenant, getTenantId, requireTenantId } from '../src/db/tenant-context.js';

test('getTenantId returns undefined outside a tenant scope', () => {
  assert.equal(getTenantId(), undefined);
});

test('runWithTenant exposes the tenant id inside the callback', async () => {
  const seen = await runWithTenant('t_hospital', async () => getTenantId());
  assert.equal(seen, 't_hospital');
});

test('requireTenantId throws outside a tenant scope', () => {
  assert.throws(() => requireTenantId(), /No tenant context/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/tenant-context.test.js`
Expected: FAIL — cannot find module `../src/db/tenant-context.js`.

- [ ] **Step 3: Write `src/db/tenant-context.js`**

```javascript
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function runWithTenant(tenantId, callback) {
  return storage.run({ tenantId }, callback);
}

export function getTenantId() {
  return storage.getStore()?.tenantId;
}

export function requireTenantId() {
  const tenantId = getTenantId();
  if (!tenantId) throw new Error('No tenant context in scope');
  return tenantId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/tenant-context.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/db/tenant-context.js test/tenant-context.test.js
git commit -m "feat(db): AsyncLocalStorage tenant context"
```

---

## Task 6: Prisma client + tenant-scoped extension

**Files:**
- Create: `src/db/prisma.js`
- Create: `src/db/tenant-scoped.js`
- Create: `src/db/index.js`
- Test: `test/tenant-scope.test.js`

- [ ] **Step 1: Write `src/db/prisma.js` (raw client singleton)**

```javascript
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 2: Write `src/db/tenant-scoped.js`**

The set of models carrying a `tenantId` column. The extension injects the
current tenant on reads/writes so handlers never repeat `where: { tenantId }`.

```javascript
import { getTenantId } from './tenant-context.js';

// Models that own a tenantId column (join tables reach tenant via their parents).
export const TENANT_SCOPED_MODELS = new Set([
  'User', 'OrgUnit', 'Role', 'ResourceType', 'Page', 'AuditLog',
  'Asset', 'WorkOrder', 'Vendor', 'Contract', 'Project', 'Task',
]);

// Only operations whose `where`/`data` accept arbitrary fields are auto-scoped.
// findUnique/update/delete/upsert require a UNIQUE where — Prisma rejects an extra
// tenantId there — so we deliberately do NOT touch them (see note below).
const READ_WHERE_OPS = new Set([
  'findFirst', 'findFirstOrThrow', 'findMany', 'updateMany', 'deleteMany',
  'count', 'aggregate', 'groupBy',
]);

export function tenantScopedExtension(prisma) {
  return prisma.$extends({
    name: 'tenant-scoped',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model)) return query(args);
          const tenantId = getTenantId();
          if (!tenantId) return query(args); // platform-scope: caller used raw client deliberately

          args = args ?? {};
          if (READ_WHERE_OPS.has(operation)) {
            args.where = { ...(args.where ?? {}), tenantId };
          } else if (operation === 'create') {
            args.data = { ...(args.data ?? {}), tenantId };
          } else if (operation === 'createMany') {
            const rows = Array.isArray(args.data) ? args.data : [args.data];
            args.data = rows.map((r) => ({ ...r, tenantId }));
          }
          // findUnique/update/delete/upsert: left untouched on purpose.
          return query(args);
        },
      },
    },
  });
}
```

> Note: Prisma rejects an extra `tenantId` in the `where` of `findUnique`/`update`/`delete`/`upsert`
> (only unique fields allowed there). So the extension auto-scopes only `findFirst`/`findMany`/
> `count`/`updateMany`/`deleteMany`/`create`/`createMany`. The rule for services in later phases:
> **to fetch-or-mutate a single tenant-owned row, first load it with `findFirst` (auto-scoped),
> then act by `id`.** Phase 1 only exercises `findFirst`/`findMany`/`create`, so this is safe now.

- [ ] **Step 3: Write `src/db/index.js`**

```javascript
import { prisma } from './prisma.js';
import { tenantScopedExtension } from './tenant-scoped.js';

// Tenant-aware client for normal request handling.
export const db = tenantScopedExtension(prisma);

// Raw client for platform-level operations (creating tenants, seeding).
export const rawDb = prisma;
```

- [ ] **Step 4: Write the failing DB test**

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, rawDb } from '../src/db/index.js';
import { runWithTenant } from '../src/db/tenant-context.js';

let tA, tB;

before(async () => {
  tA = await rawDb.tenant.create({ data: { slug: 'scope-a', name: 'A', type: 'hospital' } });
  tB = await rawDb.tenant.create({ data: { slug: 'scope-b', name: 'B', type: 'pm' } });
  await rawDb.user.create({ data: { tenantId: tA.id, email: 'a@x.com', password: 'x' } });
  await rawDb.user.create({ data: { tenantId: tB.id, email: 'b@x.com', password: 'x' } });
});

after(async () => {
  await rawDb.user.deleteMany({ where: { tenantId: { in: [tA.id, tB.id] } } });
  await rawDb.tenant.deleteMany({ where: { id: { in: [tA.id, tB.id] } } });
  await rawDb.$disconnect();
});

test('tenant-scoped findMany only returns the current tenant rows', async () => {
  const usersA = await runWithTenant(tA.id, () => db.user.findMany());
  assert.equal(usersA.length, 1);
  assert.equal(usersA[0].email, 'a@x.com');
});

test('tenant-scoped create stamps the current tenantId', async () => {
  const created = await runWithTenant(tA.id, () =>
    db.user.create({ data: { email: 'a2@x.com', password: 'x' } })
  );
  assert.equal(created.tenantId, tA.id);
  await rawDb.user.delete({ where: { id: created.id } });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `node --test test/tenant-scope.test.js`
Expected: FAIL — module `../src/db/index.js` resolves, but assertions fail if extension not wired (or module-missing before Step 1–3). Confirm the failure is assertion/behavior, not a syntax error.

- [ ] **Step 6: Ensure Postgres is up, then run to verify it passes**

Run: `npm run db:up && node --test test/tenant-scope.test.js`
Expected: PASS — 2 tests. (Requires the migration from Task 3.)

- [ ] **Step 7: Commit**

```bash
git add src/db/prisma.js src/db/tenant-scoped.js src/db/index.js test/tenant-scope.test.js
git commit -m "feat(db): tenant-scoped prisma extension with isolation test"
```

---

## Task 7: Password and JWT utilities

**Files:**
- Create: `src/lib/password.js`
- Create: `src/lib/jwt.js`
- Test: `test/lib.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { signToken, verifyToken } from '../src/lib/jwt.js';

test('hashPassword + verifyPassword round-trips', async () => {
  const hash = await hashPassword('password');
  assert.notEqual(hash, 'password');
  assert.equal(await verifyPassword('password', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

test('signToken + verifyToken round-trips the payload', () => {
  const token = signToken({ userId: 'u1', tenantId: 't1' });
  const decoded = verifyToken(token);
  assert.equal(decoded.userId, 'u1');
  assert.equal(decoded.tenantId, 't1');
});

test('verifyToken throws on a tampered token', () => {
  assert.throws(() => verifyToken('not.a.jwt'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lib.test.js`
Expected: FAIL — cannot find module `../src/lib/password.js`.

- [ ] **Step 3: Write `src/lib/password.js`**

```javascript
import bcrypt from 'bcryptjs';

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Write `src/lib/jwt.js`**

```javascript
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/lib.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/password.js src/lib/jwt.js test/lib.test.js
git commit -m "feat(lib): password hashing and JWT helpers"
```

---

## Task 8: Auth service (login)

**Files:**
- Create: `src/services/auth.service.js`
- Test: `test/auth.service.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rawDb } from '../src/db/index.js';
import { hashPassword } from '../src/lib/password.js';
import { login, AuthError } from '../src/services/auth.service.js';

let tenant;

before(async () => {
  tenant = await rawDb.tenant.create({ data: { slug: 'svc-auth', name: 'Svc', type: 'hospital' } });
  await rawDb.user.create({
    data: { tenantId: tenant.id, email: 'svc@x.com', password: await hashPassword('password') },
  });
});

after(async () => {
  await rawDb.user.deleteMany({ where: { tenantId: tenant.id } });
  await rawDb.tenant.delete({ where: { id: tenant.id } });
  await rawDb.$disconnect();
});

test('login returns a token and user for valid credentials', async () => {
  const result = await login({ tenantSlug: 'svc-auth', email: 'svc@x.com', password: 'password' });
  assert.ok(result.access_token);
  assert.equal(result.user.email, 'svc@x.com');
  assert.equal(result.user.tenantId, tenant.id);
});

test('login rejects a wrong password with AuthError', async () => {
  await assert.rejects(
    () => login({ tenantSlug: 'svc-auth', email: 'svc@x.com', password: 'nope' }),
    AuthError
  );
});

test('login rejects an unknown tenant with AuthError', async () => {
  await assert.rejects(
    () => login({ tenantSlug: 'no-such', email: 'svc@x.com', password: 'password' }),
    AuthError
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/auth.service.test.js`
Expected: FAIL — cannot find module `../src/services/auth.service.js`.

- [ ] **Step 3: Write `src/services/auth.service.js`**

```javascript
import { rawDb } from '../db/index.js';
import { verifyPassword } from '../lib/password.js';
import { signToken } from '../lib/jwt.js';

export class AuthError extends Error {
  constructor(message = 'Invalid credentials') {
    super(message);
    this.name = 'AuthError';
    this.status = 401;
  }
}

// Login resolves the tenant by slug, then the user within that tenant.
// Uses rawDb because there is no tenant context yet at login time.
export async function login({ tenantSlug, email, password }) {
  const tenant = await rawDb.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new AuthError();

  const user = await rawDb.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email } },
  });
  if (!user) throw new AuthError();

  const ok = await verifyPassword(password, user.password);
  if (!ok) throw new AuthError();

  const access_token = signToken({ userId: user.id, tenantId: tenant.id });
  return {
    access_token,
    user: { id: user.id, email: user.email, tenantId: tenant.id },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/auth.service.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/auth.service.js test/auth.service.test.js
git commit -m "feat(auth): login service resolving tenant + user, issuing JWT"
```

---

## Task 9: Auth controller and route

**Files:**
- Create: `src/controllers/auth.controller.js`
- Create: `src/routes/auth.routes.js`

- [ ] **Step 1: Write `src/controllers/auth.controller.js`**

```javascript
import { login } from '../services/auth.service.js';

export async function postLogin(req, res, next) {
  try {
    const { tenantSlug, email, password } = req.body ?? {};
    if (!tenantSlug || !email || !password) {
      return res.status(400).json({ error: 'tenantSlug, email and password are required' });
    }
    const result = await login({ tenantSlug, email, password });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 2: Write `src/routes/auth.routes.js`**

```javascript
import { Router } from 'express';
import { postLogin } from '../controllers/auth.controller.js';

export const authRoutes = Router();

authRoutes.post('/login', postLogin);
```

- [ ] **Step 3: Commit**

```bash
git add src/controllers/auth.controller.js src/routes/auth.routes.js
git commit -m "feat(auth): login controller and route"
```

---

## Task 10: Auth + tenant-context middleware

**Files:**
- Create: `src/middleware/auth.js`
- Create: `src/middleware/tenant-context.js`

- [ ] **Step 1: Write `src/middleware/auth.js`**

```javascript
import { verifyToken } from '../lib/jwt.js';

// Verifies the Bearer token and attaches req.user = { userId, tenantId }.
export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    const payload = verifyToken(token);
    req.user = { userId: payload.userId, tenantId: payload.tenantId };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

- [ ] **Step 2: Write `src/middleware/tenant-context.js`**

```javascript
import { runWithTenant } from '../db/tenant-context.js';

// Runs the rest of the request inside the authenticated user's tenant scope,
// so every tenant-scoped db query is automatically filtered.
export function tenantContext(req, res, next) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(401).json({ error: 'No tenant in token' });
  runWithTenant(tenantId, () => next());
}
```

- [ ] **Step 3: Commit**

```bash
git add src/middleware/auth.js src/middleware/tenant-context.js
git commit -m "feat(middleware): JWT authenticate + tenant-context"
```

---

## Task 11: Error middleware

**Files:**
- Create: `src/middleware/error.js`

- [ ] **Step 1: Write `src/middleware/error.js`**

```javascript
// Central error handler. Known errors carry a numeric `status`.
export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal Server Error' });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware/error.js
git commit -m "feat(middleware): central error handler"
```

---

## Task 12: App wiring and entry point

**Files:**
- Create: `src/app.js`
- Create: `src/index.js`

- [ ] **Step 1: Write `src/app.js`**

```javascript
import express from 'express';
import { authRoutes } from './routes/auth.routes.js';
import { authenticate } from './middleware/auth.js';
import { tenantContext } from './middleware/tenant-context.js';
import { errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.use('/auth', authRoutes);

  // Example protected probe: confirms auth + tenant context wiring end to end.
  app.get('/me/context', authenticate, tenantContext, (req, res) => {
    res.json({ userId: req.user.userId, tenantId: req.user.tenantId });
  });

  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 2: Write `src/index.js`**

```javascript
import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();
app.listen(config.port, () => {
  console.log(`RBAC API listening on http://localhost:${config.port}`);
});
```

- [ ] **Step 3: Smoke-check the server boots**

Run: `node -e "import('./src/app.js').then(m => { m.createApp(); console.log('app ok'); })"`
Expected: prints `app ok` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app.js src/index.js
git commit -m "feat(app): express wiring with health, auth, and protected probe"
```

---

## Task 13: Minimal seed

**Files:**
- Create: `prisma/seed.js`

- [ ] **Step 1: Write `prisma/seed.js`**

```javascript
import { rawDb } from '../src/db/index.js';
import { hashPassword } from '../src/lib/password.js';

async function main() {
  const pw = await hashPassword('password');

  const hospital = await rawDb.tenant.upsert({
    where: { slug: 'mercy' },
    update: {},
    create: { slug: 'mercy', name: 'Mercy Health', type: 'hospital' },
  });

  const pm = await rawDb.tenant.upsert({
    where: { slug: 'acme' },
    update: {},
    create: { slug: 'acme', name: 'Acme Projects', type: 'pm' },
  });

  await rawDb.user.upsert({
    where: { tenantId_email: { tenantId: hospital.id, email: 'alice@mercy.test' } },
    update: {},
    create: { tenantId: hospital.id, email: 'alice@mercy.test', password: pw },
  });

  await rawDb.user.upsert({
    where: { tenantId_email: { tenantId: pm.id, email: 'dave@acme.test' } },
    update: {},
    create: { tenantId: pm.id, email: 'dave@acme.test', password: pw },
  });

  console.log('Seeded tenants: mercy (hospital), acme (pm). Password for all users: "password".');
}

main()
  .then(() => rawDb.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await rawDb.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Run the seed**

Run: `npm run seed`
Expected: prints the "Seeded tenants…" line, no errors.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.js
git commit -m "feat(db): minimal seed — hospital + pm tenants with one user each"
```

---

## Task 14: End-to-end login + tenant isolation test

**Files:**
- Create: `test/helpers.js`
- Create: `test/auth.e2e.test.js`

- [ ] **Step 1: Write `test/helpers.js`**

```javascript
import { createApp } from '../src/app.js';

// Boots the app on an ephemeral port and returns { baseUrl, close }.
export async function startTestServer() {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://localhost:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
```

- [ ] **Step 2: Write the failing e2e test**

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rawDb } from '../src/db/index.js';
import { hashPassword } from '../src/lib/password.js';
import { startTestServer } from './helpers.js';

let server, hospital, pm;

before(async () => {
  hospital = await rawDb.tenant.upsert({
    where: { slug: 'e2e-hosp' }, update: {},
    create: { slug: 'e2e-hosp', name: 'E2E Hosp', type: 'hospital' },
  });
  pm = await rawDb.tenant.upsert({
    where: { slug: 'e2e-pm' }, update: {},
    create: { slug: 'e2e-pm', name: 'E2E PM', type: 'pm' },
  });
  const pw = await hashPassword('password');
  await rawDb.user.upsert({
    where: { tenantId_email: { tenantId: hospital.id, email: 'h@x.com' } }, update: {},
    create: { tenantId: hospital.id, email: 'h@x.com', password: pw },
  });
  server = await startTestServer();
});

after(async () => {
  await server.close();
  await rawDb.user.deleteMany({ where: { tenantId: { in: [hospital.id, pm.id] } } });
  await rawDb.tenant.deleteMany({ where: { id: { in: [hospital.id, pm.id] } } });
  await rawDb.$disconnect();
});

test('login returns a token and /me/context echoes the tenant', async () => {
  const loginRes = await fetch(`${server.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantSlug: 'e2e-hosp', email: 'h@x.com', password: 'password' }),
  });
  assert.equal(loginRes.status, 200);
  const { access_token } = await loginRes.json();
  assert.ok(access_token);

  const ctxRes = await fetch(`${server.baseUrl}/me/context`, {
    headers: { authorization: `Bearer ${access_token}` },
  });
  assert.equal(ctxRes.status, 200);
  const ctx = await ctxRes.json();
  assert.equal(ctx.tenantId, hospital.id);
});

test('a request with no token is rejected', async () => {
  const res = await fetch(`${server.baseUrl}/me/context`);
  assert.equal(res.status, 401);
});

test('wrong-tenant login is rejected', async () => {
  const res = await fetch(`${server.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantSlug: 'e2e-pm', email: 'h@x.com', password: 'password' }),
  });
  assert.equal(res.status, 401); // user h@x.com does not exist in the pm tenant
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/auth.e2e.test.js`
Expected: FAIL — module `./helpers.js` missing before Step 1, or assertions fail until app/auth exist.

- [ ] **Step 4: Run the full suite to verify everything passes**

Run: `npm run db:up && node --test`
Expected: PASS — all test files green (tenant-context, tenant-scope, lib, auth.service, auth.e2e).

- [ ] **Step 5: Commit**

```bash
git add test/helpers.js test/auth.e2e.test.js
git commit -m "test(auth): e2e login + tenant-context + isolation"
```

---

## Phase 1 Done — Verification Checklist

- [ ] `docker compose ps` shows Postgres healthy.
- [ ] `npx prisma migrate status` shows the migration applied.
- [ ] `npm run seed` succeeds.
- [ ] `node --test` is fully green.
- [ ] `npm start` boots; `curl localhost:3000/health` returns `{"ok":true}`.
- [ ] `curl -X POST localhost:3000/auth/login -H 'content-type: application/json' -d '{"tenantSlug":"mercy","email":"alice@mercy.test","password":"password"}'` returns a token.

**Next:** Phase 2 (Engine) — write `phase-2-engine.md` and build the pure `can()` evaluator + operator library on this foundation.
