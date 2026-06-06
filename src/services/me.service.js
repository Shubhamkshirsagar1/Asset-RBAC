import { models } from '../db/index.js';
import { collectGrants } from './rbac.service.js';

const { User, UserRole } = models;

export async function getMe(userId) {
  const user = await User.findByPk(userId); // tenant-scoped
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  const roleIds = (await UserRole.findAll({ where: { userId } })).map((r) => r.roleId);
  return {
    id: user.id,
    email: user.email,
    tenantId: user.tenantId,
    attributes: user.attributes || {},
    roleIds,
  };
}

export async function getPermissions(userId) {
  return collectGrants(userId);
}
