import { createApp } from './app.js';
import { config } from './config.js';
import { sequelize } from './db/index.js';

async function main() {
  await sequelize.authenticate();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`RBAC API listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
