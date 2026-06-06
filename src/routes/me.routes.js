import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { listPermissions } from '../services/authorize.service.js';
import { buildMenu } from '../services/menu.service.js';
import { store } from '../db/store.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    roles: store.getUserRoleIds(req.user.id),
    attributes: req.user.attributes,
  });
});

// Flattened permission list (role hierarchy resolved) — handy for the client
// to enable/disable buttons. The server still enforces; this is convenience.
router.get('/permissions', (req, res) => {
  res.json({ permissions: listPermissions(req.user) });
});

// The server-filtered navigation tree. The frontend renders this verbatim.
router.get('/menu', (req, res) => {
  res.json({ menu: buildMenu(req.user) });
});

export default router;
