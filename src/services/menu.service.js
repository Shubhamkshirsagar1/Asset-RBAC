import { models } from '../db/index.js';
import { resolveScope } from '../engine/index.js';
import { buildSubject } from './subject.service.js';
import { collectGrants, getEffectiveRoleIds } from './rbac.service.js';

const { Page, RolePageAccess } = models;
const ROOT = '__root__';

// Builds the user's server-filtered, nested navigation menu.
export async function buildMenu(userId) {
  const subject = await buildSubject(userId);
  const grants = await collectGrants(userId);
  const roleIds = await getEffectiveRoleIds(userId);

  const pages = await Page.findAll(); // tenant-scoped
  const access = roleIds.length ? await RolePageAccess.findAll({ where: { roleId: roleIds } }) : [];
  const disabled = new Set(access.filter((a) => !a.enabled).map((a) => a.pageId));

  const hasPerm = (perm) => {
    const [resourceType, action] = perm.split(':');
    return resolveScope({ grants, action, resourceType, user: subject }).allowed;
  };
  const selfVisible = (p) =>
    p.isMenuItem && !disabled.has(p.id) && (p.requiredPermissions || []).every(hasPerm);

  const childrenOf = new Map();
  for (const p of pages) {
    const key = p.parentId || ROOT;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(p);
  }

  const sortFn = (a, b) => a.order - b.order || a.label.localeCompare(b.label);
  const build = (key) =>
    (childrenOf.get(key) || [])
      .slice()
      .sort(sortFn)
      .filter(selfVisible)
      .map((p) => ({ key: p.key, label: p.label, path: p.path, icon: p.icon, children: build(p.id) }));

  return build(ROOT);
}
