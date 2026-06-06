import { models } from '../db/index.js';

const { UserRole, Role, Grant, UserGrant } = models;

// Per-user cache of engine-shaped grants. Busted on admin writes (Phase 3b).
const grantCache = new Map();

export function invalidateUser(userId) {
  grantCache.delete(userId);
}
export function invalidateAll() {
  grantCache.clear();
}

// User's roles plus all ancestor roles via parentRoleId (hierarchy/inheritance).
export async function getEffectiveRoleIds(userId) {
  const direct = (await UserRole.findAll({ where: { userId } })).map((r) => r.roleId);
  if (!direct.length) return [];

  const roles = await Role.findAll(); // tenant-scoped
  const byId = new Map(roles.map((r) => [r.id, r]));
  const effective = new Set();
  for (const id of direct) {
    let cur = byId.get(id);
    while (cur && !effective.has(cur.id)) {
      effective.add(cur.id);
      cur = cur.parentRoleId ? byId.get(cur.parentRoleId) : null;
    }
  }
  return [...effective];
}

const toEngineGrant = (g) => ({
  id: g.id,
  effect: g.effect,
  resourceTypeKey: g.resourceTypeKey,
  actionKey: g.actionKey,
  scope: g.scope,
  condition: g.condition,
  expiresAt: g.expiresAt,
});

// All grants applicable to a user: from effective roles + direct user grants.
export async function collectGrants(userId) {
  if (grantCache.has(userId)) return grantCache.get(userId);

  const roleIds = await getEffectiveRoleIds(userId);
  const roleGrants = roleIds.length ? await Grant.findAll({ where: { roleId: roleIds } }) : [];
  const userGrants = await UserGrant.findAll({ where: { userId } });
  const grants = [...roleGrants, ...userGrants].map(toEngineGrant);

  grantCache.set(userId, grants);
  return grants;
}
