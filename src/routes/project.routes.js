import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { tenantContext } from '../middleware/tenant-context.js';
import { requirePermission, requireOwnership } from '../middleware/authorize.js';
import * as c from '../controllers/project.controller.js';
import { findProject } from '../services/project.service.js';

export const projectRoutes = Router();

const load = (req) => findProject(req.params.id);

projectRoutes.use(authenticate, tenantContext);

projectRoutes.get('/', requirePermission('project', 'read'), c.listProjects);
projectRoutes.post('/', requirePermission('project', 'create'), c.createProject);
projectRoutes.get('/:id', requireOwnership('project', 'read', load), c.getProject);
projectRoutes.patch('/:id', requireOwnership('project', 'update', load), c.updateProject);
