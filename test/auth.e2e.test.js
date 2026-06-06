import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize, models } from '../src/db/index.js';
import { hashPassword } from '../src/lib/password.js';
import { startTestServer } from './helpers.js';

const { Tenant, User } = models;
let server, hospital, pm;

before(async () => {
  [hospital] = await Tenant.findOrCreate({
    where: { slug: 'e2e-hosp' }, defaults: { name: 'E2E Hosp', type: 'hospital' },
  });
  [pm] = await Tenant.findOrCreate({
    where: { slug: 'e2e-pm' }, defaults: { name: 'E2E PM', type: 'pm' },
  });
  const password = await hashPassword('password');
  await User.findOrCreate({
    where: { tenantId: hospital.id, email: 'h@x.com' }, defaults: { password },
  });
  server = await startTestServer();
});

after(async () => {
  await server.close();
  await User.destroy({ where: { tenantId: [hospital.id, pm.id] } });
  await Tenant.destroy({ where: { id: [hospital.id, pm.id] } });
  await sequelize.close();
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
