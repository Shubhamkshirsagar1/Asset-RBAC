export const SCOPE_RANK = { own: 1, dept: 2, facility: 3, tenant: 4, any: 5 };

// Conventional fields that denote "this row is mine" across domains.
const OWN_FIELDS = ['ownerId', 'assignedToUserId', 'assigneeId', 'requestedById'];

// For a single known resource: does this scope grant reach in?
// (Tenant isolation itself is enforced by the DB layer, so tenant/any always pass here.)
export function scopeSatisfiesResource(scope, user, resource) {
  switch (scope) {
    case 'any':
    case 'tenant':
      return true;
    case 'own':
      return OWN_FIELDS.some((f) => resource?.[f] != null && resource[f] === user.id);
    case 'dept':
      return resource?.orgUnitId != null && (user.departmentIds || []).includes(resource.orgUnitId);
    case 'facility':
      return resource?.orgUnitId != null && (user.facilityIds || []).includes(resource.orgUnitId);
    default:
      return false;
  }
}

// For list endpoints: a descriptor the service translates into a Sequelize where clause.
export function scopeFilterDescriptor(scope, user) {
  switch (scope) {
    case 'any':
    case 'tenant':
      return { type: 'all' };
    case 'own':
      return { type: 'own', userId: user.id };
    case 'dept':
      return { type: 'orgUnit', orgUnitIds: user.departmentIds || [] };
    case 'facility':
      return { type: 'orgUnit', orgUnitIds: user.facilityIds || [] };
    default:
      return { type: 'none' };
  }
}
