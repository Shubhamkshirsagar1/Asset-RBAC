import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize, models } from '../src/db/index.js';
import { runWithTenant } from '../src/db/tenant-context.js';
import { can, listScope } from '../src/services/authorize.service.js';
import { invalidateUser } from '../src/services/rbac.service.js';
import { makeTenant, makeRole, makeUser, assignRole, makeGrant, cleanupTenant } from './factories.js';

const { AuditLog } = models;
let tenant, role, user;

before(async () => {
  tenant = await makeTenant();
  role = await makeRole(tenant.id, { name: 'user' });
  user = await makeUser(tenant.id);
  await assignRole(user.id, role.id);
  await makeGrant(role.id, { resourceTypeKey: 'asset', actionKey: 'read', scope: 'own' });
});

after(async () => {
  invalidateUser(user.id);
  await cleanupTenant(tenant.id);
  await sequelize.close();
});

test('can() allows an own resource and denies others, recording audit rows', async () => {
  await runWithTenant(tenant.id, async () => {
    const ok = await can(user.id, 'read', 'asset', { id: 'r1', ownerId: user.id });
    assert.equal(ok.allowed, true);
    assert.equal(ok.scope, 'own');

    const no = await can(user.id, 'read', 'asset', { id: 'r2', ownerId: 'someone-else' });
    assert.equal(no.allowed, false);

    const audits = await AuditLog.findAll({ where: { userId: user.id } });
    assert.equal(audits.length, 2);
    const byResource = Object.fromEntries(audits.map((a) => [a.resourceId, a.decision]));
    assert.equal(byResource.r1, 'allow');
    assert.equal(byResource.r2, 'deny');
  });
});

test('listScope returns the own-scope descriptor for list endpoints', async () => {
  const r = await runWithTenant(tenant.id, () => listScope(user.id, 'read', 'asset'));
  assert.equal(r.allowed, true);
  assert.equal(r.scope, 'own');
  assert.deepEqual(r.descriptor, { type: 'own', userId: user.id });
});
