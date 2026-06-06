import { Op } from 'sequelize';

// Translates the engine's list scope descriptor into a Sequelize where fragment.
// ownerFields: columns that denote "mine" (e.g. ['assignedToUserId'] or ['requestedById','assignedToUserId'])
// orgField:    the column holding the org unit (e.g. 'orgUnitId'), or null if the resource has none.
// Tenant isolation is added on top automatically by the model hooks.
export function descriptorToWhere(descriptor, { ownerFields = [], orgField = null } = {}) {
  switch (descriptor.type) {
    case 'all':
      return {};
    case 'own':
      return ownerFields.length === 1
        ? { [ownerFields[0]]: descriptor.userId }
        : { [Op.or]: ownerFields.map((f) => ({ [f]: descriptor.userId })) };
    case 'orgUnit':
      if (!orgField) return { id: { [Op.in]: [] } }; // resource not org-scoped → match none (safe)
      return { [orgField]: { [Op.in]: descriptor.orgUnitIds } };
    default:
      return { id: { [Op.in]: [] } }; // 'none' → match none
  }
}
