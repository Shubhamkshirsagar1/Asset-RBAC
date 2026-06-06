import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize, models } from '../src/db/index.js';
import { runWithTenant } from '../src/db/tenant-context.js';
import { hashPassword } from '../src/lib/password.js';
import { can } from '../src/services/authorize.service.js';
import { invalidateAll } from '../src/services/rbac.service.js';
import { startTestServer } from './helpers.js';
import {
  makeTenant, makeRole, makeUser, assignRole, makeGrant, makeUserGrant, makeAsset,
} from './factories.js';

const { Tenant, User } = models;
let server, tH, tP, adminUser, wildcardUser, expiredUser, futureUser, userGrantUser, denyUser;

before(async () => {
  tH = await makeTenant('hospital');
  tP = await makeTenant('pm');

  // Tenant H: an admin that can read any asset (used for the HTTP isolation check).
  const adminRole = await makeRole(tH.id, { name: 'admin' });
  await makeGrant(adminRole.id, { resourceTypeKey: 'asset', actionKey: 'read', scope: 'any' });
  adminUser = await User.create({ tenantId: tH.id, email: 'admin@h.test', password: await hashPassword('password') });
  await assignRole(adminUser.id, adminRole.id);

  // Superadmin wildcard.
  const superRole = await makeRole(tH.id, { name: 'superadmin' });
  await makeGrant(superRole.id, { resourceTypeKey: '*', actionKey: '*', scope: 'any' });
  wildcardUser = await makeUser(tH.id);
  await assignRole(wildcardUser.id, superRole.id);

  // Time-bound grants (user-level).
  expiredUser = await makeUser(tH.id);
  await makeUserGrant(expiredUser.id, { resourceTypeKey: 'asset', actionKey: 'read', scope: 'any', expiresAt: new Date('2020-01-01') });
  futureUser = await makeUser(tH.id);
  await makeUserGrant(futureUser.id, { resourceTypeKey: 'asset', actionKey: 'read', scope: 'any', expiresAt: new Date('2999-01-01') });

  // User-level grant with no roles at all.
  userGrantUser = await makeUser(tH.id);
  await makeUserGrant(userGrantUser.id, { resourceTypeKey: 'asset', actionKey: 'read', scope: 'any' });

  // Deny-override: allow via role, deny via user grant.
  const allowRole = await makeRole(tH.id, { name: 'reader' });
  await makeGrant(allowRole.id, { resourceTypeKey: 'asset', actionKey: 'read', scope: 'any' });
  denyUser = await makeUser(tH.id);
  await assignRole(denyUser.id, allowRole.id);
  await makeUserGrant(denyUser.id, { resourceTypeKey: 'asset', actionKey: 'read', scope: 'any', effect: 'deny' });

  await makeAsset(tH.id, { name: 'H-Asset' });
  await makeAsset(tP.id, { name: 'P-Asset' });

  server = await startTestServer();
});

after(async () => {
  await server.close();
  invalidateAll();
  await Tenant.destroy({ where: { id: tH.id } });
  await Tenant.destroy({ where: { id: tP.id } });
  await sequelize.close();
});

test('tenant isolation: an admin only ever sees their own tenant rows (HTTP)', async () => {
  const res = await fetch(`${server.baseUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantSlug: tH.slug, email: 'admin@h.test', password: 'password' }),
  });
  const { access_token } = await res.json();
  const list = await fetch(`${server.baseUrl}/assets`, { headers: { authorization: `Bearer ${access_token}` } });
  const names = (await list.json()).assets.map((a) => a.name);
  assert.deepEqual(names, ['H-Asset']); // never P-Asset
});

test('superadmin wildcard grant authorizes any action on any resource', async () => {
  await runWithTenant(tH.id, async () => {
    assert.equal((await can(wildcardUser.id, 'read', 'asset', {})).allowed, true);
    assert.equal((await can(wildcardUser.id, 'approve', 'work_order', {})).allowed, true);
    assert.equal((await can(wildcardUser.id, 'whatever', 'anything', {})).allowed, true);
  });
});

test('time-bound grant: expired denied, future allowed', async () => {
  await runWithTenant(tH.id, async () => {
    assert.equal((await can(expiredUser.id, 'read', 'asset', {})).allowed, false);
    assert.equal((await can(futureUser.id, 'read', 'asset', {})).allowed, true);
  });
});

test('explicit user-level grant authorizes without any role', async () => {
  await runWithTenant(tH.id, async () => {
    assert.equal((await can(userGrantUser.id, 'read', 'asset', {})).allowed, true);
  });
});

test('deny-override: a deny user-grant beats an allow role-grant', async () => {
  await runWithTenant(tH.id, async () => {
    const d = await can(denyUser.id, 'read', 'asset', {});
    assert.equal(d.allowed, false);
    assert.equal(d.effect, 'deny');
  });
});
