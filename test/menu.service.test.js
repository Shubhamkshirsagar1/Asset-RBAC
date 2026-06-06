import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize } from '../src/db/index.js';
import { runWithTenant } from '../src/db/tenant-context.js';
import { buildMenu } from '../src/services/menu.service.js';
import { setRolePageAccess } from '../src/services/page.service.js';
import { invalidateUser } from '../src/services/rbac.service.js';
import {
  makeTenant, makeRole, makeUser, assignRole, makeGrant, makePage, cleanupTenant,
} from './factories.js';

let tenant, userRole, managerRole, manager;
let dashboard, invoices, approvals, adminOnly;

before(async () => {
  tenant = await makeTenant();
  userRole = await makeRole(tenant.id, { name: 'user' });
  managerRole = await makeRole(tenant.id, { name: 'manager', parentRoleId: userRole.id });
  manager = await makeUser(tenant.id);
  await assignRole(manager.id, managerRole.id);
  await makeGrant(userRole.id, { resourceTypeKey: 'invoices', actionKey: 'read', scope: 'own' });
  await makeGrant(managerRole.id, { resourceTypeKey: 'invoices', actionKey: 'approve', scope: 'any' });

  dashboard = await makePage(tenant.id, { key: 'dashboard', label: 'Dashboard', path: '/', order: 0 });
  invoices = await makePage(tenant.id, { key: 'invoices', label: 'Invoices', path: '/invoices', order: 1, requiredPermissions: ['invoices:read'] });
  approvals = await makePage(tenant.id, { key: 'approvals', label: 'Approvals', path: '/invoices/approvals', order: 0, parentId: invoices.id, requiredPermissions: ['invoices:approve'] });
  adminOnly = await makePage(tenant.id, { key: 'admin', label: 'Admin', path: '/admin', order: 2, requiredPermissions: ['rbac:manage'] });
});

after(async () => {
  invalidateUser(manager.id);
  await cleanupTenant(tenant.id);
  await sequelize.close();
});

test('menu shows permitted pages (nested) and hides those lacking permission', async () => {
  const menu = await runWithTenant(tenant.id, () => buildMenu(manager.id));
  const keys = menu.map((m) => m.key);
  assert.deepEqual(keys, ['dashboard', 'invoices']); // admin-only excluded (no rbac:manage)

  const invoicesNode = menu.find((m) => m.key === 'invoices');
  assert.deepEqual(invoicesNode.children.map((c) => c.key), ['approvals']); // nested under invoices
});

test('a per-role page toggle hides a page the user is otherwise permitted to see, then reveals it', async () => {
  // Manager HOLDS invoices:approve, but we disable the approvals page for the manager role.
  await runWithTenant(tenant.id, () => setRolePageAccess(managerRole.id, approvals.id, false));

  let menu = await runWithTenant(tenant.id, () => buildMenu(manager.id));
  let invoicesNode = menu.find((m) => m.key === 'invoices');
  assert.deepEqual(invoicesNode.children.map((c) => c.key), [], 'approvals hidden by toggle despite permission');

  // Flip it back on — reappears immediately.
  await runWithTenant(tenant.id, () => setRolePageAccess(managerRole.id, approvals.id, true));
  menu = await runWithTenant(tenant.id, () => buildMenu(manager.id));
  invoicesNode = menu.find((m) => m.key === 'invoices');
  assert.deepEqual(invoicesNode.children.map((c) => c.key), ['approvals']);
});
