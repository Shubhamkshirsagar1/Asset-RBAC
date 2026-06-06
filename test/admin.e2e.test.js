import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize, models } from '../src/db/index.js';
import { hashPassword } from '../src/lib/password.js';
import { invalidateAll } from '../src/services/rbac.service.js';
import { startTestServer } from './helpers.js';
import { makeTenant, makeRole, assignRole, makeGrant } from './factories.js';

const { Tenant, User } = models;
let server, tenant, adminUser, targetUser;

before(async () => {
  tenant = await makeTenant();
  const adminRole = await makeRole(tenant.id, { name: 'admin' });
  await makeGrant(adminRole.id, { resourceTypeKey: 'rbac', actionKey: 'manage', scope: 'any' });
  adminUser = await User.create({ tenantId: tenant.id, email: 'admin@x.com', password: await hashPassword('password') });
  await assignRole(adminUser.id, adminRole.id);
  targetUser = await User.create({ tenantId: tenant.id, email: 'target@x.com', password: await hashPassword('password') });
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
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantSlug: tenant.slug, email, password: 'password' }),
  });
  return (await res.json()).access_token;
}
const authed = (token, method, path, body) =>
  fetch(`${server.baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

test('non-admin user is forbidden from /admin', async () => {
  const token = await login('target@x.com');
  const res = await authed(token, 'GET', '/admin/roles');
  assert.equal(res.status, 403);
});

test('admin can create role + grant + assign, reflected immediately by /admin/explain (cache busted)', async () => {
  const token = await login('admin@x.com');

  // Before any grant: target cannot read assets.
  let exp = await authed(token, 'POST', '/admin/explain', {
    userId: targetUser.id, action: 'read', resourceType: 'asset', resource: { ownerId: targetUser.id },
  });
  assert.equal((await exp.json()).decision.allowed, false);

  // Create role, grant asset:read:own, assign to target.
  const roleRes = await authed(token, 'POST', '/admin/roles', { name: 'tech' });
  assert.equal(roleRes.status, 201);
  const role = await roleRes.json();

  const grantRes = await authed(token, 'POST', `/admin/roles/${role.id}/grants`, {
    resourceTypeKey: 'asset', actionKey: 'read', scope: 'own',
  });
  assert.equal(grantRes.status, 201);

  const assignRes = await authed(token, 'POST', `/admin/users/${targetUser.id}/roles`, { roleId: role.id });
  assert.equal(assignRes.status, 204);

  // After: target CAN read own assets — proves invalidateAll() worked.
  exp = await authed(token, 'POST', '/admin/explain', {
    userId: targetUser.id, action: 'read', resourceType: 'asset', resource: { ownerId: targetUser.id },
  });
  const body = await exp.json();
  assert.equal(body.decision.allowed, true);
  assert.equal(body.decision.scope, 'own');
});

test('resource type create + list', async () => {
  const token = await login('admin@x.com');
  const create = await authed(token, 'POST', '/admin/resource-types', { key: 'asset', label: 'Asset' });
  assert.equal(create.status, 201);
  const list = await authed(token, 'GET', '/admin/resource-types');
  const keys = (await list.json()).resourceTypes.map((r) => r.key);
  assert.ok(keys.includes('asset'));
});

test('invalid grant scope is rejected with 400', async () => {
  const token = await login('admin@x.com');
  const roleRes = await authed(token, 'POST', '/admin/roles', { name: 'r-bad' });
  const role = await roleRes.json();
  const res = await authed(token, 'POST', `/admin/roles/${role.id}/grants`, {
    resourceTypeKey: 'asset', actionKey: 'read', scope: 'galaxy',
  });
  assert.equal(res.status, 400);
});
