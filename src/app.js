import express from 'express';
import { authRoutes } from './routes/auth.routes.js';
import { authenticate } from './middleware/auth.js';
import { tenantContext } from './middleware/tenant-context.js';
import { errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.use('/auth', authRoutes);

  // Protected probe: confirms auth + tenant context wiring end to end.
  app.get('/me/context', authenticate, tenantContext, (req, res) => {
    res.json({ userId: req.user.userId, tenantId: req.user.tenantId });
  });

  app.use(errorHandler);
  return app;
}
