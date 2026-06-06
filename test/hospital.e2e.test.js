import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize, models } from '../src/db/index.js';
import { hashPassword } from '../src/lib/password.js';
import { invalidateAll } from '../src/services/rbac.service.js';
import { startTestServer } from './helpers.js';
import {
  makeTenant, makeOrgUnit, makeRole, assignRole, assignOrg, makeGrant, makeAsset,
} from './factories.js';

const { Tenant, User } = models;
let server, tenant, deptA, deptB, techA, mgr, a1, a2;

before(async () => {
  tenant = await makeTenant();
  const facility = await makeOrgUnit(tenant.id, { type: 'facility', name: 'F' });
  deptA = await makeOrgUnit(tenant.id, { type: 'dept', name: 'A', parentId: facility.id });
  deptB = await makeOrgUnit(tenant.id, { type: 'dept', name: 'B', parentId: facility.id });

  const techRole = await makeRole(tenant.id, { name: 'tech' });
  await makeGrant(techRole.id, { resourceTypeKey: 'asset', actionKey: 'read', scope: 'dept' });
  await makeGrant(techRole.id, { resourceTypeKey: 'asset', actionKey: 'update', scope: 'own' });
  await makeGrant(techRole.id, { resourceTypeKey: 'work_order', actionKey: 'create', scope: 'any' });
  await makeGrant(techRole.id, { resourceTypeKey: 'work_order', actionKey: 'read', scope: 'own' });

  const mgrRole = await makeRole(tenant.id, { name: 'manager' });
  await makeGrant(mgrRole.id, { resourceTypeKey: 'asset', actionKey: 'read', scope: 'any' });
  await makeGrant(mgrRole.id, { resourceTypeKey: 'work_order', actionKey: 'create', scope: 'any' });
  await makeGrant(mgrRole.id, { resourceTypeKey: 'work_order', actionKey: 'approve', scope: 'any',
    condition: { 'resource.requestedById': { ne: '$user.id' }, 'resource.cost': { lte: 5000 } } });

  const pw = await hashPassword('password');
  techA = await User.create({ tenantId: tenant.id, email: 'techa@x.com', password: pw });
  mgr = await User.create({ tenantId: tenant.id, email: 'mgr@x.com', password: pw });
  await assignRole(techA.id, techRole.id);
  await assignOrg(techA.id, deptA.id);
  await assignRole(mgr.id, mgrRole.id);
  await assignOrg(mgr.id, deptA.id);

  a1 = await makeAsset(tenant.id, { name: 'A1', orgUnitId: deptA.id, assignedToUserId: techA.id, value: 1000 });
  a2 = await makeAsset(tenant.id, { name: 'A2', orgUnitId: deptA.id, assignedToUserId: mgr.id, value: 2000 });
  await makeAsset(tenant.id, { name: 'B1', orgUnitId: deptB.id, value: 3000 });

  server = await startTestServer();
});

after(async () => {
  await server.close();
  invalidateAll();
  await Tenant.destroy({ where: { id: tenant.id } });
  await sequelize.close();
});

async function login(email) {
  const res = await fetch(`${server.baseUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantSlug: tenant.slug, email, password: 'password' }),
  });
  return (await res.json()).access_token;
}
const call = (token, method, path, body) =>
  fetch(`${server.baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

test('dept-scoped list returns only the caller department assets', async () => {
  const token = await login('techa@x.com');
  const res = await call(token, 'GET', '/assets');
  const names = (await res.json()).assets.map((a) => a.name).sort();
  assert.deepEqual(names, ['A1', 'A2']); // deptA only; B1 (deptB) excluded
});

test('ownership update: own asset allowed, others forbidden', async () => {
  const token = await login('techa@x.com');
  assert.equal((await call(token, 'PATCH', `/assets/${a1.id}`, { value: 1500 })).status, 200);
  assert.equal((await call(token, 'PATCH', `/assets/${a2.id}`, { value: 1 })).status, 403);
});

test('tech creates a work order but cannot approve it', async () => {
  const token = await login('techa@x.com');
  const created = await (await call(token, 'POST', '/work-orders', { assetId: a1.id, cost: 1000 })).json();
  assert.equal(created.status, 'requested');
  const approve = await call(token, 'POST', `/work-orders/${created.id}/approve`);
  assert.equal(approve.status, 403); // tech has no approve grant
});

test('manager approves another user request under the cost threshold', async () => {
  const techToken = await login('techa@x.com');
  const wo = await (await call(techToken, 'POST', '/work-orders', { assetId: a1.id, cost: 1000 })).json();

  const mgrToken = await login('mgr@x.com');
  const approve = await call(mgrToken, 'POST', `/work-orders/${wo.id}/approve`);
  assert.equal(approve.status, 200);
  assert.equal((await approve.json()).status, 'approved');
});

test('segregation of duties: manager cannot approve their own request', async () => {
  const mgrToken = await login('mgr@x.com');
  const wo = await (await call(mgrToken, 'POST', '/work-orders', { assetId: a1.id, cost: 1000 })).json();
  const approve = await call(mgrToken, 'POST', `/work-orders/${wo.id}/approve`);
  assert.equal(approve.status, 403); // requestedById ne $user.id fails
});

test('cost threshold: over-limit work orders cannot be approved', async () => {
  const techToken = await login('techa@x.com');
  const wo = await (await call(techToken, 'POST', '/work-orders', { assetId: a1.id, cost: 9000 })).json();
  const mgrToken = await login('mgr@x.com');
  const approve = await call(mgrToken, 'POST', `/work-orders/${wo.id}/approve`);
  assert.equal(approve.status, 403); // cost lte 5000 fails
});
