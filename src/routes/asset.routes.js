import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { tenantContext } from '../middleware/tenant-context.js';
import { requirePermission, requireOwnership } from '../middleware/authorize.js';
import * as c from '../controllers/asset.controller.js';
import { findAsset } from '../services/asset.service.js';

export const assetRoutes = Router();

const load = (req) => findAsset(req.params.id);

assetRoutes.use(authenticate, tenantContext);

assetRoutes.get('/', requirePermission('asset', 'read'), c.listAssets);
assetRoutes.post('/', requirePermission('asset', 'create'), c.createAsset);
assetRoutes.get('/:id', requireOwnership('asset', 'read', load), c.getAsset);
assetRoutes.patch('/:id', requireOwnership('asset', 'update', load), c.updateAsset);
assetRoutes.post('/:id/dispose', requireOwnership('asset', 'dispose', load), c.disposeAsset);
