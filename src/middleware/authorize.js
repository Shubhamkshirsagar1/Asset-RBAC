import { can, listScope } from '../services/authorize.service.js';

// Capability gate for list endpoints: passes if the user may act on this resource type at all,
// and attaches req.scope = { scope, descriptor } so the handler can filter rows.
export function requirePermission(resourceType, action) {
  return async (req, res, next) => {
    try {
      const result = await listScope(req.user.userId, action, resourceType);
      if (!result.allowed) return res.status(403).json({ error: 'Forbidden' });
      req.scope = result;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Single-resource gate: loads the resource via `loader(req)` and enforces ownership/conditions.
export function requireOwnership(resourceType, action, loader) {
  return async (req, res, next) => {
    try {
      const resource = await loader(req);
      if (!resource) return res.status(404).json({ error: 'Not found' });
      const decision = await can(req.user.userId, action, resourceType, resource);
      if (!decision.allowed) return res.status(403).json({ error: 'Forbidden' });
      req.resource = resource;
      next();
    } catch (err) {
      next(err);
    }
  };
}
