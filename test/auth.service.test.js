import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize, models } from '../src/db/index.js';
import { hashPassword } from '../src/lib/password.js';
import { login, AuthError } from '../src/services/auth.service.js';

const { Tenant, User } = models;
let tenant;

before(async () => {
  tenant = await Tenant.create({ slug: 'svc-auth', name: 'Svc', type: 'hospital' });
  await User.create({ tenantId: tenant.id, email: 'svc@x.com', password: await hashPassword('password') });
});

after(async () => {
  await User.destroy({ where: { tenantId: tenant.id } });
  await Tenant.destroy({ where: { id: tenant.id } });
  await sequelize.close();
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
