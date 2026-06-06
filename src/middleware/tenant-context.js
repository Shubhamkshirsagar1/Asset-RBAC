import { runWithTenant } from '../db/tenant-context.js';

// Runs the rest of the request inside the authenticated user's tenant scope,
// so every tenant-scoped model query is automatically filtered by the hooks.
export function tenantContext(req, res, next) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(401).json({ error: 'No tenant in token' });
  runWithTenant(tenantId, () => next());
}
