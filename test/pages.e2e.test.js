import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize, models } from '../src/db/index.js';
import { hashPassword } from '../src/lib/password.js';
import { invalidateAll } from '../src/services/rbac.service.js';
import { startTestServer } from './helpers.js';
import { makeTenant, makeRole, assignRole, makeGrant } from './factories.js';

const { Tenant, User } = models;
let server, tenant, adminUser, viewerUser, viewerRole;

before(async () => {
  tenant = await makeTenant();
  const adminRole = await makeRole(tenant.id, { name: 'admin' });
  await makeGrant(adminRole.id, { resourceTypeKey: 'rbac', actionKey: 'manage', scope: 'any' });
  adminUser = await User.create({ tenantId: tenant.id, email: 'admin@x.com', password: await hashPassword('password') });
  await assignRole(adminUser.id, adminRole.id);

  viewerRole = await makeRole(tenant.id, { name: 'viewer' });
  await makeGrant(viewerRole.id, { resourceTypeKey: 'invoices', actionKey: 'read', scope: 'own' });
  viewerUser = await User.create({ tenantId: tenant.id, email: 'viewer@x.com', password: await hashPassword('password') });
  await assignRole(viewerUser.id, viewerRole.id);

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
const menuKeys = async (token) => {
  const res = await authed(token, 'GET', '/me/menu');
  return (await res.json()).menu.map((m) => m.key);
};

test('non-admin cannot create pages', async () => {
  const token = await login('viewer@x.com');
  const res = await authed(token, 'POST', '/admin/pages', { key: 'x', label: 'X', path: '/x' });
  assert.equal(res.status, 403);
});

test('admin creates a page; viewer sees it; per-role toggle hides then reveals it', async () => {
  const adminToken = await login('admin@x.com');
  const pageRes = await authed(adminToken, 'POST', '/admin/pages', {
    key: 'invoices', label: 'Invoices', path: '/invoices', requiredPermissions: ['invoices:read'],
  });
  assert.equal(pageRes.status, 201);
  const page = await pageRes.json();

  const viewerToken = await login('viewer@x.com');
  assert.ok((await menuKeys(viewerToken)).includes('invoices'), 'viewer sees invoices');

  // Disable for the viewer role.
  const off = await authed(adminToken, 'PUT', `/admin/roles/${viewerRole.id}/pages/${page.id}`, { enabled: false });
  assert.equal(off.status, 200);
  assert.ok(!(await menuKeys(viewerToken)).includes('invoices'), 'invoices hidden by toggle');

  // Re-enable.
  await authed(adminToken, 'PUT', `/admin/roles/${viewerRole.id}/pages/${page.id}`, { enabled: true });
  assert.ok((await menuKeys(viewerToken)).includes('invoices'), 'invoices visible again');
});
