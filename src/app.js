import express from 'express';
import { authRoutes } from './routes/auth.routes.js';
import { meRoutes } from './routes/me.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { assetRoutes } from './routes/asset.routes.js';
import { workOrderRoutes } from './routes/workorder.routes.js';
import { projectRoutes } from './routes/project.routes.js';
import { taskRoutes } from './routes/task.routes.js';
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
  app.use('/projects', projectRoutes);
  app.use('/tasks', taskRoutes);

  app.use(errorHandler);
  return app;
}
