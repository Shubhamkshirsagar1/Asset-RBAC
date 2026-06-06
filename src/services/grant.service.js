import { models } from '../db/index.js';
import { invalidateAll } from './rbac.service.js';

const { Role, User, Grant, UserGrant } = models;

const SCOPES = ['own', 'dept', 'facility', 'tenant', 'any'];
const EFFECTS = ['allow', 'deny'];
const err = (message, status) => Object.assign(new Error(message), { status });

function validateGrant(b) {
  if (!b.resourceTypeKey || !b.actionKey) throw err('resourceTypeKey and actionKey are required', 400);
  if (b.effect && !EFFECTS.includes(b.effect)) throw err('invalid effect', 400);
  if (b.scope && !SCOPES.includes(b.scope)) throw err('invalid scope', 400);
}

function buildGrantFields(b) {
  return {
    resourceTypeKey: b.resourceTypeKey,
    actionKey: b.actionKey,
    effect: b.effect ?? 'allow',
    scope: b.scope ?? 'any',
    condition: b.condition ?? null,
    expiresAt: b.expiresAt ?? null,
  };
}

export const listRoleGrants = (roleId) => Grant.findAll({ where: { roleId } });

export async function createRoleGrant(roleId, body) {
  if (!(await Role.findByPk(roleId))) throw err('role not found', 404);
  validateGrant(body);
  const grant = await Grant.create({ roleId, ...buildGrantFields(body) });
  invalidateAll();
  return grant;
}

export async function deleteRoleGrant(id) {
  // Grant has no tenantId; ensure it belongs to a role in this tenant.
  const grant = await Grant.findByPk(id);
  if (!grant || !(await Role.findByPk(grant.roleId))) throw err('grant not found', 404);
  await grant.destroy();
  invalidateAll();
}

export const listUserGrants = (userId) => UserGrant.findAll({ where: { userId } });

export async function createUserGrant(userId, body) {
  if (!(await User.findByPk(userId))) throw err('user not found', 404);
  validateGrant(body);
  const grant = await UserGrant.create({ userId, ...buildGrantFields(body) });
  invalidateAll();
  return grant;
}

export async function deleteUserGrant(id) {
  const grant = await UserGrant.findByPk(id);
  if (!grant || !(await User.findByPk(grant.userId))) throw err('user grant not found', 404);
  await grant.destroy();
  invalidateAll();
}
