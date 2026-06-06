import { models } from '../db/index.js';

const { Page, Role, RolePageAccess } = models;
const err = (message, status) => Object.assign(new Error(message), { status });

const PAGE_FIELDS = [
  'key', 'label', 'path', 'icon', 'order', 'parentId',
  'requiredPermissions', 'inheritFromParent', 'isMenuItem',
];

export const listPages = () => Page.findAll({ order: [['order', 'ASC']] });

export async function createPage(b) {
  if (!b.key || !b.label || !b.path) throw err('key, label and path are required', 400);
  return Page.create({
    key: b.key,
    label: b.label,
    path: b.path,
    icon: b.icon ?? null,
    order: b.order ?? 0,
    parentId: b.parentId ?? null,
    requiredPermissions: b.requiredPermissions ?? [],
    inheritFromParent: b.inheritFromParent ?? true,
    isMenuItem: b.isMenuItem ?? true,
  });
}

export async function updatePage(id, b) {
  const page = await Page.findByPk(id);
  if (!page) throw err('page not found', 404);
  for (const f of PAGE_FIELDS) {
    if (b[f] !== undefined) page[f] = b[f];
  }
  await page.save();
  return page;
}

export async function deletePage(id) {
  const page = await Page.findByPk(id);
  if (!page) throw err('page not found', 404);
  await page.destroy();
}

export async function listRolePageAccess(roleId) {
  if (!(await Role.findByPk(roleId))) throw err('role not found', 404);
  return RolePageAccess.findAll({ where: { roleId } });
}

export async function setRolePageAccess(roleId, pageId, enabled) {
  if (typeof enabled !== 'boolean') throw err('enabled (boolean) is required', 400);
  if (!(await Role.findByPk(roleId))) throw err('role not found', 404);
  if (!(await Page.findByPk(pageId))) throw err('page not found', 404);
  const [row] = await RolePageAccess.findOrCreate({ where: { roleId, pageId }, defaults: { enabled } });
  if (row.enabled !== enabled) {
    row.enabled = enabled;
    await row.save();
  }
  return row;
}
