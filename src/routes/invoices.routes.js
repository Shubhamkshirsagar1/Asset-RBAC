import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, requireOwnership } from '../middleware/authorize.js';
import { store } from '../db/store.js';
import { can } from '../services/authorize.service.js';

const router = Router();
router.use(authenticate);

// List: users with :any see all; :own-only users see just theirs.
router.get('/', requirePermission('invoices:read:own'), (req, res) => {
  const all = store.listInvoices();
  const visible = can(req.user, 'invoices:read:any')
    ? all
    : all.filter((i) => i.ownerId === req.user.id);
  res.json({ invoices: visible });
});

// Read one — ownership-aware.
router.get(
  '/:id',
  requireOwnership('invoices:read:own', (req) => store.findInvoiceById(req.params.id)),
  (req, res) => res.json({ invoice: req.resource })
);

// Update one — ownership-aware. :any holders can edit anyone's.
router.patch(
  '/:id',
  requireOwnership('invoices:update:own', (req) => store.findInvoiceById(req.params.id)),
  (req, res) => {
    Object.assign(req.resource, { amount: req.body?.amount ?? req.resource.amount });
    res.json({ invoice: req.resource });
  }
);

// Approve — requires the :any permission outright (no ownership concept).
router.post(
  '/:id/approve',
  requirePermission('invoices:approve:any'),
  (req, res) => {
    const inv = store.findInvoiceById(req.params.id);
    if (!inv) return res.status(404).json({ error: 'not found' });
    inv.status = 'approved';
    res.json({ invoice: inv });
  }
);

export default router;
