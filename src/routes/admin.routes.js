import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { tenantContext } from '../middleware/tenant-context.js';
import { requirePermission } from '../middleware/authorize.js';
import * as c from '../controllers/admin.controller.js';

export const adminRoutes = Router();

// Every admin route requires an authenticated user, in tenant scope, with rbac:manage.
adminRoutes.use(authenticate, tenantContext, requirePermission('rbac', 'manage'));

// Roles
adminRoutes.get('/roles', c.listRoles);
adminRoutes.post('/roles', c.createRole);
adminRoutes.patch('/roles/:id', c.updateRole);
adminRoutes.delete('/roles/:id', c.deleteRole);

// Role grants
adminRoutes.get('/roles/:roleId/grants', c.listRoleGrants);
adminRoutes.post('/roles/:roleId/grants', c.createRoleGrant);
adminRoutes.delete('/grants/:id', c.deleteRoleGrant);

// User-role assignment
adminRoutes.get('/users/:userId/roles', c.listUserRoles);
adminRoutes.post('/users/:userId/roles', c.assignRole);
adminRoutes.delete('/users/:userId/roles/:roleId', c.removeRole);

// User grants
adminRoutes.get('/users/:userId/grants', c.listUserGrants);
adminRoutes.post('/users/:userId/grants', c.createUserGrant);
adminRoutes.delete('/user-grants/:id', c.deleteUserGrant);

// Pages
adminRoutes.get('/pages', c.listPages);
adminRoutes.post('/pages', c.createPage);
adminRoutes.patch('/pages/:id', c.updatePage);
adminRoutes.delete('/pages/:id', c.deletePage);
adminRoutes.get('/roles/:roleId/pages', c.listRolePages);
adminRoutes.put('/roles/:roleId/pages/:pageId', c.setRolePage);

// Catalog
adminRoutes.get('/resource-types', c.listResourceTypes);
adminRoutes.post('/resource-types', c.createResourceType);
adminRoutes.delete('/resource-types/:id', c.deleteResourceType);
adminRoutes.get('/actions', c.listActions);
adminRoutes.post('/actions', c.createAction);
adminRoutes.delete('/actions/:id', c.deleteAction);

// Decision trace
adminRoutes.post('/explain', c.explainAccess);
