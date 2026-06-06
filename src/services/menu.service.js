import { store } from '../db/store.js';
import { can } from './authorize.service.js';
import { getDisabledPageIds } from './page-access.service.js';

// Build the nested nav tree for a user, pruning any page they can't reach
// (no permission, or disabled for their role) and dropping empty branches.
export function buildMenu(user) {
  const pages = store.getAllPages();
  const disabled = getDisabledPageIds(user.id);

  const accessible = (page) => {
    if (disabled.has(page.id)) return false;
    return page.requiredPermissions.every((perm) => can(user, perm));
  };

  const build = (parentId) => {
    const nodes = [];
    const siblings = pages
      .filter((p) => p.parentId === parentId && p.isMenuItem)
      .sort((a, b) => a.order - b.order);

    for (const page of siblings) {
      if (!accessible(page)) continue;
      const children = build(page.id);
      nodes.push({
        key: page.key,
        label: page.label,
        path: page.path,
        icon: page.icon,
        ...(children.length ? { children } : {}),
      });
    }
    return nodes;
  };

  return build(null);
}
