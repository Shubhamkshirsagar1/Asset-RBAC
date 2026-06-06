import { models } from '../db/index.js';
import { invalidateAll } from './rbac.service.js';

const { Role, User, UserRole } = models;

const err = (message, status) => Object.assign(new Error(message), { status });

export const listRoles = () => Role.findAll();

export async function createRole({ name, parentRoleId = null }) {
  if (!name) throw err('name is required', 400);
  if (parentRoleId && !(await Role.findByPk(parentRoleId))) throw err('parent role not found', 404);
  const role = await Role.create({ name, parentRoleId });
  invalidateAll();
  return role;
}

export async function updateRole(id, { name, parentRoleId }) {
  const role = await Role.findByPk(id);
  if (!role) throw err('role not found', 404);
  if (name !== undefined) role.name = name;
  if (parentRoleId !== undefined) role.parentRoleId = parentRoleId;
  await role.save();
  invalidateAll();
  return role;
}

export async function deleteRole(id) {
  const role = await Role.findByPk(id);
  if (!role) throw err('role not found', 404);
  await role.destroy();
  invalidateAll();
}

export async function listUserRoles(userId) {
  return (await UserRole.findAll({ where: { userId } })).map((r) => r.roleId);
}

export async function assignRole(userId, roleId) {
  if (!(await User.findByPk(userId))) throw err('user not found', 404);
  if (!(await Role.findByPk(roleId))) throw err('role not found', 404);
  await UserRole.findOrCreate({ where: { userId, roleId } });
  invalidateAll();
}

export async function removeRole(userId, roleId) {
  await UserRole.destroy({ where: { userId, roleId } });
  invalidateAll();
}
