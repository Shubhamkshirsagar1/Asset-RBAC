import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize, models } from '../src/db/index.js';
import { hashPassword } from '../src/lib/password.js';
import { invalidateAll } from '../src/services/rbac.service.js';
import { startTestServer } from './helpers.js';
import {
  makeTenant, makeRole, assignRole, makeGrant, makeProject, makeTask,
} from './factories.js';

const { Tenant, User } = models;
let server, tenant, dev, lead, pOwn, pOther, tOwn, tDone;

before(async () => {
  tenant = await makeTenant('pm');

  const memberRole = await makeRole(tenant.id, { name: 'member' });
  await makeGrant(memberRole.id, { resourceTypeKey: 'project', actionKey: 'read', scope: 'own' });
  await makeGrant(memberRole.id, { resourceTypeKey: 'project', actionKey: 'create', scope: 'any' });
  await makeGrant(memberRole.id, { resourceTypeKey: 'task', actionKey: 'read', scope: 'own' });
  await makeGrant(memberRole.id, { resourceTypeKey: 'task', actionKey: 'create', scope: 'any' });
  await makeGrant(memberRole.id, { resourceTypeKey: 'task', actionKey: 'update', scope: 'own',
    condition: { 'resource.status': { ne: 'done' } } });
  await makeGrant(memberRole.id, { resourceTypeKey: 'task', actionKey: 'complete', scope: 'own' });

  const leadRole = await makeRole(tenant.id, { name: 'lead' });
  await makeGrant(leadRole.id, { resourceTypeKey: 'project', actionKey: 'read', scope: 'any' });

  const pw = await hashPassword('password');
  dev = await User.create({ tenantId: tenant.id, email: 'dev@x.com', password: pw });
  lead = await User.create({ tenantId: tenant.id, email: 'lead@x.com', password: pw });
  await assignRole(dev.id, memberRole.id);
  await assignRole(lead.id, leadRole.id);

  pOwn = await makeProject(tenant.id, { name: 'POwn', ownerId: dev.id });
  pOther = await makeProject(tenant.id, { name: 'POther', ownerId: lead.id });
  tOwn = await makeTask(tenant.id, { projectId: pOwn.id, title: 'TOwn', assigneeId: dev.id, status: 'todo' });
  tDone = await makeTask(tenant.id, { projectId: pOwn.id, title: 'TDone', assigneeId: dev.id, status: 'done' });

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

test('own-scope project list (member) vs any-scope (lead) — same engine, new domain', async () => {
  const devNames = (await (await call(await login('dev@x.com'), 'GET', '/projects')).json()).projects.map((p) => p.name);
  assert.deepEqual(devNames, ['POwn']);

  const leadNames = (await (await call(await login('lead@x.com'), 'GET', '/projects')).json()).projects.map((p) => p.name).sort();
  assert.deepEqual(leadNames, ['POther', 'POwn']);
});

test('status condition: can edit a todo task but not a done task', async () => {
  const token = await login('dev@x.com');
  assert.equal((await call(token, 'PATCH', `/tasks/${tOwn.id}`, { title: 'renamed' })).status, 200);
  assert.equal((await call(token, 'PATCH', `/tasks/${tDone.id}`, { title: 'nope' })).status, 403);
});

test('member completes own task; cannot read another owner project', async () => {
  const token = await login('dev@x.com');
  const complete = await call(token, 'POST', `/tasks/${tOwn.id}/complete`);
  assert.equal(complete.status, 200);
  assert.equal((await complete.json()).status, 'done');

  assert.equal((await call(token, 'GET', `/projects/${pOther.id}`)).status, 403);
});
