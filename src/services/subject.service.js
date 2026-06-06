import { models } from '../db/index.js';
import { resolveScopeIds } from './org.service.js';

const { User } = models;

// Builds the pure-engine subject for a user: identity + resolved org-scope id sets + attributes.
export async function buildSubject(userId) {
  const user = await User.findByPk(userId); // tenant-scoped: where gets tenantId injected
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  const { departmentIds, facilityIds } = await resolveScopeIds(userId);
  return {
    id: user.id,
    tenantId: user.tenantId,
    departmentIds,
    facilityIds,
    attributes: user.attributes || {},
  };
}
