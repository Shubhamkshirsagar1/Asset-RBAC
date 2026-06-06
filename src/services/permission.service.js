import { store } from '../db/store.js';

// Cache of effective (flattened) permissions per user. In a multi-instance
// deployment replace this Map with Redis so invalidation is shared.
const cache = new Map(); // userId -> { perms: Set<string>, expires: number }
const TTL = 60_000;

// Walk a role and all its ancestors, collecting permission strings.
// `seen` guards against accidental cycles in the role hierarchy.
function collectRolePermissions(roleId, seen = new Set()) {
  if (seen.has(roleId)) return [];
  seen.add(roleId);

  const role = store.findRoleById(roleId);
  if (!role) return [];

  const own = store.getRolePermissionStrings(roleId);
  const inherited = role.parentRoleId
    ? collectRolePermissions(role.parentRoleId, seen)
    : [];

  return [...own, ...inherited];
}

export function getEffectivePermissions(userId) {
  const hit = cache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.perms;

  const roleIds = store.getUserRoleIds(userId);
  const all = [];
  for (const roleId of roleIds) all.push(...collectRolePermissions(roleId));

  const perms = new Set(all);
  cache.set(userId, { perms, expires: Date.now() + TTL });
  return perms;
}

export function invalidateUser(userId) {
  cache.delete(userId);
}

export function invalidateAll() {
  cache.clear();
}
