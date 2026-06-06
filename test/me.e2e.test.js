import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize, models } from '../src/db/index.js';
import { hashPassword } from '../src/lib/password.js';
import { invalidateUser } from '../src/services/rbac.service.js';
import { startTestServer } from './helpers.js';
import { makeTenant, makeRole, assignRole, makeGrant } from './factories.js';

const { Tenant, User } = models;
let server, tenant, user, role;

before(async () => {
  tenant = await makeTenant();
  role = await makeRole(tenant.id, { name: 'user' });
  user = await User.create({ tenantId: tenant.id, email: 'me@x.com', password: await hashPassword('password') });
  await assignRole(user.id, role.id);
  await makeGrant(role.id, { resourceTypeKey: 'invoices', actionKey: 'read', scope: 'own' });
  server = await startTestServer();
});

after(async () => {
  await server.close();
  invalidateUser(user.id);
  await Tenant.destroy({ where: { id: tenant.id } });
  await sequelize.close();
});

async function login() {
  const res = await fetch(`${server.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantSlug: tenant.slug, email: 'me@x.com', password: 'password' }),
  });
  return (await res.json()).access_token;
}

test('GET /me returns the user with role ids', async () => {
  const token = await login();
  const res = await fetch(`${server.baseUrl}/me`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.email, 'me@x.com');
  assert.deepEqual(body.roleIds, [role.id]);
});

test('GET /me/permissions returns the effective grants', async () => {
  const token = await login();
  const res = await fetch(`${server.baseUrl}/me/permissions`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.permissions.length, 1);
  assert.equal(body.permissions[0].resourceTypeKey, 'invoices');
});

test('GET /me without a token is rejected', async () => {
  const res = await fetch(`${server.baseUrl}/me`);
  assert.equal(res.status, 401);
});
