import { getEffectivePermissions } from './permission.service.js';
import { matchesOne } from '../lib/permission-match.js';

// Scope condition resolvers. RBAC tells us WHICH permission matched; these
// resolvers add the ABAC layer that decides whether the *specific* resource
// is in scope. Extend with department/region/etc. via registerScope().
const scopeCheckers = {
  any: () => true,
  // When no resource is supplied this is a capability gate ("may the user act
  // on their OWN records at all?") and passes. When a resource IS supplied
  // (via requireOwnership) it enforces actual ownership. This split is why
  // list endpoints use requirePermission + in-handler filtering, while
  // single-record mutations use requireOwnership.
  own: (user, resource) =>
    resource === undefined || resource === null
      ? true
      : resource.ownerId === user.id,
};

export function registerScope(name, fn) {
  scopeCheckers[name] = fn;
}

// can(user, "invoices:update:own", { resource: theInvoice })
export function can(user, required, context = {}) {
  const granted = getEffectivePermissions(user.id);

  for (const g of granted) {
    if (!matchesOne(g, required)) continue;

    const gScope = g.split(':')[2] || 'any';
    const checker = scopeCheckers[gScope] || scopeCheckers.any;
    if (checker(user, context.resource)) return true;
  }
  return false;
}

// Convenience: the full list, useful for shipping to the frontend.
export function listPermissions(user) {
  return [...getEffectivePermissions(user.id)].sort();
}
