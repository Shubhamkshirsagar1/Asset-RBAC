import { sequelize, models } from './db/index.js';
import { hashPassword } from './lib/password.js';

const {
  Tenant, OrgUnit, Role, User, UserRole, UserOrgUnit, Grant, Page, RolePageAccess,
  ResourceType, Action, Asset, WorkOrder, Project, Task,
} = models;

const ACTIONS = ['read', 'create', 'update', 'delete', 'approve', 'assign', 'dispose', 'complete', 'manage'];

const grant = (roleId, resourceTypeKey, actionKey, scope = 'any', condition = null) =>
  Grant.create({ roleId, resourceTypeKey, actionKey, scope, condition, effect: 'allow' });

async function seedActions() {
  for (const key of ACTIONS) await Action.findOrCreate({ where: { key }, defaults: { label: key } });
}

async function reset(slug) {
  await Tenant.destroy({ where: { slug } }); // FK cascade clears all children
}

async function makeUser(tenantId, email, password, roleId, orgUnitId) {
  const user = await User.create({ tenantId, email, password });
  await UserRole.create({ userId: user.id, roleId });
  if (orgUnitId) await UserOrgUnit.create({ userId: user.id, orgUnitId });
  return user;
}

async function seedHospital(password) {
  await reset('mercy');
  const t = await Tenant.create({ slug: 'mercy', name: 'Mercy General', type: 'hospital' });

  for (const [key, label] of [['asset', 'Asset'], ['work_order', 'Work Order']]) {
    await ResourceType.create({ tenantId: t.id, key, label });
  }

  const facility = await OrgUnit.create({ tenantId: t.id, type: 'facility', name: 'Mercy General' });
  const cardiology = await OrgUnit.create({ tenantId: t.id, type: 'dept', name: 'Cardiology', parentId: facility.id });
  const wardA = await OrgUnit.create({ tenantId: t.id, type: 'ward', name: 'Ward A', parentId: cardiology.id });
  const radiology = await OrgUnit.create({ tenantId: t.id, type: 'dept', name: 'Radiology', parentId: facility.id });

  const technician = await Role.create({ tenantId: t.id, name: 'technician' });
  const manager = await Role.create({ tenantId: t.id, name: 'manager', parentRoleId: technician.id });
  const admin = await Role.create({ tenantId: t.id, name: 'admin', parentRoleId: manager.id });
  const auditor = await Role.create({ tenantId: t.id, name: 'auditor' });
  const superadmin = await Role.create({ tenantId: t.id, name: 'superadmin' });

  await grant(technician.id, 'asset', 'read', 'dept');
  await grant(technician.id, 'asset', 'update', 'own');
  await grant(technician.id, 'work_order', 'create', 'any');
  await grant(technician.id, 'work_order', 'read', 'own');
  await grant(manager.id, 'asset', 'read', 'facility');
  await grant(manager.id, 'work_order', 'assign', 'any');
  await grant(manager.id, 'work_order', 'approve', 'any', {
    'resource.requestedById': { ne: '$user.id' },
    'resource.cost': { lte: 5000 },
  });
  await grant(admin.id, 'rbac', 'manage', 'any');
  await grant(admin.id, 'asset', 'read', 'any');
  await grant(auditor.id, 'asset', 'read', 'any');
  await grant(auditor.id, 'work_order', 'read', 'any');
  await grant(superadmin.id, '*', '*', 'any');

  const dashboard = await Page.create({ tenantId: t.id, key: 'dashboard', label: 'Dashboard', path: '/', order: 0 });
  const assetsPage = await Page.create({ tenantId: t.id, key: 'assets', label: 'Assets', path: '/assets', order: 1, requiredPermissions: ['asset:read'] });
  const woPage = await Page.create({ tenantId: t.id, key: 'work-orders', label: 'Work Orders', path: '/work-orders', order: 2, requiredPermissions: ['work_order:read'] });
  const approvalsPage = await Page.create({ tenantId: t.id, key: 'approvals', label: 'Approvals', path: '/work-orders/approvals', order: 3, requiredPermissions: ['work_order:approve'] });
  const adminPage = await Page.create({ tenantId: t.id, key: 'admin', label: 'Admin', path: '/admin', order: 9, requiredPermissions: ['rbac:manage'] });
  void dashboard; void assetsPage; void woPage; void adminPage;
  // Demo: manager HOLDS work_order:approve, but the Approvals page is disabled for managers.
  await RolePageAccess.create({ roleId: manager.id, pageId: approvalsPage.id, enabled: false });

  await makeUser(t.id, 'root@mercy.test', password, superadmin.id);
  await makeUser(t.id, 'alice@mercy.test', password, admin.id, cardiology.id);
  const bob = await makeUser(t.id, 'bob@mercy.test', password, manager.id, cardiology.id);
  const carol = await makeUser(t.id, 'carol@mercy.test', password, technician.id, cardiology.id);
  await makeUser(t.id, 'dan@mercy.test', password, auditor.id);

  const mri = await Asset.create({ tenantId: t.id, name: 'MRI Scanner', orgUnitId: radiology.id, value: 500000 });
  const ecg = await Asset.create({ tenantId: t.id, name: 'ECG Monitor', orgUnitId: cardiology.id, assignedToUserId: carol.id, value: 8000 });
  await Asset.create({ tenantId: t.id, name: 'Infusion Pump', orgUnitId: cardiology.id, assignedToUserId: bob.id, value: 3000 });
  await Asset.create({ tenantId: t.id, name: 'Ward Bed', orgUnitId: wardA.id, value: 2000 });

  await WorkOrder.create({ tenantId: t.id, assetId: ecg.id, requestedById: carol.id, cost: 1200, status: 'requested' });
  await WorkOrder.create({ tenantId: t.id, assetId: mri.id, requestedById: bob.id, cost: 9000, status: 'requested' });
}

async function seedPm(password) {
  await reset('acme');
  const t = await Tenant.create({ slug: 'acme', name: 'Acme Workspace', type: 'pm' });

  for (const [key, label] of [['project', 'Project'], ['task', 'Task']]) {
    await ResourceType.create({ tenantId: t.id, key, label });
  }

  const workspace = await OrgUnit.create({ tenantId: t.id, type: 'workspace', name: 'Acme Workspace' });

  const member = await Role.create({ tenantId: t.id, name: 'member' });
  const lead = await Role.create({ tenantId: t.id, name: 'lead', parentRoleId: member.id });
  const pmadmin = await Role.create({ tenantId: t.id, name: 'pmadmin', parentRoleId: lead.id });

  await grant(member.id, 'project', 'read', 'own');
  await grant(member.id, 'project', 'create', 'any');
  await grant(member.id, 'task', 'read', 'own');
  await grant(member.id, 'task', 'create', 'any');
  await grant(member.id, 'task', 'update', 'own', { 'resource.status': { ne: 'done' } });
  await grant(member.id, 'task', 'complete', 'own');
  await grant(lead.id, 'project', 'read', 'any');
  await grant(lead.id, 'task', 'read', 'any');
  await grant(lead.id, 'task', 'update', 'any');
  await grant(pmadmin.id, 'rbac', 'manage', 'any');

  await Page.create({ tenantId: t.id, key: 'dashboard', label: 'Dashboard', path: '/', order: 0 });
  await Page.create({ tenantId: t.id, key: 'projects', label: 'Projects', path: '/projects', order: 1, requiredPermissions: ['project:read'] });
  await Page.create({ tenantId: t.id, key: 'tasks', label: 'Tasks', path: '/tasks', order: 2, requiredPermissions: ['task:read'] });
  await Page.create({ tenantId: t.id, key: 'admin', label: 'Admin', path: '/admin', order: 9, requiredPermissions: ['rbac:manage'] });

  await makeUser(t.id, 'dave@acme.test', password, pmadmin.id, workspace.id);
  const erin = await makeUser(t.id, 'erin@acme.test', password, lead.id, workspace.id);
  const frank = await makeUser(t.id, 'frank@acme.test', password, member.id, workspace.id);

  const apollo = await Project.create({ tenantId: t.id, name: 'Apollo', orgUnitId: workspace.id, ownerId: frank.id });
  await Project.create({ tenantId: t.id, name: 'Zephyr', orgUnitId: workspace.id, ownerId: erin.id });
  await Task.create({ tenantId: t.id, projectId: apollo.id, title: 'Design API', assigneeId: frank.id, status: 'todo' });
  await Task.create({ tenantId: t.id, projectId: apollo.id, title: 'Write tests', assigneeId: frank.id, status: 'done' });
}

async function main() {
  await sequelize.authenticate();
  const password = await hashPassword('password');
  await seedActions();
  await seedHospital(password);
  await seedPm(password);
  console.log(`Seed complete. Password for all demo users is "password".

  Hospital tenant (slug "mercy"):
    root@mercy.test   superadmin (*:*:*)
    alice@mercy.test  admin (rbac:manage + reads)
    bob@mercy.test    manager (approve under 5k, requester != approver; Approvals PAGE hidden)
    carol@mercy.test  technician (dept assets, own updates, create work orders)
    dan@mercy.test    auditor (read-only)

  PM tenant (slug "acme"):
    dave@acme.test    pmadmin (rbac:manage)
    erin@acme.test    lead (read any project/task)
    frank@acme.test   member (own projects/tasks; cannot edit a done task)`);
}

main()
  .then(() => sequelize.close())
  .catch(async (e) => {
    console.error(e);
    await sequelize.close();
    process.exit(1);
  });
