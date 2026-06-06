import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize, models } from '../src/db/index.js';
import { runWithTenant } from '../src/db/tenant-context.js';

const { Tenant, User } = models;
let tA, tB;

before(async () => {
  tA = await Tenant.create({ slug: 'scope-a', name: 'A', type: 'hospital' });
  tB = await Tenant.create({ slug: 'scope-b', name: 'B', type: 'pm' });
  await User.create({ tenantId: tA.id, email: 'a@x.com', password: 'x' });
  await User.create({ tenantId: tB.id, email: 'b@x.com', password: 'x' });
});

after(async () => {
  await User.destroy({ where: { tenantId: [tA.id, tB.id] } });
  await Tenant.destroy({ where: { id: [tA.id, tB.id] } });
});

test('tenant-scoped findAll only returns the current tenant rows', async () => {
  const usersA = await runWithTenant(tA.id, () => User.findAll());
  assert.equal(usersA.length, 1);
  assert.equal(usersA[0].email, 'a@x.com');
});

test('tenant-scoped create stamps the current tenantId', async () => {
  const created = await runWithTenant(tA.id, () =>
    User.create({ email: 'a2@x.com', password: 'x' })
  );
  assert.equal(created.tenantId, tA.id);
  await User.destroy({ where: { id: created.id } });
});

test('outside any tenant context, no tenant filter is applied', async () => {
  const all = await User.findAll({ where: { email: ['a@x.com', 'b@x.com'] } });
  assert.equal(all.length, 2);
});
