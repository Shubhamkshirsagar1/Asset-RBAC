import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { tenantContext } from '../middleware/tenant-context.js';
import {
  getMeHandler, getPermissionsHandler, getContextHandler, getMenuHandler,
} from '../controllers/me.controller.js';

export const meRoutes = Router();

// All /me routes require an authenticated user inside their tenant scope.
meRoutes.use(authenticate, tenantContext);

meRoutes.get('/', getMeHandler);
meRoutes.get('/context', getContextHandler);
meRoutes.get('/permissions', getPermissionsHandler);
meRoutes.get('/menu', getMenuHandler);
