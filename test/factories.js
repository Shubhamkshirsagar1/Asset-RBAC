import { models } from '../src/db/index.js';

const {
  Tenant, OrgUnit, Role, User, UserRole, UserOrgUnit, Grant, UserGrant,
} = models;

let counter = 0;
const uid = (p) => `${p}-${Date.now()}-${++counter}`;

export async function makeTenant(type = 'hospital') {
  return Tenant.create({ slug: uid('t'), name: 'Test Tenant', type });
}

export async function makeOrgUnit(tenantId, { type = 'dept', name = 'Unit', parentId = null } = {}) {
  return OrgUnit.create({ tenantId, type, name, parentId });
}

export async function makeRole(tenantId, { name, parentRoleId = null } = {}) {
  return Role.create({ tenantId, name: name ?? uid('role'), parentRoleId });
}

export async function makeUser(tenantId, { email, password = 'x', attributes = {} } = {}) {
  return User.create({ tenantId, email: email ?? `${uid('u')}@x.com`, password, attributes });
}

export const assignRole = (userId, roleId) => UserRole.create({ userId, roleId });
export const assignOrg = (userId, orgUnitId) => UserOrgUnit.create({ userId, orgUnitId });

export function makeGrant(roleId, o) {
  return Grant.create({
    roleId,
    resourceTypeKey: o.resourceTypeKey,
    actionKey: o.actionKey,
    effect: o.effect ?? 'allow',
    scope: o.scope ?? 'any',
    condition: o.condition ?? null,
    expiresAt: o.expiresAt ?? null,
  });
}

export function makeUserGrant(userId, o) {
  return UserGrant.create({
    userId,
    resourceTypeKey: o.resourceTypeKey,
    actionKey: o.actionKey,
    effect: o.effect ?? 'allow',
    scope: o.scope ?? 'any',
    condition: o.condition ?? null,
    expiresAt: o.expiresAt ?? null,
  });
}

// FK constraints are ON DELETE CASCADE from Tenant down, so removing the tenant
// removes users, roles, org units, grants, audit logs, etc.
export const cleanupTenant = (tenantId) => Tenant.destroy({ where: { id: tenantId } });
