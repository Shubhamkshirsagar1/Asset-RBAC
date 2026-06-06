import { can } from '../services/authorize.service.js';

// Static guard. requirePermission('a:b:c', 'd:e:f') => ALL must pass.
export function requirePermission(...required) {
  return (req, res, next) => {
    for (const perm of required) {
      if (!can(req.user, perm)) {
        return res.status(403).json({ error: 'forbidden', missing: perm });
      }
    }
    next();
  };
}

// Ownership-aware guard. Loads the resource, then checks scope against it.
// `loader(req)` returns the resource (must carry an ownerId for "own" scope).
// A user with the :any grant passes regardless of owner; an :own-only user
// passes only on their own records.
export function requireOwnership(permission, loader) {
  return async (req, res, next) => {
    try {
      const resource = await loader(req);
      if (!resource) return res.status(404).json({ error: 'not found' });

      if (!can(req.user, permission, { resource })) {
        return res.status(403).json({ error: 'forbidden' });
      }
      req.resource = resource; // pass to handler so it need not re-fetch
      next();
    } catch (err) {
      next(err);
    }
  };
}
