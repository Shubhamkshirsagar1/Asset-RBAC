import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { tenantContext } from '../middleware/tenant-context.js';
import { requirePermission, requireOwnership } from '../middleware/authorize.js';
import * as c from '../controllers/workorder.controller.js';
import { findWorkOrder } from '../services/workorder.service.js';

export const workOrderRoutes = Router();

const load = (req) => findWorkOrder(req.params.id);

workOrderRoutes.use(authenticate, tenantContext);

workOrderRoutes.get('/', requirePermission('work_order', 'read'), c.listWorkOrders);
workOrderRoutes.post('/', requirePermission('work_order', 'create'), c.createWorkOrder);
workOrderRoutes.get('/:id', requireOwnership('work_order', 'read', load), c.getWorkOrder);
workOrderRoutes.post('/:id/assign', requireOwnership('work_order', 'assign', load), c.assignWorkOrder);
workOrderRoutes.post('/:id/approve', requireOwnership('work_order', 'approve', load), c.approveWorkOrder);
