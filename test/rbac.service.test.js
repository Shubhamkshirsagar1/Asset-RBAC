import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize } from '../src/db/index.js';
import { runWithTenant } from '../src/db/tenant-context.js';
import { getEffectiveRoleIds, collectGrants, invalidateUser } from '../src/services/rbac.service.js';
import {
  makeTenant, makeRole, makeUser, assignRole, makeGrant, makeUserGrant, cleanupTenant,
} from './factories.js';

let tenant, roleUser, roleManager, roleAdmin, user;

before(async () => {
  tenant = await makeTenant();
  roleUser = await makeRole(tenant.id, { name: 'user' });
  roleManager = await makeRole(tenant.id, { name: 'manager', parentRoleId: roleUser.id });
  roleAdmin = await makeRole(tenant.id, { name: 'admin', parentRoleId: roleManager.id });
  user = await makeUser(tenant.id);
  await assignRole(user.id, roleAdmin.id);

  await makeGrant(roleUser.id, { resourceTypeKey: 'invoices', actionKey: 'read', scope: 'own' });
  await makeGrant(roleManager.id, { resourceTypeKey: 'invoices', actionKey: 'approve', scope: 'any' });
  await makeUserGrant(user.id, { resourceTypeKey: 'reports', actionKey: 'read', scope: 'any' });
});

after(async () => {
  invalidateUser(user.id);
  await cleanupTenant(tenant.id);
  await sequelize.close();
});

test('effective roles include all ancestors via hierarchy', async () => {
  const ids = await runWithTenant(tenant.id, () => getEffectiveRoleIds(user.id));
  assert.deepEqual([...ids].sort(), [roleUser.id, roleManager.id, roleAdmin.id].sort());
});

test('collectGrants merges role grants (across hierarchy) + user grants', async () => {
  const grants = await runWithTenant(tenant.id, () => collectGrants(user.id));
  assert.equal(grants.length, 3); // user role grant + manager role grant + user grant
  const keys = grants.map((g) => `${g.resourceTypeKey}:${g.actionKey}`).sort();
  assert.deepEqual(keys, ['invoices:approve', 'invoices:read', 'reports:read']);
});

test('grants are cached until invalidated', async () => {
  await runWithTenant(tenant.id, () => collectGrants(user.id)); // warm cache
  await makeUserGrant(user.id, { resourceTypeKey: 'extra', actionKey: 'read', scope: 'any' });

  const cached = await runWithTenant(tenant.id, () => collectGrants(user.id));
  assert.equal(cached.length, 3, 'still cached, new grant not seen yet');

  invalidateUser(user.id);
  const fresh = await runWithTenant(tenant.id, () => collectGrants(user.id));
  assert.equal(fresh.length, 4, 'new grant visible after invalidation');
});
