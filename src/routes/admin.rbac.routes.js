import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { store, db } from '../db/store.js';
import { invalidateAll } from '../services/permission.service.js';

const router = Router();
router.use(authenticate);
router.use(requirePermission('rbac:manage:any'));

// Inspect the full page tree and current per-role toggles.
router.get('/pages', (_req, res) => {
  res.json({ pages: db.pages, rolePageAccess: db.rolePageAccess });
});

// Dynamically enable/disable a page for a role. This is the runtime switch.
router.put('/roles/:roleId/pages/:pageId', (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'body must include boolean "enabled"' });
  }
  if (!store.findRoleById(req.params.roleId)) {
    return res.status(404).json({ error: 'role not found' });
  }
  store.upsertRolePageAccess(req.params.roleId, req.params.pageId, enabled);
  invalidateAll();
  res.json({ ok: true, roleId: req.params.roleId, pageId: req.params.pageId, enabled });
});

// Grant a permission to a role (creates the permission if new).
router.post('/roles/:roleId/permissions', (req, res) => {
  const { resource, action, scope = 'any' } = req.body || {};
  if (!resource || !action) {
    return res.status(400).json({ error: 'resource and action are required' });
  }
  if (!store.findRoleById(req.params.roleId)) {
    return res.status(404).json({ error: 'role not found' });
  }
  const perm = store.upsertPermission(resource, action, scope);
  store.grantPermissionToRole(req.params.roleId, perm.id);
  invalidateAll();
  res.json({ ok: true, granted: `${resource}:${action}:${scope}` });
});

// Revoke a permission from a role.
router.delete('/roles/:roleId/permissions', (req, res) => {
  const { resource, action, scope = 'any' } = req.body || {};
  const perm = db.permissions.find(
    (p) => p.resource === resource && p.action === action && p.scope === scope
  );
  if (perm) {
    store.revokePermissionFromRole(req.params.roleId, perm.id);
    invalidateAll();
  }
  res.json({ ok: true });
});

export default router;
