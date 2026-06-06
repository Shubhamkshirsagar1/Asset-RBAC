import { evaluateCondition } from './conditions.js';
import { SCOPE_RANK, scopeSatisfiesResource, scopeFilterDescriptor } from './scope.js';

function matches(grant, action, resourceType) {
  return (
    (grant.resourceTypeKey === resourceType || grant.resourceTypeKey === '*') &&
    (grant.actionKey === action || grant.actionKey === '*')
  );
}

function notExpired(grant, now) {
  return grant.expiresAt == null || new Date(grant.expiresAt) > now;
}

// Full decision for a specific resource.
export function evaluateAccess({ grants, action, resourceType, user, resource, env }) {
  const now = env?.now ?? new Date(0);
  const ctx = { user, resource, env };
  const applicable = grants.filter((g) => matches(g, action, resourceType) && notExpired(g, now));

  const holding = applicable.filter(
    (g) => scopeSatisfiesResource(g.scope, user, resource) && evaluateCondition(g.condition, ctx)
  );

  const deny = holding.find((g) => g.effect === 'deny');
  if (deny) {
    return { allowed: false, effect: 'deny', scope: deny.scope, matchedGrant: deny, reason: 'explicit deny' };
  }

  const allows = holding.filter((g) => g.effect === 'allow');
  if (allows.length) {
    const best = allows.reduce((a, b) => (SCOPE_RANK[b.scope] > SCOPE_RANK[a.scope] ? b : a));
    return { allowed: true, effect: 'allow', scope: best.scope, matchedGrant: best, reason: 'allowed by grant' };
  }

  return { allowed: false, effect: null, scope: null, matchedGrant: null, reason: 'no matching grant' };
}

// Capability/list mode (no specific resource). Resource-level conditions are deferred to
// per-row checks; only unconditional denies block here.
export function resolveScope({ grants, action, resourceType, user, env }) {
  const now = env?.now ?? new Date(0);
  const applicable = grants.filter((g) => matches(g, action, resourceType) && notExpired(g, now));

  const hardDeny = applicable.find((g) => g.effect === 'deny' && !g.condition);
  if (hardDeny) {
    return { allowed: false, scope: null, descriptor: { type: 'none' }, matchedGrant: hardDeny, reason: 'explicit deny' };
  }

  const allows = applicable.filter((g) => g.effect === 'allow');
  if (!allows.length) {
    return { allowed: false, scope: null, descriptor: { type: 'none' }, matchedGrant: null, reason: 'no matching grant' };
  }
  const best = allows.reduce((a, b) => (SCOPE_RANK[b.scope] > SCOPE_RANK[a.scope] ? b : a));
  return {
    allowed: true,
    scope: best.scope,
    descriptor: scopeFilterDescriptor(best.scope, user),
    matchedGrant: best,
    reason: 'allowed by grant',
  };
}
