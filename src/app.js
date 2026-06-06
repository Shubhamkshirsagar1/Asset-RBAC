import express from 'express';
import authRoutes from './routes/auth.routes.js';
import meRoutes from './routes/me.routes.js';
import invoiceRoutes from './routes/invoices.routes.js';
import adminRbacRoutes from './routes/admin.rbac.routes.js';
import { errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', authRoutes);
  app.use('/me', meRoutes);
  app.use('/invoices', invoiceRoutes);
  app.use('/admin', adminRbacRoutes);

  app.use(errorHandler);
  return app;
}
