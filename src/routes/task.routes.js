import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { tenantContext } from '../middleware/tenant-context.js';
import { requirePermission, requireOwnership } from '../middleware/authorize.js';
import * as c from '../controllers/task.controller.js';
import { findTask } from '../services/task.service.js';

export const taskRoutes = Router();

const load = (req) => findTask(req.params.id);

taskRoutes.use(authenticate, tenantContext);

taskRoutes.get('/', requirePermission('task', 'read'), c.listTasks);
taskRoutes.post('/', requirePermission('task', 'create'), c.createTask);
taskRoutes.get('/:id', requireOwnership('task', 'read', load), c.getTask);
taskRoutes.patch('/:id', requireOwnership('task', 'update', load), c.updateTask);
taskRoutes.post('/:id/complete', requireOwnership('task', 'complete', load), c.completeTask);
