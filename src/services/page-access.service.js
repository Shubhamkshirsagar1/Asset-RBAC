import { store } from '../db/store.js';
import { can } from './authorize.service.js';

// Which pages are disabled for this user?
// Rule: a page is ENABLED if ANY of the user's roles enables it. A missing
// row means enabled by default. Only when every relevant role row says
// enabled:false (and none says true) is the page disabled.
export function getDisabledPageIds(userId) {
  const roleIds = store.getUserRoleIds(userId);
  const rows = store.getRolePageAccessForRoles(roleIds);

  const byPage = new Map(); // pageId -> effective enabled
  for (const r of rows) {
    const cur = byPage.get(r.pageId);
    byPage.set(r.pageId, cur === true ? true : r.enabled);
  }

  const disabled = new Set();
  for (const [pageId, enabled] of byPage) if (!enabled) disabled.add(pageId);
  return disabled;
}

// Core check for one page node, honoring ancestor inheritance.
function canAccessNode(user, page, disabled, pageById) {
  if (disabled.has(page.id)) return false;

  for (const perm of page.requiredPermissions) {
    if (!can(user, perm)) return false;
  }

  if (page.inheritFromParent && page.parentId) {
    const parent = pageById.get(page.parentId);
    if (parent && !canAccessNode(user, parent, disabled, pageById)) return false;
  }
  return true;
}

export function canAccessPage(user, pageKey) {
  const pages = store.getAllPages();
  const pageById = new Map(pages.map((p) => [p.id, p]));
  const page = pages.find((p) => p.key === pageKey);
  if (!page) return false;

  const disabled = getDisabledPageIds(user.id);
  return canAccessNode(user, page, disabled, pageById);
}
