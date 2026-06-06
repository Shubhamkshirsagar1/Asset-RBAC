import { models } from '../db/index.js';

const { OrgUnit, UserOrgUnit } = models;

function subtree(rootId, childrenOf) {
  const out = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    out.push(id);
    for (const c of childrenOf.get(id) || []) stack.push(c);
  }
  return out;
}

// Resolves a user's org-scope id sets from the OrgUnit tree:
//   departmentIds = subtree under each unit the user directly belongs to
//   facilityIds   = subtree under the top-most ancestor (facility) of those units
export async function resolveScopeIds(userId) {
  const memberships = await UserOrgUnit.findAll({ where: { userId } });
  const directIds = memberships.map((m) => m.orgUnitId);
  if (!directIds.length) return { departmentIds: [], facilityIds: [] };

  const units = await OrgUnit.findAll(); // tenant-scoped
  const byId = new Map(units.map((u) => [u.id, u]));
  const childrenOf = new Map();
  for (const u of units) {
    if (!u.parentId) continue;
    if (!childrenOf.has(u.parentId)) childrenOf.set(u.parentId, []);
    childrenOf.get(u.parentId).push(u.id);
  }

  const departmentIds = [...new Set(directIds.flatMap((id) => subtree(id, childrenOf)))];

  const facilityRoots = new Set();
  for (const id of directIds) {
    let cur = byId.get(id);
    while (cur && cur.parentId && byId.get(cur.parentId)) cur = byId.get(cur.parentId);
    if (cur) facilityRoots.add(cur.id);
  }
  const facilityIds = [...new Set([...facilityRoots].flatMap((id) => subtree(id, childrenOf)))];

  return { departmentIds, facilityIds };
}
