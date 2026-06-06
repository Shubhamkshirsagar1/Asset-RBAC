import * as roleSvc from '../services/role.service.js';
import * as grantSvc from '../services/grant.service.js';
import * as catalogSvc from '../services/catalog.service.js';
import { explain } from '../services/authorize.service.js';

// Wraps an async handler so thrown errors flow to the central error handler.
const h = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

// Roles
export const listRoles = h(async (req, res) => res.json({ roles: await roleSvc.listRoles() }));
export const createRole = h(async (req, res) => res.status(201).json(await roleSvc.createRole(req.body ?? {})));
export const updateRole = h(async (req, res) => res.json(await roleSvc.updateRole(req.params.id, req.body ?? {})));
export const deleteRole = h(async (req, res) => { await roleSvc.deleteRole(req.params.id); res.status(204).end(); });

// User-role assignment
export const listUserRoles = h(async (req, res) => res.json({ roleIds: await roleSvc.listUserRoles(req.params.userId) }));
export const assignRole = h(async (req, res) => { await roleSvc.assignRole(req.params.userId, (req.body ?? {}).roleId); res.status(204).end(); });
export const removeRole = h(async (req, res) => { await roleSvc.removeRole(req.params.userId, req.params.roleId); res.status(204).end(); });

// Role grants
export const listRoleGrants = h(async (req, res) => res.json({ grants: await grantSvc.listRoleGrants(req.params.roleId) }));
export const createRoleGrant = h(async (req, res) => res.status(201).json(await grantSvc.createRoleGrant(req.params.roleId, req.body ?? {})));
export const deleteRoleGrant = h(async (req, res) => { await grantSvc.deleteRoleGrant(req.params.id); res.status(204).end(); });

// User grants
export const listUserGrants = h(async (req, res) => res.json({ grants: await grantSvc.listUserGrants(req.params.userId) }));
export const createUserGrant = h(async (req, res) => res.status(201).json(await grantSvc.createUserGrant(req.params.userId, req.body ?? {})));
export const deleteUserGrant = h(async (req, res) => { await grantSvc.deleteUserGrant(req.params.id); res.status(204).end(); });

// Catalog: resource types
export const listResourceTypes = h(async (req, res) => res.json({ resourceTypes: await catalogSvc.listResourceTypes() }));
export const createResourceType = h(async (req, res) => res.status(201).json(await catalogSvc.createResourceType(req.body ?? {})));
export const deleteResourceType = h(async (req, res) => { await catalogSvc.deleteResourceType(req.params.id); res.status(204).end(); });

// Catalog: actions
export const listActions = h(async (req, res) => res.json({ actions: await catalogSvc.listActions() }));
export const createAction = h(async (req, res) => res.status(201).json(await catalogSvc.createAction(req.body ?? {})));
export const deleteAction = h(async (req, res) => { await catalogSvc.deleteAction(req.params.id); res.status(204).end(); });

// Decision trace (dry-run, not audited)
export const explainAccess = h(async (req, res) => {
  const { userId, action, resourceType, resource } = req.body ?? {};
  if (!userId || !action || !resourceType) {
    return res.status(400).json({ error: 'userId, action and resourceType are required' });
  }
  res.json(await explain(userId, action, resourceType, resource ?? null));
});
