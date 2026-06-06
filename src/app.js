import express from 'express';
import { authRoutes } from './routes/auth.routes.js';
import { meRoutes } from './routes/me.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { assetRoutes } from './routes/asset.routes.js';
import { workOrderRoutes } from './routes/workorder.routes.js';
import { errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.use('/auth', authRoutes);
  app.use('/me', meRoutes);
  app.use('/admin', adminRoutes);
  app.use('/assets', assetRoutes);
  app.use('/work-orders', workOrderRoutes);

  app.use(errorHandler);
  return app;
}
